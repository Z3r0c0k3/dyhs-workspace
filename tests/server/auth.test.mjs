import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { Store, digest } from '../../apps/api/store.mjs';
import { connectOidc } from '../../apps/api/oidc.mjs';
import { createApp } from '../../apps/api/server.mjs';
import { createIdentity } from '../../apps/api/identity.mjs';
import { validatePolicy } from '../../apps/api/config.mjs';

test('OIDC signature, session, CSRF, scopes and durable mutation idempotency', async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to an isolated PostgreSQL database');
  const store = new Store(process.env.TEST_DATABASE_URL);
  await store.init();
  // Explicit opt-in database only; never read production DATABASE_URL in tests.
  await store.pool.query('TRUNCATE workspace_auth_transactions, workspace_sessions, workspace_admin_operations');
  t.after(() => store.close());
  const config = {
    issuer: 'https://auth.example/application/o/workspace/', authOrigin: 'https://auth.example',
    publicUrl: 'https://workspace.example', redirectUri: 'https://workspace.example/auth/callback',
    clientId: 'test-client', clientSecret: 'test-client-secret', sessionSeconds: 900,
    apiToken: 'test-api-token', userPath: 'workspace', groupIds: [], adminWrites: true, flows: { password: null, passkey: null, mfa: null },
    policy: validatePolicy({ subjects: [{ sub: 'admin-sub', permissions: ['identity.users.read', 'identity.users.create', 'identity.groups.read', 'identity.groups.create'] }] }),
  };
  assert.throws(() => validatePolicy({ subjects: [{ sub: 'a', permissions: ['superuser'] }] }));
  assert.throws(() => validatePolicy({ subjects: [{ sub: 'a', permissions: [] }, { sub: 'a', permissions: [] }] }));
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const authorization = new Map();
  let tokenCalls = 0;
  const oidc = await connectOidc(config, async (url, init) => {
    const path = new URL(url).pathname;
    if (path.includes('.well-known/')) return Response.json({ issuer: config.issuer, authorization_endpoint: `${config.authOrigin}/authorize`, token_endpoint: `${config.authOrigin}/token`, jwks_uri: `${config.authOrigin}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_post'], code_challenge_methods_supported: ['S256'] });
    if (path === '/jwks') return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' }] });
    assert.equal(path, '/token'); tokenCalls++;
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('client_secret'), config.clientSecret);
    assert.equal(body.get('redirect_uri'), config.redirectUri);
    const record = authorization.get(body.get('code'));
    assert.ok(record);
    assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), record.params.get('code_challenge'));
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: config.issuer, aud: config.clientId, sub: record.sub || 'admin-sub', iat: now, exp: now + 300, auth_time: now, nonce: record.params.get('nonce'), name: '테스트 사용자', email: 'member@workspace.example', email_verified: true, groups: ['admin'], ...record.claims };
    const payload = `${b64({ alg: 'RS256', kid: 'test-key' })}.${b64(claims)}`;
    const token = `${payload}.${sign('RSA-SHA256', Buffer.from(payload), record.badSignature ? wrongKey : privateKey).toString('base64url')}`;
    return Response.json({ token_type: 'Bearer', access_token: 'test-access-token', expires_in: 300, id_token: token });
  });
  const upstream = [];
  let failCreation = false;
  const identity = createIdentity(config, async (url, init) => {
    assert.equal(new URL(url).origin, config.authOrigin);
    assert.equal(init.headers.Authorization, 'Bearer test-api-token');
    assert.equal(init.redirect, 'error');
    upstream.push({ url: String(url), ...init });
    if (init.method === 'POST') {
      if (failCreation) throw new Error('token=do-not-leak');
      return Response.json({ pk: new URL(url).pathname.includes('groups') ? 'ba64178d-0e4b-4888-b135-0f6bbfd1f52f' : 12 }, { status: 201 });
    }
    if (new URL(url).pathname.includes('groups')) return Response.json({ pk: 'ba64178d-0e4b-4888-b135-0f6bbfd1f52f', name: '일반 그룹', is_superuser: false });
    return Response.json({ results: [
      { pk: 1, name: 'Allowed', username: 'member', email: 'member@workspace.example', path: 'workspace', type: 'internal', is_superuser: false, is_active: true, attributes: { secret: 'must-not-leak' } },
      { pk: 2, name: 'Other path', path: 'other', type: 'internal', is_superuser: false },
      { pk: 3, name: 'Privileged', path: 'workspace', type: 'internal', is_superuser: true },
      { pk: 4, name: 'Service', path: 'workspace', type: 'service_account', is_superuser: false },
    ], pagination: { next: 0 } });
  });
  const app = createApp({ config, store, oidc, identity });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, init = {}) => fetch(`${origin}${path}`, { ...init, redirect: 'manual' });
  async function start(record = {}) {
    const response = await request('/auth/login', { headers: { Host: 'attacker.example', 'X-Forwarded-Host': 'attacker.example' } });
    const params = new URL(response.headers.get('location')).searchParams;
    assert.equal(params.get('redirect_uri'), config.redirectUri); assert.equal(params.get('code_challenge_method'), 'S256');
    const code = randomUUID(); authorization.set(code, { params, ...record });
    return { cookie: response.headers.getSetCookie()[0].split(';')[0], path: `/auth/callback?code=${code}&state=${params.get('state')}` };
  }
  async function login(record = {}) {
    const begin = await start(record);
    return request(begin.path, { headers: { Cookie: begin.cookie } });
  }
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await request('/api/admin/users', { headers: { 'X-Role': 'platform_admin' } })).status, 401);
  const begin = await start();
  const before = tokenCalls;
  assert.match((await request(begin.path)).headers.get('location'), /login_failed/);
  assert.match((await request(begin.path.replace(/state=.*/, 'state=wrong'), { headers: { Cookie: begin.cookie } })).headers.get('location'), /login_failed/);
  assert.equal(tokenCalls, before);
  assert.match((await request(begin.path, { headers: { Cookie: begin.cookie } })).headers.get('location'), /login_failed/);
  for (const record of [{ claims: { nonce: 'wrong' } }, { claims: { iss: 'https://evil.example' } }, { claims: { aud: 'other' } }, { claims: { exp: 1 } }, { claims: { auth_time: 1 } }, { badSignature: true }]) {
    const response = await login(record);
    assert.match(response.headers.get('location'), /login_failed/, JSON.stringify(record));
    assert.ok(!response.headers.getSetCookie().some(value => value.startsWith('__Host-dyhs_session=')));
  }
  const success = await login(); assert.equal(success.headers.get('location'), '/');
  const sessionHeader = success.headers.getSetCookie().find(value => value.startsWith('__Host-dyhs_session='));
  assert.match(sessionHeader, /HttpOnly/); assert.match(sessionHeader, /Secure/); assert.match(sessionHeader, /SameSite=Lax/); assert.doesNotMatch(sessionHeader, /Domain=/);
  const session = sessionHeader.split(';')[0]; const sessionId = session.split('=')[1];
  const me = await (await request('/api/me', { headers: { Cookie: session } })).json();
  assert.equal(me.mailbox, null); assert.equal(me.displayName, '테스트 사용자'); assert.ok(me.permissions.includes('identity.users.read'));
  assert.doesNotMatch(JSON.stringify(me), /test-access-token|test-client-secret|test-api-token/);
  const dbRow = (await store.pool.query('SELECT id FROM workspace_sessions')).rows[0];
  assert.equal(dbRow.id, digest(sessionId)); assert.notEqual(dbRow.id, sessionId);
  const secondStore = new Store(process.env.TEST_DATABASE_URL);
  assert.equal((await secondStore.session(sessionId)).sub, 'admin-sub'); await secondStore.close();
  const userSession = (await login({ sub: 'different-sub-same-email' })).headers.getSetCookie().find(value => value.startsWith('__Host-dyhs_session=')).split(';')[0];
  const calls = upstream.length;
  assert.equal((await request('/api/admin/users', { headers: { Cookie: userSession, 'X-Role': 'platform_admin' } })).status, 403);
  assert.equal(upstream.length, calls);
  assert.equal((await (await request('/api/me', { headers: { Cookie: userSession } })).json()).permissions.length, 0);
  const users = await (await request('/api/admin/users', { headers: { Cookie: session } })).json();
  assert.equal(users.items.length, 1); assert.equal(users.hasNext, false); assert.doesNotMatch(JSON.stringify(users), /must-not-leak|Privileged|Service/);
  const write = (path, body, headers = {}) => request(path, { method: 'POST', headers: { Cookie: session, Origin: config.publicUrl, 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken, 'Idempotency-Key': randomUUID(), ...headers }, body: JSON.stringify(body) });
  assert.equal((await write('/api/logout', {}, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await write('/api/logout', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await write('/api/admin/users', { username: 'new', name: '새 사용자', email: 'new@workspace.example', is_superuser: true })).status, 400);
  const body = { username: 'new', name: '새 사용자', email: 'new@workspace.example' }; const key = randomUUID();
  const requests = await Promise.all([write('/api/admin/users', body, { 'Idempotency-Key': key }), write('/api/admin/users', body, { 'Idempotency-Key': key })]);
  assert.ok(requests.some(response => response.status === 201));
  assert.equal(upstream.filter(call => call.method === 'POST').length, 1);
  const sent = JSON.parse(upstream.find(call => call.method === 'POST').body);
  assert.equal(sent.is_active, false); assert.deepEqual(sent.groups, []); assert.equal(sent.path, 'workspace');
  assert.equal((await write('/api/admin/users', body, { 'Idempotency-Key': key })).status, 200);
  assert.equal((await write('/api/admin/users', { ...body, username: 'changed' }, { 'Idempotency-Key': key })).status, 409);
  assert.equal((await write('/api/admin/groups', { name: 'New group' })).status, 201);
  assert.equal((await (await request('/api/admin/groups', { headers: { Cookie: session } })).json()).items.length, 1);
  failCreation = true; const failedKey = randomUUID();
  assert.equal((await write('/api/admin/users', body, { 'Idempotency-Key': failedKey })).status, 502);
  const retry = await write('/api/admin/users', body, { 'Idempotency-Key': failedKey });
  assert.equal(retry.status, 409); assert.equal((await retry.json()).status, 'unknown');
  config.adminWrites = false; assert.equal((await write('/api/admin/groups', { name: 'Blocked' })).status, 503);
  const saved = config.policy.subjects[0].permissions; config.policy.subjects[0].permissions = [];
  assert.equal((await request('/api/admin/users', { headers: { Cookie: session } })).status, 403); config.policy.subjects[0].permissions = saved;
  assert.equal((await write('/api/logout', {})).status, 204);
  assert.equal((await request('/api/me', { headers: { Cookie: session } })).status, 401);
  await store.pool.query("UPDATE workspace_sessions SET expires_at=now() - interval '1 second'");
  assert.equal((await request('/api/me', { headers: { Cookie: userSession } })).status, 401);
  assert.equal((await request('/.env')).status, 404);
});
