import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './live-api';

type Message = { id: string; subject: string; from: string; receivedAt: string | null; unread: boolean };
type Detail = { id: string; subject: string; from: string[]; to: string[]; cc: string[]; text: string; attachments: { id: string; filename: string; size: number }[] };
const emptyDraft = { to: '', cc: '', subject: '', text: '' };
const statuses: Record<string, string> = {
  completed: '메일 서버가 전송을 수락했고 보낸편지함에 저장했습니다. 수신자에게 도착했는지는 별도 확인이 필요합니다.',
  sent_copy_failed: '전송은 수락됐지만 보낸편지함 저장에 실패했습니다. 같은 메일을 다시 보내지 마세요.',
  smtp_accepted: '메일 서버가 전송을 수락했습니다. 보낸편지함 저장 결과는 확인 중입니다. 다시 보내지 마세요.',
  partially_accepted: '일부 수신자에게만 전송이 수락됐습니다. 기존 Dyhs Mail에서 결과를 확인하고 전체 수신자에게 다시 보내지 마세요.',
  delivery_unknown: '전송 결과를 확정하지 못했습니다. 중복 발송을 피하려면 기존 Dyhs Mail과 운영자에게 확인해 주세요.',
  smtp_pending: '전송 처리 중이거나 결과 확인이 필요합니다. 자동 재발송하지 않습니다.',
  pending: '처리 중입니다. 잠시 후 결과를 다시 확인하세요.',
  rejected: '전송이 완료되지 않았습니다. 입력과 서버 상태를 확인해 주세요.',
};
export function LiveMail({ me }: { me: { csrfToken: string; mailbox: string | null; capabilities: { mailSend: boolean } } }) {
  const [folders, setFolders] = useState<{ id: string; name: string; unread: number }[]>([]);
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [data, setData] = useState<{ items: Message[]; nextCursor: string | null } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [operation, setOperation] = useState<string | null>(() => { try { return sessionStorage.getItem('dyhs-mail-operation'); } catch { return null; } });
  const [status, setStatus] = useState('');
  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken };
  useEffect(() => { let active = true; api('/api/mail/folders').then(value => { if (active) { setFolders(value); setFolder(value.find((f: { id: string }) => f.id.toUpperCase() === 'INBOX')?.id || value[0]?.id || ''); } }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!folder) return;
    let active = true; setData(null); setDetail(null); setError(''); setBusy(true);
    const params = new URLSearchParams({ folder, query: search }); if (cursor) params.set('cursor', cursor);
    api(`/api/mail/messages?${params}`).then(value => { if (active) setData(value); }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [folder, cursor, search, refresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (draft.text || draft.to || files.length) { event.preventDefault(); event.returnValue = ''; } };
    addEventListener('beforeunload', warn); return () => removeEventListener('beforeunload', warn);
  }, [draft, files]);
  async function open(id: string) { setBusy(true); setError(''); try { setDetail(await api(`/api/mail/messages/${encodeURIComponent(id)}`)); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  async function mark(action: string) { if (!detail) return; setBusy(true); try { await api(`/api/mail/messages/${encodeURIComponent(detail.id)}/actions`, { method: 'POST', headers, body: JSON.stringify({ action }) }); setData(value => value && ({ ...value, items: value.items.map(item => item.id === detail.id ? { ...item, unread: action === 'mark_unread' } : item) })); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }
  function compose(mode?: 'reply' | 'all' | 'forward') {
    if (operation && !confirm('기존 전송 결과를 확인했나요? 새 작업으로 작성하면 같은 내용이 중복 전송될 수 있습니다.')) return;
    if ((draft.to || draft.text || files.length) && !confirm('보관 중인 초안을 새 작성 내용으로 바꿀까요?')) return;
    setOperation(null); setStatus(''); try { sessionStorage.removeItem('dyhs-mail-operation'); } catch { /* Result also remains in server operation history. */ }
    setFiles([]);
    setDraft(mode && detail ? { to: mode === 'forward' ? '' : detail.from.join(', '), cc: mode === 'all' ? [...detail.to, ...detail.cc].filter(address => address !== me.mailbox && !detail.from.includes(address)).join(', ') : '', subject: `${mode === 'forward' ? 'Fwd' : 'Re'}: ${detail.subject}`, text: `\n\n──────── 원본 메일 ────────\n${detail.from.join(', ')}\n${detail.text}` } : emptyDraft);
    setComposing(true);
  }
  async function result() {
    if (!operation) return; setBusy(true); setError('');
    try { const value = await api(`/api/mail/operations/${operation}`); setStatus(value.status); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (busy || operation) return; setBusy(true); setError('');
    try {
      if (files.length > 10 || files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024) throw new Error('첨부는 10개, 합계 10 MB까지 보낼 수 있습니다.');
      const attachments = await Promise.all(files.map(file => new Promise<{ name: string; data: string }>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('첨부 파일을 읽지 못했습니다.')); reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(',')[1] }); reader.readAsDataURL(file); })));
      const key = crypto.randomUUID(); setOperation(key); try { sessionStorage.setItem('dyhs-mail-operation', key); } catch { /* Keep it in component memory. */ }
      const split = (value: string) => value.split(/[,;]/).map(item => item.trim()).filter(Boolean);
      const value = await api('/api/mail/send', { method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body: JSON.stringify({ ...draft, to: split(draft.to), cc: split(draft.cc), attachments }) }); setStatus(value.status);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="live-mail"><div className="page-heading"><div><span className="eyebrow">DYHS MAIL</span><h1>내 메일함</h1><p>{me.mailbox}</p></div><div className="live-actions"><button className="primary" disabled={busy} onClick={() => compose()}>새 메일 쓰기</button>{draft.to && !composing && <button className="secondary" onClick={() => setComposing(true)}>초안 열기</button>}</div></div>
    {error && <p role="alert" className="notice">{error}</p>}{operation && <div className="notice" role="status"><span>{statuses[status] || '전송 작업 결과를 확인해 주세요.'}<small className="live-operation">작업 {operation}</small></span><button className="secondary" disabled={busy} onClick={result}>결과 확인</button></div>}
    {composing && <form className="panel live-compose" onSubmit={send}><div className="section-heading"><h2>메일 작성</h2><button type="button" className="secondary" disabled={busy} onClick={() => setComposing(false)}>이 탭에 보관</button></div><p>새로고침하거나 메일 화면을 떠나면 초안이 사라집니다. 전달할 첨부는 직접 추가하세요.</p><fieldset disabled={busy || Boolean(operation)}>{(['to', 'cc', 'subject'] as const).map(key => <label key={key}>{({ to: '받는 사람', cc: '참조', subject: '제목' })[key]}<input value={draft[key]} required={key === 'to'} maxLength={key === 'subject' ? 250 : 5000} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}<label>메일 내용<textarea rows={10} value={draft.text} maxLength={1000000} onChange={event => setDraft({ ...draft, text: event.target.value })} /></label><label>첨부 파일 · 최대 10 MB<input type="file" multiple onChange={event => setFiles(Array.from(event.target.files || []))} /></label><button className="primary" disabled={!me.capabilities.mailSend} type="submit">메일 보내기</button></fieldset>{!me.capabilities.mailSend && <p>읽기 연결 상태입니다. 운영자의 SMTP 검증 후 전송이 활성화됩니다.</p>}</form>}
    <form className="live-mail-toolbar" onSubmit={event => { event.preventDefault(); setSearch(query); setCursor(null); setRefresh(value => value + 1); }}><label>폴더<select value={folder} disabled={busy} onChange={event => { setFolder(event.target.value); setCursor(null); }}>{folders.map(item => <option key={item.id} value={item.id}>{item.name}{item.unread ? ` (${item.unread})` : ''}</option>)}</select></label><label>메일 검색<input type="search" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} /></label><button className="secondary" disabled={busy}>검색·새로고침</button></form>
    {busy && <p role="status">메일을 불러오고 있습니다…</p>}<div className={`live-mail-grid ${detail ? 'has-detail' : ''}`}><section className="panel live-message-list" aria-label="메일 목록">{data?.items.map(item => <button className={detail?.id === item.id ? 'active' : ''} key={item.id} disabled={busy} onClick={() => open(item.id)}><strong>{item.unread ? '● ' : ''}{item.subject}</strong><span>{item.from}</span><small>{item.receivedAt ? new Date(item.receivedAt).toLocaleString('ko-KR') : ''}</small></button>)}{data?.items.length === 0 && <p>표시할 메일이 없습니다.</p>}<div className="live-actions"><button className="secondary" disabled={!cursor || busy} onClick={() => setCursor(null)}>처음</button><button className="secondary" disabled={!data?.nextCursor || busy} onClick={() => setCursor(data!.nextCursor)}>다음 50개</button></div></section><section className="panel live-message-detail" aria-label="메일 읽기">{detail ? <><button className="secondary" onClick={() => setDetail(null)}>목록으로 돌아가기</button><h2>{detail.subject}</h2><p>보낸 사람: {detail.from.join(', ')}</p><p>받는 사람: {detail.to.join(', ')}</p><div className="live-actions"><button className="secondary" disabled={busy} onClick={() => compose('reply')}>답장</button><button className="secondary" disabled={busy} onClick={() => compose('all')}>전체 답장</button><button className="secondary" disabled={busy} onClick={() => compose('forward')}>전달</button><button className="secondary" disabled={busy} onClick={() => mark('mark_read')}>읽음</button><button className="secondary" disabled={busy} onClick={() => mark('mark_unread')}>안 읽음</button></div><pre className="live-mail-text">{detail.text}</pre>{detail.attachments.map(file => <a className="secondary" key={file.id} href={`/api/mail/messages/${encodeURIComponent(detail.id)}/attachments/${file.id}`}>{file.filename} · {Math.ceil(file.size / 1024)} KB 다운로드</a>)}</> : <p>목록에서 메일을 선택하세요.</p>}</section></div>
  </section>;
}
