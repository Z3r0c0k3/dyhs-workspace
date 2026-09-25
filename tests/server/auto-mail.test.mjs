import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createAutoMail, openCredential } from '../../apps/api/auto-mail.mjs';
import { createMail } from '../../apps/api/mail.mjs';
import { Store } from '../../apps/api/store.mjs';

test('automatic mailbox binding, encrypted credentials, restart/retry, revocation and IMAP/SMTP', async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set an isolated TEST_DATABASE_URL');
  const store = new Store(process.env.TEST_DATABASE_URL); await store.init(); t.after(() => store.close());
  await store.pool.query('TRUNCATE workspace_mail_bindings');
  const config = { issuer: 'https://auth.example/issuer', mail: { mode: 'sso-auto', accounts: [], host: 'mail.workspace.example', idSecret: 'a'.repeat(64), writes: true, auto: { apiUrl: 'https://mail.workspace.example', apiKey: 'test-secret', credentialKey: 'b'.repeat(64), domains: ['workspace.example'] } } };
  const session = (sub, address = `${sub}@workspace.example`) => ({ issuer: config.issuer, sub, profile: { mailboxClaim: address } });
  const member = session('member');
  let apps = [], created = 0, calls = 0, failure = '', enabled = true;
  const passwords = new Map();
  const upstream = async (url, init) => {
    calls++; assert.equal(new URL(url).origin, config.mail.auto.apiUrl);
    assert.equal(init.headers['X-API-Key'], 'test-secret'); assert.equal(init.redirect, 'error');
    if (init.method === 'POST') {
      created++; const body = JSON.parse(init.body);
      assert.deepEqual(body.protocols, ['imap_access', 'smtp_access']); assert.equal(body.app_passwd, body.app_passwd2);
      if (failure === 'before') throw Error('token=never-leak');
      passwords.set(body.username, body.app_passwd);
      apps.push({ id: String(created), name: body.app_name, mailbox: body.username, active: 1, imap_access: 1, smtp_access: 1, password: 'server-hash-never-return' });
      if (failure === 'after') throw Error('response lost');
      return Response.json([{ type: 'success', msg: 'app_passwd_added' }]);
    }
    const address = decodeURIComponent(url.split('/').at(-1));
    return Response.json(url.includes('/get/mailbox/') ? { username: address, active: enabled ? 1 : 0 } : apps.filter(app => app.mailbox === address));
  };
  let auto = createAutoMail(config, store, upstream);
  await assert.rejects(auto.ensure({ ...member, profile: { email: member.profile.mailboxClaim, email_verified: true } }), { code: 'MAIL_CLAIM_REQUIRED' });
  await assert.rejects(auto.ensure(session('outsider', 'other@elsewhere.example')), { code: 'MAIL_DOMAIN_DENIED' });
  await assert.rejects(auto.ensure({ ...member, issuer: 'https://evil.example' }), { code: 'MAIL_CLAIM_REQUIRED' });
  assert.equal(calls, 0);
  enabled = false; await assert.rejects(auto.ensure(member), { code: 'MAILBOX_UNAVAILABLE' }); assert.equal(created, 0); enabled = true;
  await auto.ensure(member);
  const row = (await store.pool.query('SELECT * FROM workspace_mail_bindings WHERE subject=$1', [member.sub])).rows[0];
  assert.equal(row.state, 'active'); assert.ok(!JSON.stringify(row).includes(passwords.get(row.mailbox)));
  assert.equal(openCredential(config.mail.auto.credentialKey, [member.issuer, member.sub, row.mailbox], row.ciphertext), passwords.get(row.mailbox));
  assert.throws(() => openCredential(config.mail.auto.credentialKey, [member.issuer, 'other', row.mailbox], row.ciphertext));
  auto = createAutoMail(config, store, upstream); await auto.ensure(member); assert.equal(created, 1);
  assert.deepEqual(await auto.status(member), { state: 'active', address: 'member@workspace.example' });
  await assert.rejects(auto.ensure(session('other', 'member@workspace.example')), { code: 'MAIL_IDENTITY_CONFLICT' });
  await assert.rejects(auto.ensure(session('member', 'other@workspace.example')), { code: 'MAIL_IDENTITY_CONFLICT' });
  let sent = 0, copied = 0;
  class Client extends EventEmitter {
    constructor(options) { super(); assert.equal(options.auth.user, 'member@workspace.example'); assert.equal(options.auth.pass, passwords.get(options.auth.user)); }
    async connect() {} close() {}
    async list() { return [{ path: 'INBOX', name: 'Inbox', flags: new Set() }, { path: 'Sent', name: 'Sent', specialUse: '\\Sent', flags: new Set() }]; }
    async append() { copied++; return { uid: 1 }; }
  }
  const mail = createMail(config, store, { accountResolver: auto.account, clientFactory: options => new Client(options), transportFactory: options => {
    assert.equal(options.auth.pass, passwords.get('member@workspace.example'));
    return { async sendMail(input) { sent++; assert.equal(input.envelope.from, 'member@workspace.example'); return { accepted: ['recipient@workspace.example'], rejected: [] }; }, close() {} };
  } });
  assert.equal((await mail.folders(member))[0].id, 'INBOX');
  assert.equal((await mail.send(member, randomUUID(), { to: ['recipient@workspace.example'], subject: 'SSO 발송', text: '자동 연결' })).status, 'completed');
  assert.equal(sent, 1); assert.equal(copied, 1);
  enabled = false; await assert.rejects(mail.folders(member), { code: 'MAILBOX_UNAVAILABLE' }); enabled = true;
  const concurrent = await Promise.allSettled([auto.ensure(session('concurrent')), auto.ensure(session('concurrent'))]);
  assert.ok(concurrent.some(result => result.status === 'fulfilled')); assert.equal(created, 2);
  failure = 'after'; await assert.rejects(auto.ensure(session('recover')), { code: 'MAIL_CONNECT_UNAVAILABLE' });
  failure = ''; await auto.ensure(session('recover')); assert.equal(created, 3);
  failure = 'before'; await assert.rejects(auto.ensure(session('uncertain')), { code: 'MAIL_CONNECT_UNAVAILABLE' });
  failure = ''; await assert.rejects(auto.ensure(session('uncertain')), { code: 'MAIL_CONNECT_REVIEW' }); assert.equal(created, 4);
  apps = apps.filter(app => app.mailbox !== 'member@workspace.example');
  await assert.rejects(auto.ensure(member), { code: 'MAIL_CONNECTION_REVOKED' });
  await assert.rejects(auto.ensure(member), { code: 'MAIL_CONNECTION_REVOKED' });
  await assert.rejects(mail.folders(member), { code: 'MAIL_NOT_CONNECTED' }); assert.equal(created, 4);
});
