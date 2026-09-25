import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import nodemailer from 'nodemailer';
import { createMail, mailId, readMailId, outgoing } from '../../apps/api/mail.mjs';
import { Store } from '../../apps/api/store.mjs';

test('mail ownership, MIME, UID lifetime and SMTP/Sent partial failure', async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set an isolated TEST_DATABASE_URL');
  const store = new Store(process.env.TEST_DATABASE_URL); await store.init(); t.after(() => store.close());
  const config = { issuer: 'https://auth.example/issuer', mail: { accounts: [{ sub: 'mail-user', address: 'member@workspace.example', password: 'test-app-password' }], host: 'mail.workspace.example', idSecret: 'a'.repeat(64), writes: true } };
  const session = { issuer: config.issuer, sub: 'mail-user' };
  const raw = (await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail({ from: 'sender@workspace.example', to: 'member@workspace.example', subject: '한글 메일', html: '<p>한글 본문</p><script>alert(1)</script><img src="https://tracker.example/pixel">', attachments: [{ filename: '한글 문서.txt', content: Buffer.from('한글 첨부') }] })).message;
  let validity = 42n, smtpCalls = 0, appendCalls = 0, appendFailure = false, smtpFailure = false, partial = false;
  let sentRaw;
  class Client extends EventEmitter {
    constructor(options) { super(); assert.equal(options.auth.user, 'member@workspace.example'); assert.equal(options.auth.pass, 'test-app-password'); assert.equal(options.logger, false); assert.equal(options.tls.rejectUnauthorized, true); this.mailbox = { uidValidity: validity }; }
    async connect() {}
    close() {}
    async list() { return [{ path: 'INBOX', name: '받은편지함', flags: new Set(), status: { unseen: 1 } }, { path: 'Sent', name: '보낸편지함', flags: new Set(), specialUse: '\\Sent' }]; }
    async getMailboxLock() { return { release() {} }; }
    async search() { return Array.from({ length: 52 }, (_, index) => index + 1); }
    async fetchAll(ids) { return ids.map(uid => ({ uid, envelope: { subject: '한글', from: [{ address: 'sender@workspace.example' }], date: new Date() }, flags: new Set() })); }
    async fetchOne(uid, fields) { if (uid !== 52) return false; return fields.source ? { source: raw } : { size: raw.length }; }
    async messageFlagsAdd(uid, flags) { assert.equal(uid, 52); assert.deepEqual(flags, ['\\Seen']); return true; }
    async append(_path, buffer) { appendCalls++; assert.ok(Buffer.isBuffer(buffer)); if (appendFailure) throw new Error('append failure'); return { uid: 1 }; }
  }
  const mail = createMail(config, store, { clientFactory: options => new Client(options), transportFactory: options => {
    assert.equal(options.port, 465); assert.equal(options.secure, true); assert.equal(options.tls.rejectUnauthorized, true);
    return { async sendMail(input) { smtpCalls++; sentRaw = input.raw; assert.equal(input.envelope.from, 'member@workspace.example'); if (smtpFailure) throw new Error('connection lost after DATA'); return { accepted: ['recipient@workspace.example'], rejected: partial ? ['other@workspace.example'] : [] }; }, close() {} };
  } });
  await assert.rejects(() => mail.folders({ issuer: config.issuer, sub: 'another-user' }), { code: 'MAIL_NOT_CONNECTED' });
  await assert.rejects(() => mail.folders({ issuer: 'https://other.example', sub: session.sub }), { code: 'MAIL_NOT_CONNECTED' });
  const list = await mail.list(session, 'INBOX', null, '한글'); assert.equal(list.items.length, 50); assert.ok(list.nextCursor);
  const id = list.items[0].id;
  assert.throws(() => readMailId(config.mail.idSecret, 'another-owner', id), { code: 'MAIL_NOT_FOUND' });
  await assert.rejects(() => mail.read(session, `${id}a`), { code: 'MAIL_NOT_FOUND' });
  validity = 43n; await assert.rejects(() => mail.read(session, id), { code: 'MAIL_ID_EXPIRED' }); validity = 42n;
  const body = await mail.read(session, id); assert.match(body.text, /한글 본문/); assert.doesNotMatch(body.text, /<script|<img/); assert.equal(body.attachments[0].filename, '한글 문서.txt');
  assert.equal((await mail.attachment(session, id, '0')).content.toString(), '한글 첨부');
  await assert.rejects(() => mail.attachment(session, id, '1'), { code: 'MAIL_NOT_FOUND' });
  await mail.mark(session, id, 'mark_read');
  await assert.rejects(() => mail.mark(session, id, 'trash'), { code: 'INVALID_ACTION' });
  assert.throws(() => outgoing({ to: ['a@workspace.example'], text: 'test', subject: 'line\nBcc: other@workspace.example' }), { code: 'INVALID_MAIL' });
  assert.throws(() => outgoing({ to: ['a@workspace.example'], text: 'test', subject: '', from: 'other@workspace.example' }), { code: 'INVALID_MAIL' });
  assert.throws(() => outgoing({ to: ['a@workspace.example'], text: '', subject: '', attachments: [{ name: 'run.exe', data: 'YQ==' }] }), { code: 'INVALID_ATTACHMENT' });
  const input = { to: ['recipient@workspace.example'], cc: [], subject: '보내기', text: '한글 발송 본문', attachments: [{ name: '문서.txt', data: Buffer.from('첨부').toString('base64') }] };
  let key = randomUUID(); assert.equal((await mail.send(session, key, input)).status, 'completed'); assert.equal(smtpCalls, 1); assert.equal(appendCalls, 1); assert.match(sentRaw.toString(), /Message-ID:/);
  assert.equal((await mail.send(session, key, input)).status, 'completed'); assert.equal(smtpCalls, 1);
  await assert.rejects(() => mail.send(session, key, { ...input, subject: 'changed' }), { code: 'OPERATION_CONFLICT' });
  assert.equal(await store.mailOperation(key, { ...session, sub: 'other' }), null);
  appendFailure = true; key = randomUUID(); assert.equal((await mail.send(session, key, input)).status, 'sent_copy_failed');
  await mail.send(session, key, input); assert.equal(smtpCalls, 2);
  smtpFailure = true; key = randomUUID(); assert.equal((await mail.send(session, key, input)).status, 'delivery_unknown');
  await mail.send(session, key, input); assert.equal(smtpCalls, 3);
  smtpFailure = false; partial = true; assert.equal((await mail.send(session, randomUUID(), input)).status, 'partially_accepted');
  config.mail.writes = false; await assert.rejects(() => mail.send(session, randomUUID(), input), { code: 'MAIL_SEND_DISABLED' });
  const owner = mail.account(session).owner;
  await assert.rejects(() => mail.read(session, mailId(config.mail.idSecret, owner, 'Other users', 42, 52)), { code: 'MAIL_NOT_FOUND' });
});
