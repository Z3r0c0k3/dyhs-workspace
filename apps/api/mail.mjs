import { createHmac, timingSafeEqual } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { htmlToText } from 'html-to-text';
import { HttpError } from './identity.mjs';
import { digest } from './store.mjs';

const maxSource = 20 * 1024 * 1024;
const missing = () => new HttpError(404, 'MAIL_NOT_FOUND', '메일을 찾을 수 없습니다.');
export function mailId(secret, owner, folder, validity, uid) {
  const payload = Buffer.from(JSON.stringify([owner, folder, String(validity), uid])).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function readMailId(secret, owner, value) {
  if (typeof value !== 'string' || value.length > 2048) throw missing();
  const [payload, signature, extra] = value.split('.');
  const expected = createHmac('sha256', secret).update(payload || '').digest('base64url');
  if (extra || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw missing();
  let decoded;
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw missing(); }
  if (!Array.isArray(decoded) || decoded.length !== 4 || decoded[0] !== owner || typeof decoded[1] !== 'string' || !/^\d+$/.test(decoded[2]) || !Number.isSafeInteger(decoded[3]) || decoded[3] < 1) throw missing();
  return { folder: decoded[1], validity: decoded[2], uid: decoded[3] };
}

export function outgoing(body) {
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !['to', 'cc', 'subject', 'text', 'attachments'].includes(key))) throw new HttpError(400, 'INVALID_MAIL', '메일 입력 항목을 확인해 주세요.');
  const address = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  for (const key of ['to', 'cc']) if (!Array.isArray(body[key] || []) || (body[key] || []).some(value => typeof value !== 'string' || value.length > 254 || !address.test(value))) throw new HttpError(400, 'INVALID_RECIPIENT', '받는 사람 이메일 주소를 확인해 주세요.');
  if (!body.to?.length || body.to.length + (body.cc?.length || 0) > 50) throw new HttpError(400, 'INVALID_RECIPIENT', '받는 사람은 1~50명까지 입력할 수 있습니다.');
  if (typeof body.subject !== 'string' || body.subject.length > 250 || /[\r\n\x00]/.test(body.subject) || typeof body.text !== 'string' || body.text.length > 1000000) throw new HttpError(400, 'INVALID_MAIL', '제목과 본문 길이를 확인해 주세요.');
  const attachments = body.attachments || [];
  if (!Array.isArray(attachments) || attachments.length > 10) throw new HttpError(400, 'INVALID_ATTACHMENT', '첨부 파일은 10개까지 보낼 수 있습니다.');
  let total = 0;
  for (const file of attachments) {
    if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 150 || /[\/\\\x00-\x1f]/.test(file.name) || /\.(exe|bat|cmd|com|scr|ps1|js|vbs|sh|html?|svg)$/i.test(file.name) || typeof file.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) || Buffer.from(file.data, 'base64').toString('base64') !== file.data) throw new HttpError(400, 'INVALID_ATTACHMENT', '첨부 이름·종류·인코딩을 확인해 주세요.');
    total += Buffer.byteLength(file.data, 'base64');
  }
  if (total > 10 * 1024 * 1024) throw new HttpError(413, 'ATTACHMENT_TOO_LARGE', '첨부 합계는 10 MB까지 보낼 수 있습니다.');
  return { to: body.to, cc: body.cc || [], subject: body.subject, text: body.text, attachments: attachments.map(file => ({ name: file.name, data: file.data })) };
}

export function createMail(config, store, { clientFactory = options => new ImapFlow(options), transportFactory = options => nodemailer.createTransport(options) } = {}) {
  let running = 0;
  const users = new Set();
  function account(session) {
    const found = config.mail?.accounts.find(item => session.issuer === config.issuer && item.sub === session.sub);
    if (!found) throw new HttpError(503, 'MAIL_NOT_CONNECTED', '본인 메일함이 아직 연결되지 않았습니다.');
    return { ...found, owner: digest(`${session.issuer}\n${session.sub}\n${found.address}`) };
  }
  async function use(session, action) {
    const user = account(session);
    if (running >= 2 || users.has(user.owner)) throw new HttpError(429, 'MAIL_BUSY', '메일 작업을 처리 중입니다. 잠시 후 다시 시도해 주세요.');
    running++; users.add(user.owner);
    const client = clientFactory({ host: config.mail.host, port: 993, secure: true, auth: { user: user.address, pass: user.password }, logger: false, disableAutoIdle: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } });
    client.on('error', () => {});
    try { await client.connect(); return await action(client, user); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(502, 'MAIL_UNAVAILABLE', '메일 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { client.close(); users.delete(user.owner); running--; }
  }
  async function selected(client, path, action) {
    if (typeof path !== 'string' || !path || path.length > 512 || /[\x00-\x1f]/.test(path)) throw missing();
    const folders = await client.list();
    if (!folders.some(folder => folder.path === path && !folder.flags.has('\\Noselect'))) throw missing();
    const lock = await client.getMailboxLock(path);
    try { return await action(); } finally { lock.release(); }
  }
  async function message(client, user, id) {
    const info = readMailId(config.mail.idSecret, user.owner, id);
    return selected(client, info.folder, async () => {
      if (String(client.mailbox.uidValidity) !== info.validity) throw new HttpError(409, 'MAIL_ID_EXPIRED', '메일함이 변경되었습니다. 목록을 새로고침해 주세요.');
      const meta = await client.fetchOne(info.uid, { size: true }, { uid: true });
      if (!meta) throw missing();
      if (meta.size > maxSource) throw new HttpError(413, 'MESSAGE_TOO_LARGE', '20 MB가 넘는 메일은 기존 Dyhs Mail에서 열어 주세요.');
      const raw = await client.fetchOne(info.uid, { source: true }, { uid: true });
      if (!raw?.source || raw.source.length > maxSource) throw missing();
      const parsed = await simpleParser(raw.source, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
      if (!parsed.text && parsed.html) {
        if (parsed.html.length > 1000000) throw new HttpError(413, 'MESSAGE_TOO_LARGE', '큰 HTML 메일은 기존 Dyhs Mail에서 열어 주세요.');
        parsed.text = htmlToText(parsed.html, { selectors: [{ selector: 'img', format: 'skip' }], wordwrap: false });
      }
      return parsed;
    });
  }
  return {
    account,
    folders: session => use(session, async client => (await client.list({ statusQuery: { messages: true, unseen: true } })).filter(folder => !folder.flags.has('\\Noselect')).map(folder => ({ id: folder.path, name: folder.name, specialUse: folder.specialUse || '', unread: folder.status?.unseen || 0 }))),
    list: (session, folder, cursor, query) => use(session, (client, user) => selected(client, folder, async () => {
      if (typeof query !== 'string' || query.length > 200) throw new HttpError(400, 'INVALID_QUERY', '검색어는 200자 이내로 입력해 주세요.');
      let before = null;
      if (cursor) {
        const anchor = readMailId(config.mail.idSecret, user.owner, cursor);
        if (anchor.folder !== folder || anchor.validity !== String(client.mailbox.uidValidity)) throw new HttpError(409, 'MAIL_ID_EXPIRED', '목록을 새로고침해 주세요.');
        before = anchor.uid;
      }
      // ponytail: IMAP SEARCH returns matching UIDs; use indexed paging for very large mailboxes.
      const ids = await client.search({ ...(query ? { text: query } : { all: true }), ...(before ? { uid: `1:${Math.max(1, before - 1)}` } : {}) }, { uid: true });
      const sorted = (ids || []).filter(uid => !before || uid < before).sort((a, b) => b - a);
      const chosen = sorted.slice(0, 50);
      const fetched = chosen.length ? await client.fetchAll(chosen, { envelope: true, flags: true }, { uid: true }) : [];
      const items = fetched.sort((a, b) => b.uid - a.uid).map(mail => ({ id: mailId(config.mail.idSecret, user.owner, folder, client.mailbox.uidValidity, mail.uid), subject: mail.envelope?.subject || '(제목 없음)', from: mail.envelope?.from?.map(item => item.name || item.address).join(', ') || '', receivedAt: mail.envelope?.date?.toISOString() || null, unread: !mail.flags.has('\\Seen') }));
      return { items, nextCursor: sorted.length > 50 ? mailId(config.mail.idSecret, user.owner, folder, client.mailbox.uidValidity, chosen.at(-1)) : null };
    })),
    read: (session, id) => use(session, async (client, user) => {
      const parsed = await message(client, user, id);
      const addresses = header => (Array.isArray(header) ? header.flatMap(h => h.value) : header?.value || []).map(item => item.address).filter(Boolean);
      return { id, subject: parsed.subject || '(제목 없음)', from: addresses(parsed.from), to: addresses(parsed.to), cc: addresses(parsed.cc), text: parsed.text || '(텍스트 본문 없음)', attachments: parsed.attachments.map((file, index) => ({ id: String(index), filename: file.filename || 'attachment', size: file.size })) };
    }),
    attachment: (session, id, attachmentId) => use(session, async (client, user) => {
      if (!/^\d{1,3}$/.test(attachmentId)) throw missing();
      const parsed = await message(client, user, id); const file = parsed.attachments[Number(attachmentId)];
      if (!file) throw missing();
      return { filename: (file.filename || 'attachment').replace(/[\/\\\x00-\x1f\x7f]/g, '_'), content: file.content };
    }),
    mark: (session, id, action) => use(session, (client, user) => {
      if (!['mark_read', 'mark_unread'].includes(action)) throw new HttpError(400, 'INVALID_ACTION', '읽음 상태 변경만 지원합니다.');
      const info = readMailId(config.mail.idSecret, user.owner, id);
      return selected(client, info.folder, async () => {
        if (String(client.mailbox.uidValidity) !== info.validity) throw new HttpError(409, 'MAIL_ID_EXPIRED', '목록을 새로고침해 주세요.');
        if (!await client.fetchOne(info.uid, { uid: true }, { uid: true })) throw missing();
        if (!await client[action === 'mark_read' ? 'messageFlagsAdd' : 'messageFlagsRemove'](info.uid, ['\\Seen'], { uid: true })) throw new HttpError(502, 'MAIL_ACTION_FAILED', '읽음 상태를 변경하지 못했습니다.');
      });
    }),
    send: (session, key, body) => use(session, async (client, user) => {
      if (!config.mail.writes) throw new HttpError(503, 'MAIL_SEND_DISABLED', '메일 전송 연결 검증 후 사용할 수 있습니다.');
      const input = outgoing(body);
      const previous = await store.beginOperation(key, session, 'mail-send', input);
      if (previous.conflict) throw new HttpError(409, 'OPERATION_CONFLICT', '같은 작업 식별자에 다른 메일을 보낼 수 없습니다.');
      if (!previous.fresh) return { operationId: key, status: previous.status };
      let smtp;
      let submitted = false;
      let acceptedStatus = null;
      try {
        const built = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' }).sendMail({ from: user.address, to: input.to, cc: input.cc, subject: input.subject, text: input.text, messageId: `<${key}@${user.address.split('@')[1]}>`, attachments: input.attachments.map(file => ({ filename: file.name, content: Buffer.from(file.data, 'base64') })), disableFileAccess: true, disableUrlAccess: true });
        if (built.message.length > maxSource) throw new HttpError(413, 'MESSAGE_TOO_LARGE', '전체 메일 용량이 너무 큽니다.');
        smtp = transportFactory({ host: config.mail.host, port: 465, secure: true, auth: { user: user.address, pass: user.password }, logger: false, debug: false, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }, disableFileAccess: true, disableUrlAccess: true });
        // Persist before DATA: process death must not cause an automatic resend.
        await store.finishOperation(key, 'smtp_pending'); submitted = true;
        const delivery = await smtp.sendMail({ envelope: { from: user.address, to: [...input.to, ...input.cc] }, raw: built.message });
        const accepted = delivery.accepted?.length || 0;
        if (!accepted) { await store.finishOperation(key, 'rejected'); return { operationId: key, status: 'rejected' }; }
        const partial = Boolean(delivery.rejected?.length);
        acceptedStatus = partial ? 'partially_accepted' : 'sent_copy_failed';
        await store.finishOperation(key, partial ? 'partially_accepted' : 'smtp_accepted');
        const sent = (await client.list()).find(folder => folder.specialUse === '\\Sent');
        let copied = false;
        if (sent) { try { copied = Boolean(await client.append(sent.path, built.message, ['\\Seen'])); } catch { /* Preserve SMTP result; do not resend. */ } }
        const status = partial ? 'partially_accepted' : copied ? 'completed' : 'sent_copy_failed';
        await store.finishOperation(key, status);
        return { operationId: key, status };
      } catch (error) {
        const status = acceptedStatus || (submitted ? 'delivery_unknown' : 'rejected');
        await store.finishOperation(key, status);
        if (!submitted && error instanceof HttpError) throw error;
        return { operationId: key, status };
      } finally { smtp?.close(); }
    }),
  };
}
