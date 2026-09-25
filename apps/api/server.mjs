import express from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, grants } from './config.mjs';
import { Store, digest } from './store.mjs';
import { connectOidc } from './oidc.mjs';
import { createIdentity, creationInput, HttpError } from './identity.mjs';
import { createMail } from './mail.mjs';

const random = () => randomBytes(32).toString('base64url');
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
const sessionCookie = '__Host-dyhs_session';
const transactionCookie = '__Host-dyhs_oidc';
function cookie(req, name) {
  const entries = (req.headers.cookie || '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`));
  if (entries.length !== 1) return null;
  const value = entries[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
function equal(a, b) { return typeof a === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }

export function createApp({ config, store, oidc, identity, mail = createMail(config, store), dist = fileURLToPath(new URL('../../dist-live/', import.meta.url)) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  // ponytail: single API replica; use a shared rate limiter before horizontal scaling.
  const limits = new Map();
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    req.requestId = randomUUID();
    res.set('X-Request-ID', req.requestId);
    next();
  });
  app.get('/healthz', async (_req, res) => { await store.ready(); res.json({ status: 'ok', mode: 'live' }); });
  app.use(['/auth', '/api'], (req, res, next) => {
    const now = Date.now();
    for (const [key, bucket] of limits) if (bucket.until <= now) limits.delete(key);
    const key = req.socket.remoteAddress || 'unknown';
    if (!limits.has(key)) {
      if (limits.size >= 4096) return next(new HttpError(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요.'));
      limits.set(key, { count: 0, until: now + 60000 });
    }
    if (++limits.get(key).count > 120) { res.set('Retry-After', '60'); return next(new HttpError(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요.')); }
    next();
  });
  app.get('/auth/login', async (req, res) => {
    const previous = cookie(req, transactionCookie);
    if (previous) await store.consumeTransaction(previous);
    const { url, data } = await oidc.start();
    const id = random();
    await store.transaction(id, data);
    res.cookie(transactionCookie, id, { ...cookieOptions, maxAge: 600000 });
    res.redirect(303, url);
  });
  app.get('/auth/callback', async (req, res) => {
    const id = cookie(req, transactionCookie);
    res.clearCookie(transactionCookie, cookieOptions);
    try {
      const transaction = id ? await store.consumeTransaction(id) : null;
      if (!transaction) throw new Error('No transaction');
      const url = new URL(req.originalUrl, config.publicUrl);
      const user = await oidc.complete(url, transaction);
      const old = cookie(req, sessionCookie);
      if (old) await store.logout(old);
      const session = random();
      await store.putSession(session, { issuer: config.issuer, sub: user.sub, profile: user.profile, csrf: random() }, config.sessionSeconds);
      res.cookie(sessionCookie, session, { ...cookieOptions, maxAge: config.sessionSeconds * 1000 });
      res.redirect(303, '/');
    } catch {
      res.redirect(303, '/?auth_error=login_failed');
    }
  });
  app.use('/api', async (req, _res, next) => {
    const id = cookie(req, sessionCookie);
    req.session = id ? await store.session(id) : null;
    if (!req.session || req.session.issuer !== config.issuer) throw new HttpError(401, 'SESSION_EXPIRED', '다시 로그인해 주세요.');
    req.sessionId = id;
    req.permissions = grants(config, req.session.sub);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin !== config.publicUrl || !equal(req.headers['x-csrf-token'], req.session.csrf)) throw new HttpError(403, 'CSRF_REJECTED', '요청을 확인하지 못했습니다. 페이지를 새로고침해 주세요.');
      if (!req.is('application/json')) throw new HttpError(415, 'JSON_REQUIRED', 'JSON 요청이 필요합니다.');
    }
    next();
  });
  app.use('/api/mail/send', express.json({ limit: '15mb', strict: true }));
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/api/me', (req, res) => res.json({
    id: digest(`${req.session.issuer}\n${req.session.sub}`), subject: req.session.sub,
    displayName: req.session.profile.name, email: req.session.profile.email,
    mailbox: config.mail?.accounts.find(account => account.sub === req.session.sub)?.address || null,
    roles: req.permissions.length ? ['user', 'identity_operator'] : ['user'], permissions: req.permissions,
    csrfToken: req.session.csrf, sessionSeconds: config.sessionSeconds,
    capabilities: { mail: Boolean(config.mail?.accounts.some(account => account.sub === req.session.sub)), mailSend: Boolean(config.mail?.writes && config.mail.accounts.some(account => account.sub === req.session.sub)), calendar: false, identity: Boolean(config.apiToken), identityWrites: Boolean(config.apiToken && config.adminWrites) },
    security: { ...config.flows, advanced: `${config.authOrigin}/if/user/#/settings` },
    adminUrl: `${config.authOrigin}/if/admin/`,
  }));
  app.post('/api/logout', async (req, res) => {
    await store.logout(req.sessionId);
    const transaction = cookie(req, transactionCookie);
    if (transaction) await store.consumeTransaction(transaction);
    res.clearCookie(sessionCookie, cookieOptions);
    res.clearCookie(transactionCookie, cookieOptions);
    res.status(204).end();
  });
  const authorize = permission => (req, _res, next) => {
    if (!req.permissions.includes(permission)) throw new HttpError(403, 'ACCESS_DENIED', '이 작업을 수행할 권한이 없습니다.');
    next();
  };
  for (const kind of ['users', 'groups']) {
    app.get(`/api/admin/${kind}`, authorize(`identity.${kind}.read`), async (req, res) => {
      if (req.query.page && (typeof req.query.page !== 'string' || !/^[1-9][0-9]{0,3}$/.test(req.query.page))) throw new HttpError(400, 'INVALID_PAGE', '페이지 번호를 확인해 주세요.');
      const page = Number(req.query.page || 1);
      const data = kind === 'users' ? await identity.users(page) : await identity.groups([...config.groupIds, ...await store.createdGroups()], page);
      res.json({ ...data, page });
    });
    app.post(`/api/admin/${kind}`, authorize(`identity.${kind}.create`), async (req, res) => {
      if (!config.apiToken || !config.adminWrites) throw new HttpError(503, 'WRITES_DISABLED', '관리 작업은 운영 연결 검증 후 활성화할 수 있습니다.');
      const input = creationInput(kind, req.body);
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)) throw new HttpError(400, 'INVALID_OPERATION_KEY', '작업 식별자가 필요합니다.');
      const operation = await store.beginOperation(key, req.session, kind, input);
      if (operation.conflict) throw new HttpError(409, 'OPERATION_CONFLICT', '이 식별자는 다른 작업에 사용되었습니다.');
      if (!operation.fresh) return res.status(operation.status === 'completed' ? 200 : 409).json({ operationId: key, status: operation.status, objectId: operation.objectId, message: operation.status === 'completed' ? '이미 완료된 작업입니다.' : '기존 작업 상태를 Authentik에서 확인해 주세요. 자동으로 다시 생성하지 않습니다.' });
      try {
        const objectId = await identity.create(kind, input);
        await store.finishOperation(key, 'completed', objectId);
        res.status(201).json({ operationId: key, status: 'completed', objectId });
      } catch (error) {
        // A timeout may follow an upstream commit: never automatically retry a write.
        await store.finishOperation(key, error.code === 'IDENTITY_REJECTED' ? 'rejected' : 'unknown');
        throw error;
      }
    });
  }
  app.get('/api/mail/folders', async (req, res) => res.json(await mail.folders(req.session)));
  app.get('/api/mail/operations/:id', async (req, res) => {
    if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) throw new HttpError(400, 'INVALID_OPERATION_KEY', '작업 식별자를 확인해 주세요.');
    const operation = await store.mailOperation(req.params.id, req.session);
    if (!operation) throw new HttpError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다.');
    res.json(operation);
  });
  app.get('/api/mail/messages', async (req, res) => {
    if (typeof req.query.folder !== 'string' || (req.query.cursor && typeof req.query.cursor !== 'string') || (req.query.query && typeof req.query.query !== 'string')) throw new HttpError(400, 'INVALID_QUERY', '메일 조회 항목을 확인해 주세요.');
    res.json(await mail.list(req.session, req.query.folder, req.query.cursor || null, req.query.query || ''));
  });
  app.get('/api/mail/messages/:id', async (req, res) => res.json(await mail.read(req.session, req.params.id)));
  app.get('/api/mail/messages/:id/attachments/:attachmentId', async (req, res) => {
    const file = await mail.attachment(req.session, req.params.id, req.params.attachmentId);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.filename.toWellFormed()).replace(/'/g, '%27')}`);
    res.send(file.content);
  });
  app.post('/api/mail/messages/:id/actions', async (req, res) => { await mail.mark(req.session, req.params.id, req.body?.action); res.status(204).end(); });
  app.post('/api/mail/send', async (req, res) => {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)) throw new HttpError(400, 'INVALID_OPERATION_KEY', '메일 작업 식별자가 필요합니다.');
    res.json(await mail.send(req.session, key, req.body));
  });
  app.use('/api', () => { throw new HttpError(404, 'NOT_FOUND', '지원하지 않는 API 경로입니다.'); });
  app.use(express.static(dist, { dotfiles: 'deny', etag: false, lastModified: false, redirect: false, setHeaders: res => res.setHeader('Cache-Control', 'no-store') }));
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', '페이지를 찾을 수 없습니다.')));
  app.use((error, req, res, _next) => {
    const status = error instanceof HttpError ? error.status : error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 503;
    // Log correlation IDs only; callbacks, cookies, profile data and tokens are omitted.
    if (status >= 500) console.error(JSON.stringify({ event: 'workspace_request_failed', requestId: req.requestId, code: error instanceof HttpError ? error.code : 'SERVICE_UNAVAILABLE' }));
    res.status(status).json({ code: error instanceof HttpError ? error.code : status === 413 ? 'BODY_TOO_LARGE' : status === 400 ? 'INVALID_JSON' : 'SERVICE_UNAVAILABLE', message: error instanceof HttpError ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', requestId: req.requestId });
  });
  return app;
}

async function main() {
  const config = loadConfig();
  if (process.argv.includes('--check-config')) { console.log('Workspace configuration is valid. Connection checks were not performed.'); return; }
  const index = await readFile(new URL('../../dist-live/index.html', import.meta.url), 'utf8');
  if (!index.includes('content="live"')) throw new Error('Live UI build required');
  const store = new Store(config.databaseUrl);
  await store.init();
  const oidc = await connectOidc(config);
  const app = createApp({ config, store, oidc, identity: createIdentity(config) });
  await store.cleanup();
  const cleanup = setInterval(() => store.cleanup().catch(() => console.error('workspace_cleanup_failed')), 60000).unref();
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`Workspace API listening on ${config.port}`));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    clearInterval(cleanup);
    server.close(async () => { await store.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`workspace_startup_failed: ${error.code || 'check configuration, database, live build and OIDC discovery'}`); process.exit(1); });
}
