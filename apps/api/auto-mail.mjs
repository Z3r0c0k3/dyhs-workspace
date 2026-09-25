import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { HttpError } from './identity.mjs';

const active = value => value === true || value === 1 || value === '1';
const conflict = () => new HttpError(409, 'MAIL_IDENTITY_CONFLICT', '기존 메일함 연결과 계정 정보가 다릅니다. 운영자에게 확인해 주세요.');

export function sealCredential(key, binding, password) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(binding)));
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function openCredential(key, binding, ciphertext) {
  const bytes = Buffer.from(ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(JSON.stringify(binding))); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

export function createAutoMail(config, store, fetcher = fetch) {
  const settings = config.mail.auto;
  function claim(session) {
    const value = session.profile?.mailboxClaim;
    if (session.issuer !== config.issuer || typeof value !== 'string' || value.length > 254 || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) throw new HttpError(403, 'MAIL_CLAIM_REQUIRED', '계정의 메일함 정보가 제공되지 않았습니다. 운영자에게 SSO 연결 설정을 확인해 주세요.');
    const address = value.toLowerCase();
    if (!settings.domains.includes(address.split('@')[1])) throw new HttpError(403, 'MAIL_DOMAIN_DENIED', '이 메일 도메인은 Workspace 연결 대상이 아닙니다.');
    return address;
  }
  async function request(path, body) {
    try {
      const response = await fetcher(`${settings.apiUrl}/api/v1/${path}`, { method: body ? 'POST' : 'GET', headers: { 'X-API-Key': settings.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('upstream');
      const data = await response.json();
      if (body && (!Array.isArray(data) || !data.length || data.some(entry => entry.type !== 'success'))) throw new Error('upstream');
      return data;
    } catch { throw new HttpError(502, 'MAIL_CONNECT_UNAVAILABLE', '메일함 자동 연결을 완료하지 못했습니다. 잠시 후 다시 연결해 주세요.'); }
  }
  async function mailbox(address) {
    const result = await request(`get/mailbox/${encodeURIComponent(address)}`);
    if (typeof result?.username !== 'string' || result.username.toLowerCase() !== address || !active(result.active)) throw new HttpError(403, 'MAILBOX_UNAVAILABLE', '활성화된 본인 메일함을 찾지 못했습니다. 운영자에게 확인해 주세요.');
  }
  async function apps(address) {
    const data = await request(`get/app-passwd/all/${encodeURIComponent(address)}`);
    // Mailcow returns {} for an empty list. Never expose returned password hashes/logs.
    if (data && !Array.isArray(data) && Object.keys(data).length === 0) return [];
    if (!Array.isArray(data) || data.some(row => String(row.mailbox).toLowerCase() !== address)) throw new HttpError(502, 'MAIL_CONNECT_UNAVAILABLE', '메일 서버의 연결 응답을 확인하지 못했습니다.');
    return data;
  }
  async function binding(session, db = store.pool) {
    const address = claim(session);
    const { rows: [row] } = await db.query('SELECT * FROM workspace_mail_bindings WHERE issuer=$1 AND subject=$2', [session.issuer, session.sub]);
    if (row && row.mailbox !== address) throw conflict();
    return row;
  }
  async function ensure(session) {
    const address = claim(session); // Validate before making ANY privileged API request.
    const db = await store.pool.connect();
    let locked = false;
    const lockKey = JSON.stringify([session.issuer, session.sub]);
    try {
      locked = (await db.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [lockKey])).rows[0].locked;
      if (!locked) throw new HttpError(409, 'MAIL_CONNECT_BUSY', '메일함을 연결 중입니다. 잠시 후 다시 확인해 주세요.');
      let row = await binding(session, db);
      if (row?.state === 'revoked') throw new HttpError(403, 'MAIL_CONNECTION_REVOKED', '메일 연결 권한이 해제되었습니다. 운영자에게 확인해 주세요.');
      await mailbox(address);
      if (!row) {
        const password = `Dy1!${randomBytes(32).toString('base64url')}`;
        const ciphertext = sealCredential(settings.credentialKey, [session.issuer, session.sub, address], password);
        // Commit the recovery record BEFORE calling Mailcow. Session advisory lock serializes logins.
        try {
          await db.query("INSERT INTO workspace_mail_bindings (issuer,subject,mailbox,ciphertext,app_name,state) VALUES ($1,$2,$3,$4,$5,'pending')", [session.issuer, session.sub, address, ciphertext, `dyhs-workspace-${randomUUID()}`]);
        } catch (error) { if (error.code === '23505') throw conflict(); throw error; }
        row = await binding(session, db);
      }
      let matching = (await apps(address)).filter(app => app.name === row.app_name);
      if (row.state === 'active' && (!matching.length || String(matching[0].id) !== row.app_id || !active(matching[0].active) || !active(matching[0].imap_access) || !active(matching[0].smtp_access))) {
        await db.query("UPDATE workspace_mail_bindings SET state='revoked' WHERE issuer=$1 AND subject=$2", [session.issuer, session.sub]);
        throw new HttpError(403, 'MAIL_CONNECTION_REVOKED', '메일 연결 권한이 해제되었습니다. 운영자에게 확인해 주세요.');
      }
      if (!matching.length) {
        if (row.state === 'creating') throw new HttpError(409, 'MAIL_CONNECT_REVIEW', '이전 발급 결과를 확인 중입니다. 잠시 후 다시 확인하거나 운영자에게 문의해 주세요.');
        const password = openCredential(settings.credentialKey, [session.issuer, session.sub, address], row.ciphertext);
        await db.query("UPDATE workspace_mail_bindings SET state='creating' WHERE issuer=$1 AND subject=$2", [session.issuer, session.sub]);
        await request('add/app-passwd', { username: address, app_name: row.app_name, app_passwd: password, app_passwd2: password, active: '1', protocols: ['imap_access', 'smtp_access'] });
        matching = (await apps(address)).filter(app => app.name === row.app_name);
      }
      if (matching.length !== 1 || !/^\d+$/.test(String(matching[0].id)) || !active(matching[0].active) || !active(matching[0].imap_access) || !active(matching[0].smtp_access)) throw new HttpError(409, 'MAIL_CONNECT_REVIEW', '메일 연결 결과를 운영자가 확인해야 합니다.');
      await db.query("UPDATE workspace_mail_bindings SET state='active', app_id=$3 WHERE issuer=$1 AND subject=$2", [session.issuer, session.sub, String(matching[0].id)]);
    } finally {
      try { if (locked) await db.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]); }
      finally { db.release(); }
    }
  }
  return {
    ensure,
    async status(session) {
      try {
        const row = await binding(session);
        return { state: row?.state || 'pending', address: row?.state === 'active' ? row.mailbox : null };
      } catch (error) {
        if (error instanceof HttpError) return { state: 'blocked', address: null, message: error.message };
        throw error;
      }
    },
    async account(session) {
      const row = await binding(session);
      if (row?.state !== 'active') throw new HttpError(503, 'MAIL_NOT_CONNECTED', '메일함 자동 연결을 다시 시도해 주세요.');
      await mailbox(row.mailbox);
      return { address: row.mailbox, password: openCredential(settings.credentialKey, [session.issuer, session.sub, row.mailbox], row.ciphertext) };
    },
  };
}
