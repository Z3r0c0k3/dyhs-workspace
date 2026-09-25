import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import { services, validRedirectUri } from './services';
import { account, filterMessages, folders, mailDocument, mailUrl, messages, parseRoute } from './mock';
import type { Folder, Mail } from './mock';

type Draft = { to: string; cc: string; subject: string; body: string; attachments: { name: string; size: number }[] };
const blankDraft = (): Draft => ({ to: '', cc: '', subject: '', body: '', attachments: [] });
const date = (value: string) => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(value));
const nav = [{ id: 'home', label: '홈', icon: 'home' }, { id: 'mail', label: '메일', icon: 'mail' }, { id: 'settings', label: '개인 설정', icon: 'settings' }];

function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span>; }
function MakeLogo() { return <span className="make-logo"><span className="make-crop"><img src="/brand/make-original.png" alt="MAKE;" width="1000" height="1000" /></span></span>; }
function Empty({ icon = 'inbox', title, children }: { icon?: string; title: string; children: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Icon name={icon} size={28} /></span><h3>{title}</h3><p>{children}</p></div>;
}
function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => { dialog.close(); opener.current?.focus(); }; }, []);
  return <dialog className={className} ref={ref} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="창 닫기" onClick={onClose}><Icon name="close" /></button></header>{children}
  </dialog>;
}

export function App() {
  const [hash, setHash] = useState(location.hash);
  const route = parseRoute(hash);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('dyhs-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } });
  const [adminPreview, setAdminPreview] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [info, setInfo] = useState(false);
  const [ended, setEnded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { const update = () => { setHash(location.hash); setAccountOpen(false); setNotice(''); }; addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.title = `${({ home: '홈', mail: 'Dyhs Mail', settings: '개인 설정', admin: '관리 콘솔' })[route.page]} · Dyhs Workspace`; }, [route.page]);
  function compose(mode?: 'reply' | 'all' | 'forward', mail?: Mail) {
    if (mode && mail) {
      if (savedDraft && !confirm('저장된 미리보기 초안을 새 답장으로 바꿀까요?')) return;
      setDraft({ to: mode === 'forward' ? '' : mail.address, cc: mode === 'all' ? mail.cc || '' : '', subject: `${mode === 'forward' ? 'Fwd' : 'Re'}: ${mail.subject}`, body: `\n\n──────── 원본 메일 ────────\n${mail.sender} <${mail.address}>\n${mail.body}`, attachments: [] });
    } else setDraft(savedDraft || blankDraft());
    setComposing(true);
  }
  function saveDraft(value: Draft) { setSavedDraft(value); setDraft(value); setComposing(false); setNotice('미리보기 초안을 이 탭의 메모리에 보관했어요. 새로고침하면 사라집니다.'); }
  if (ended) return <div className="end-screen"><span className="eyebrow">DYHS AUTH · 미리보기</span><h1>다음에 또 만나요.</h1><p>미리보기를 종료했습니다. 실제 로그인 세션은 연결되지 않았어요.</p><button className="primary" onClick={() => { setEnded(false); location.hash = '/home'; }}>미리보기 다시 시작 <Icon name="arrow" /></button><small>운영 · MAKE;</small></div>;
  return <>
    <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById("main")?.focus(); }}>본문으로 건너뛰기</a>
    <div className="preview-bar" role="region" aria-label="미리보기 안내"><span><Icon name="info" size={15} /> 미리보기 · 실제 메일을 보내거나 변경하지 않습니다</span><button onClick={() => setInfo(true)}>자세히 <Icon name="arrow" size={14} /></button></div>
    <div className={`workspace ${route.page === 'mail' ? 'mail-workspace' : ''}`}>
      <aside className="product-nav" aria-label="제품 탐색">
        <a className="brand" href="#/home" aria-label="Dyhs Workspace 홈"><MakeLogo /><span className="brand-full">Dyhs Workspace</span></a>
        <span className="nav-caption">MY WORKSPACE</span>
        <nav>{nav.slice(0, 2).map(item => <a key={item.id} className={`nav-item ${route.page === item.id ? 'active' : ''}`} href={`#/${item.id}`} aria-current={route.page === item.id ? 'page' : undefined} title={item.label}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'mail' && <b>3</b>}</a>)}
          <div className="nav-divider" />
          {[['calendar', '캘린더'], ['users', '주소록']].map(([icon, label]) => <div className="nav-item upcoming" key={icon} title={`${label} · 준비 중`}><Icon name={icon} /><span>{label}</span><small>준비 중</small></div>)}
          <a className="nav-item external-service" href={services.url} target="_blank" rel="noopener noreferrer" title="Dyhs URL · 외부 서비스, 새 탭"><Icon name="link" /><span>Dyhs URL</span><small>외부 ↗</small></a>
        </nav>
        <div className="nav-bottom"><a className={`nav-item ${route.page === 'settings' ? 'active' : ''}`} href="#/settings" aria-current={route.page === 'settings' ? 'page' : undefined} title="개인 설정"><Icon name="settings" /><span>개인 설정</span></a>
          {adminPreview && <a className={`nav-item ${route.page === 'admin' ? 'active' : ''}`} href="#/admin" aria-current={route.page === 'admin' ? 'page' : undefined} title="관리 미리보기"><Icon name="shield" /><span>관리 <small>예시</small></span></a>}
          <div className="operator"><span>운영 · MAKE;</span><small>당신의 일상을 연결하는 공간</small></div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><div className="header-context"><a className="mobile-brand" href="#/home" aria-label="Dyhs Workspace 홈"><MakeLogo /></a><div className="breadcrumb">Workspace <span>/</span> <strong>{({ home: '홈', mail: 'Dyhs Mail', settings: '개인 설정', admin: '관리 콘솔' })[route.page]}</strong></div></div>
          <div className="topbar-actions"><button className="icon-button" aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button><span className="topbar-divider" /><button className="account-button" aria-label="김하늘 계정 메뉴" onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen} aria-controls="account-menu"><span className="avatar">하</span><span className="account-name">김하늘 <small>미리보기 계정</small></span><Icon name="down" size={16} /></button></div>
          {accountOpen && <div className="account-menu" id="account-menu"><strong>{account.name}</strong><p>{account.email}</p><a href="#/settings?section=security"><Icon name="shield" /> 계정 및 보안</a><a href={services.url} target="_blank" rel="noopener noreferrer"><Icon name="link" /> Dyhs URL · 새 탭 ↗</a><label className="check-label"><input type="checkbox" checked={adminPreview} onChange={e => setAdminPreview(e.target.checked)} /> 관리자 화면 미리보기</label><small>예시 화면만 표시합니다. 실제 권한은 부여되지 않습니다.</small><button onClick={() => { setSavedDraft(null); setDraft(blankDraft()); setAdminPreview(false); setAccountOpen(false); setEnded(true); }}><Icon name="logout" /> 미리보기 종료</button></div>}
        </header>
        {notice && <div className="notice" role="status"><Icon name="check" /><span>{notice}</span><button className="icon-button" aria-label="알림 닫기" onClick={() => setNotice('')}><Icon name="close" /></button></div>}
        <main id="main" tabIndex={-1} className={route.page === 'mail' ? 'mail-main' : 'page-main'}>
          {route.page === 'home' && <Home onCompose={() => compose()} />}
          {route.page === 'mail' && <MailView folder={route.folder} selected={route.message} onCompose={compose} savedDraft={savedDraft} />}
          {route.page === 'settings' && <Settings section={route.section} theme={theme} onSave={value => { setTheme(value); try { localStorage.setItem('dyhs-theme', value); setNotice('화면 설정을 이 브라우저에 저장했어요.'); } catch { setNotice('브라우저 저장 공간에 접근하지 못했어요. 이번 방문에만 적용합니다.'); } }} />}
          {route.page === 'admin' && (adminPreview ? <Admin /> : <Empty icon="shield" title="관리 화면은 권한이 필요해요">현재는 일반 사용자 미리보기입니다. 계정 메뉴에서 관리자 예시 화면을 선택할 수 있어요.</Empty>)}
        </main>
      </div>
    </div>
    {composing && <Composer initial={draft} onSave={saveDraft} onClose={value => { setDraft(value); setSavedDraft(value); setComposing(false); }} />}
    {info && <Modal title="작업 공간을 먼저 만나보세요" onClose={() => setInfo(false)}><div className="dialog-content"><Badge>1단계 · UI 미리보기</Badge><p>이곳의 계정, 메일, 저장 공간은 모두 허구의 예시입니다. 실제 로그인이나 메일함은 연결되지 않았습니다.</p><p>메일 탐색, 검색, 답장 작성과 화면 설정을 체험할 수 있어요. 작성한 초안은 이 탭에서만 보관되며 새로고침하면 사라집니다.</p><p>메일 전송·삭제, 계정 변경과 관리 작업은 연동 검증 후 제공됩니다.</p><small>운영 · MAKE; · 학교 공식 서비스가 아닙니다.</small><button className="primary" onClick={() => setInfo(false)}>확인했어요</button></div></Modal>}
  </>;
}

function Home({ onCompose }: { onCompose: () => void }) {
  return <div className="home-page">
    <div className="page-heading"><div><span className="eyebrow">YOUR DAY, ALL TOGETHER</span><h1>반가워요, 하늘님<span className="brand-dot">.</span></h1><p>오늘의 소식과 할 일을 한곳에서 확인하세요.</p></div><span className="date-label">2026년 9월 24일 목요일 <Badge>예시</Badge></span></div>
    <section className="welcome-card"><div><span className="hero-label">나의 일상이 이어지는 곳</span><h2>작은 일부터, 큰 아이디어까지.<br />이제 하나의 Workspace에서.</h2><p>메일과 계정, 필요한 도구를 더 가까이.</p><a className="hero-button" href={mailUrl()}>내 메일함 열기 <Icon name="arrow" size={18} /></a></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-tile tile-mail"><Icon name="mail" size={56} /></div><div className="art-tile tile-calendar"><Icon name="calendar" size={32} /></div><div className="art-tile tile-link"><Icon name="link" size={28} /></div><span className="art-plus">+</span><span className="art-dot" /></div><span className="hero-number">01 / WORKSPACE</span></section>
    <div className="stats-grid"><a className="stat-card" href={mailUrl()}><div><span>읽지 않은 메일</span><Icon name="mail" /></div><strong>3 <small>통</small></strong><p>새로운 소식이 기다리고 있어요 <Icon name="arrow" size={16} /></p></a><a className="stat-card" href="#/settings?section=security"><div><span>내 계정</span><Icon name="shield" /></div><strong className="stat-word">연결 대기</strong><p>Dyhs Auth 연동 전 · 예시 계정 <Icon name="arrow" size={16} /></p></a><a className="stat-card" href="#/settings?section=storage"><div><span>저장 공간 <small>예시</small></span><Icon name="disk" /></div><strong>1.2 <small>/ 5 GB</small></strong><div className="meter"><span style={{ width: '24%' }} /></div><p>전체 공간의 24% 사용 중 <Icon name="arrow" size={16} /></p></a></div>
    <div className="home-columns"><section className="panel recent-mail"><div className="section-heading"><h2>최근 받은 메일 <Badge>예시</Badge></h2><a className="text-link" href={mailUrl()}>전체 보기 <Icon name="arrow" size={16} /></a></div>{messages.filter(m => m.folder === 'inbox').slice(0, 4).map(mail => <a className="recent-row" key={mail.id} href={mailUrl('inbox', mail.id)}><span className="sender-avatar">{mail.sender[0]}</span><div><div className="recent-sender">{mail.sender}{mail.unread && <span className="unread-dot" role="img" aria-label="읽지 않음" />}</div><span className="recent-subject">{mail.subject}</span></div><time dateTime={mail.date}>{mail.date.startsWith('2026-09-24') ? mail.date.slice(11, 16) : '어제'}</time></a>)}</section>
      <section className="panel quick-panel"><div className="section-heading"><h2>바로 시작하기</h2><Icon name="plus" size={18} /></div><button className="quick-action" onClick={onCompose}><span className="quick-icon"><Icon name="send" /></span><span><strong>새 메일 쓰기</strong><small>생각을 정리하고 소식을 전해요</small></span><Icon name="arrow" size={18} /></button><a className="quick-action" href="#/settings"><span className="quick-icon"><Icon name="settings" /></span><span><strong>나에게 맞는 작업 공간</strong><small>화면과 계정 설정을 확인해요</small></span><Icon name="arrow" size={18} /></a><div className="coming-note"><span className="eyebrow">COMING NEXT</span><strong>더 많은 연결을 준비하고 있어요.</strong><p>Mailcow 캘린더와 주소록을 연결할 예정이에요.<br />Dyhs URL은 지금 별도 서비스로 이용할 수 있어요.</p><div><Icon name="calendar" /><Icon name="users" /><Icon name="link" /><span>준비 중</span></div></div></section></div>
    <footer className="page-footer"><div className="school-identity"><span className="school-logo"><img src="/brand/deokyeong-original.jpg" width="1000" height="1000" alt="덕영고등학교 · Dreams of Youth" /></span><div><strong>덕영고 구성원을 위한 작업 공간</strong><span>Dyhs Workspace · 운영 MAKE;</span><small>학교 공식 서비스가 아닙니다.</small></div></div><span>조금 더 간결한 하루를 위해.</span></footer>
  </div>;
}

function MailView({ folder, selected, onCompose, savedDraft }: { folder: Folder; selected?: Mail; onCompose: (mode?: 'reply' | 'all' | 'forward', mail?: Mail) => void; savedDraft: Draft | null }) {
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [failure, setFailure] = useState(false);
  useEffect(() => { setQuery(''); setUnreadOnly(false); setFolderOpen(false); setFailure(false); }, [folder]);
  useEffect(() => { if (selected && matchMedia('(max-width: 1279px)').matches) document.getElementById('message-title')?.focus(); }, [selected]);
  const list = filterMessages(folder, query, unreadOnly);
  const folderLabel = folders.find(f => f.id === folder)!.label;
  return <div className={`mail-layout ${selected ? 'has-message' : ''} ${folderOpen ? 'folders-open' : ''}`}>
    <aside className="folder-nav" aria-label="메일 폴더"><button className="icon-button folder-close" aria-label="메일 폴더 닫기" onClick={() => setFolderOpen(false)}><Icon name="close" /></button><div className="mail-brand"><span className="eyebrow">YOUR MAILBOX</span><h1>Dyhs Mail<span className="brand-dot">.</span></h1></div><button className="primary compose-button" onClick={() => onCompose()}><Icon name="plus" /> 새 메일</button><nav>{folders.map(f => <a key={f.id} href={mailUrl(f.id)} onClick={() => setFolderOpen(false)} className={`folder-item ${folder === f.id ? 'active' : ''}`} aria-current={folder === f.id ? 'page' : undefined}><Icon name={f.icon} size={18} /><span>{f.label}</span>{f.id === 'inbox' && <b>3</b>}{f.id === 'drafts' && savedDraft && <b>1</b>}</a>)}</nav><div className="mail-storage"><div><Icon name="disk" size={16} /> 저장 공간 <small>예시</small></div><div className="meter"><span style={{ width: '24%' }} /></div><small><strong>1.2 GB</strong> / 5 GB</small></div></aside>
    <section className="mail-list" aria-label="메일 목록"><header className="list-header"><div><button className="icon-button mobile-folder-toggle" aria-label="메일 폴더 선택" aria-expanded={folderOpen} onClick={() => setFolderOpen(!folderOpen)}><Icon name="menu" /></button><h2>{folderLabel}</h2><span className="count">{folder === 'drafts' && savedDraft ? 1 : list.length}</span><button className="icon-button list-compose" aria-label="새 메일" onClick={() => onCompose()}><Icon name="plus" /></button></div><label className="search-field"><Icon name="search" size={18} /><input aria-label="메일 검색" placeholder="메일 검색" type="search" value={query} onChange={e => setQuery(e.target.value)} /></label></header><div className="list-controls"><div><button className={!unreadOnly ? 'selected' : ''} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>전체</button><button className={unreadOnly ? 'selected' : ''} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>안 읽음</button></div><span>최신순</span></div>
      <div className="mail-rows">{folder === 'drafts' && savedDraft && !query && !unreadOnly ? <button className="mail-row draft-row" onClick={() => onCompose()}><span className="mail-row-top"><strong>미리보기 초안</strong><Badge>이 탭에 보관</Badge></span><strong>{savedDraft.subject || '(제목 없음)'}</strong><span>{savedDraft.body || '계속 작성하려면 선택하세요.'}</span></button> : list.map(mail => <a key={mail.id} href={mailUrl(folder, mail.id)} className={`mail-row ${selected?.id === mail.id ? 'active' : ''} ${mail.unread ? 'unread' : ''}`} aria-current={selected?.id === mail.id ? 'true' : undefined}><span className="mail-row-top"><strong>{mail.unread && <span className="unread-dot" role="img" aria-label="읽지 않음" />}{mail.sender}</strong><time dateTime={mail.date}>{mail.date.startsWith('2026-09-24') ? mail.date.slice(11, 16) : mail.date.slice(5, 10).replace('-', '.')}</time></span><span className="mail-subject">{mail.subject}</span><span className="mail-preview">{mail.preview}</span><span className="mail-row-meta">{mail.starred && <span role="img" aria-label="중요 메일"><Icon name="star" size={14} /></span>}{mail.attachment && <span><Icon name="paperclip" size={14} /> 첨부 1</span>}</span></a>)}
      {!list.length && !(folder === 'drafts' && savedDraft && !query && !unreadOnly) && <Empty title={query ? '검색 결과가 없어요' : '메일이 없어요'}>{query ? '다른 검색어로 다시 찾아보세요.' : '이 폴더에 표시할 예시 메일이 없습니다.'}</Empty>}</div><div className="list-footer">예시 메일 · 서버에 연결되지 않음</div></section>
    <section className="mail-reader" aria-label="메일 읽기">{selected ? <><div className="reader-toolbar"><a className="icon-button reader-back" href={mailUrl(folder)} aria-label="메일 목록으로 돌아가기"><Icon name="back" /></a><div><button className="toolbar-button" onClick={() => onCompose('reply', selected)}><Icon name="reply" size={18} /> 답장</button><button className="icon-button" aria-label="전달" onClick={() => onCompose('forward', selected)}><Icon name="arrow" /></button><span className="toolbar-separator" /><button className="icon-button" disabled aria-label="메일 삭제 · 미리보기에서 사용 불가"><Icon name="trash" /></button></div><Badge>예시 메일</Badge></div><div className="reader-content"><div className="reader-subject"><h2 id="message-title" tabIndex={-1}>{selected.subject}</h2>{selected.starred && <span role="img" aria-label="중요 메일"><Icon name="star" /></span>}</div><div className="sender-details"><span className="sender-avatar">{selected.sender[0]}</span><div><strong>{selected.sender}</strong><span>{selected.address}</span><small>받는 사람: {selected.to}</small>{selected.cc && <small>참조: {selected.cc}</small>}</div></div><time className="message-date" dateTime={selected.date}>{date(selected.date)}</time><div className="body-policy"><Icon name="shield" size={14} /> 외부 콘텐츠와 원격 이미지는 차단됩니다</div><iframe title="메일 본문" sandbox="" referrerPolicy="no-referrer" srcDoc={mailDocument(selected.body)} className="message-body" />{selected.attachment && <div className="attachment"><Icon name="file" size={24} /><div><strong>{selected.attachment.name}</strong><small>{selected.attachment.size} · 예시 파일, 다운로드 불가</small></div></div>}<div className="reply-actions"><button className="secondary" onClick={() => onCompose('reply', selected)}><Icon name="reply" size={17} /> 답장</button><button className="secondary" onClick={() => onCompose('all', selected)}>전체 답장</button><button className="secondary" onClick={() => onCompose('forward', selected)}>전달</button></div></div></> : failure ? <Empty icon="info" title="메일함에 연결하지 못했어요"><span>오류 상태 미리보기입니다. 잠시 후 다시 시도해 주세요.</span><button className="secondary" onClick={() => setFailure(false)}>다시 시도</button></Empty> : <div className="reader-welcome"><span className="empty-icon"><Icon name="mail" size={36} /></span><span className="eyebrow">A LITTLE SPACE FOR YOUR DAY</span><h2>새로운 이야기를 열어보세요.</h2><p>목록에서 메일을 선택하면<br />이곳에서 내용을 확인할 수 있어요.</p><button className="text-link" onClick={() => setFailure(true)}>연결 오류 화면 미리보기</button><small>Dyhs Mail · 운영 MAKE;</small></div>}</section>
  </div>;
}

function Composer({ initial, onSave, onClose }: { initial: Draft; onSave: (draft: Draft) => void; onClose: (draft: Draft) => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const update = (key: 'to' | 'cc' | 'subject' | 'body', text: string) => setValue(v => ({ ...v, [key]: text }));
  return <Modal title="새 메일" className="compose-dialog" onClose={() => onClose(value)}><form onSubmit={(e: FormEvent) => { e.preventDefault(); onSave(value); }}><div className="compose-notice"><Icon name="info" size={16} /> 작성 미리보기 · 실제 메일은 전송되지 않습니다</div><div className="compose-fields"><div className="field-row"><label htmlFor="from">보내는 사람</label><input id="from" value={account.email} readOnly /></div><div className="field-row"><label htmlFor="to">받는 사람</label><input id="to" type="email" multiple autoFocus placeholder="name@example.com" value={value.to} onChange={e => update('to', e.target.value)} /></div><div className="field-row"><label htmlFor="cc">참조</label><input id="cc" type="email" multiple value={value.cc} onChange={e => update('cc', e.target.value)} /></div><div className="field-row"><label htmlFor="subject">제목</label><input id="subject" maxLength={250} placeholder="제목을 입력하세요" value={value.subject} onChange={e => update('subject', e.target.value)} /></div></div><label className="sr-only" htmlFor="body">메일 내용</label><textarea id="body" placeholder="전하고 싶은 이야기를 적어보세요." value={value.body} onChange={e => update('body', e.target.value)} />
      <div className="compose-attachments">{value.attachments.map((file, i) => <span className="attachment-chip" key={`${file.name}-${i}`}><Icon name="paperclip" size={15} /><span>{file.name}</span><button type="button" className="icon-button" aria-label={`${file.name} 첨부 제거`} onClick={() => setValue(v => ({ ...v, attachments: v.attachments.filter((_, index) => index !== i) }))}><Icon name="close" size={14} /></button></span>)}{error && <p role="alert">{error}</p>}</div><div className="compose-footer"><button className="primary" type="button" disabled><Icon name="send" size={17} /> 메일 보내기</button><button className="secondary" type="submit">초안 보관</button><label className="icon-button file-input-label" aria-label="파일 첨부"><Icon name="paperclip" /><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt" aria-label="파일 첨부" onChange={e => { const files = Array.from(e.target.files || []); if (files.some(f => !/\.(pdf|png|jpe?g|txt)$/i.test(f.name)) || [...value.attachments, ...files].reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024) { setError('PDF, PNG, JPG, TXT만 첨부할 수 있어요. 전체 크기를 10 MB 이하로 줄여 주세요.'); } else { setValue(v => ({ ...v, attachments: [...v.attachments, ...files.map(f => ({ name: f.name, size: f.size }))] })); setError(''); } e.target.value = ''; }} /></label></div><p className="compose-footnote">초안은 새로고침하면 사라집니다. 첨부는 이름과 크기만 표시하며 업로드하지 않습니다.</p></form></Modal>;
}

const sections = [{ id: 'general', label: '일반', icon: 'settings' }, { id: 'mail', label: '메일', icon: 'mail' }, { id: 'security', label: '계정 및 보안', icon: 'shield' }, { id: 'storage', label: '저장 공간', icon: 'disk' }];
function Settings({ section, theme, onSave }: { section: string; theme: string; onSave: (theme: string) => void }) {
  const [choice, setChoice] = useState(theme);
  useEffect(() => setChoice(theme), [theme]);
  const current = sections.find(s => s.id === section) || sections[0];
  return <div className="settings-page"><div className="page-heading"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>개인 설정</h1><p>나에게 편한 작업 공간을 만들어 보세요.</p></div></div><div className="settings-layout"><nav className="settings-nav" aria-label="설정 항목">{sections.map(s => <a key={s.id} href={`#/settings?section=${s.id}`} className={current.id === s.id ? 'active' : ''} aria-current={current.id === s.id ? 'page' : undefined}><Icon name={s.icon} />{s.label}</a>)}</nav><section className="panel settings-panel"><div className="section-heading"><h2>{current.label}</h2><Badge>{current.id === 'general' ? '이 브라우저에 적용' : '연동 전'}</Badge></div>
    {current.id === 'general' && <form onSubmit={e => { e.preventDefault(); onSave(choice); }}><h3>화면 테마</h3><p className="muted">편안하게 사용할 화면을 선택하세요.</p><div className="theme-options">{['light', 'dark'].map(t => <label key={t} className={`theme-option ${choice === t ? 'chosen' : ''}`}><div className={`theme-sample ${t}`} aria-hidden="true"><span /><div><i /><i /><i /></div></div><span><input type="radio" name="theme" checked={choice === t} onChange={() => setChoice(t)} />{t === 'light' ? '라이트' : '다크'}</span></label>)}</div><div className="setting-row"><div><strong>표시 언어</strong><p>현재 한국어를 지원합니다.</p></div><span>한국어</span></div><button className="primary" type="submit">설정 저장</button></form>}
    {current.id === 'mail' && <><p className="muted">실제 메일함 연결이 확인되면 지원되는 설정부터 제공됩니다.</p>{['메일 서명', '자동 응답', '메일 전달', '메일 필터', '보내는 주소 및 별칭'].map(label => <div className="setting-row" key={label}><div><strong>{label}</strong><p>메일 서버의 지원 여부와 권한을 확인하고 있어요.</p></div><Badge>편집 불가</Badge></div>)}</>}
    {current.id === 'security' && <>
      <div className="profile-summary"><span className="avatar large">하</span><div><h3>{account.name} <Badge>예시 계정</Badge></h3><p>{account.email}</p></div></div>
      <div className="setting-row"><div><strong>기본 계정 보안</strong><p>자주 사용하는 보안 설정을 간단하게 관리하세요.</p></div><Badge>연동 대기</Badge></div>
      {[
        ['패스키', '지문, 얼굴 인식 또는 보안 키로 로그인하세요.', '패스키 관리'],
        ['2단계 인증 (2FA)', '인증 앱과 복구 수단으로 계정을 보호하세요.', '2FA 설정'],
        ['비밀번호', '본인 확인 후 비밀번호를 변경하세요.', '비밀번호 변경'],
      ].map(([title, description, action]) => <div className="setting-row security-action" key={title}><div><strong>{title}</strong><p>{description}</p><small>현재 등록 상태를 확인할 수 없어요.</small></div><button className="secondary" disabled>{action}</button></div>)}
      <p className="muted security-note">빠른 보안 설정은 계정 연결 후 사용할 수 있어요. 지금은 Dyhs Auth에서 관리할 수 있습니다.</p>
      <div className="advanced-settings"><div><h3>더 자세한 계정 설정</h3><p>프로필, 로그인 기록과 기타 고급 기능은 Authentik에서 관리합니다.</p></div><a className="secondary" href={services.authSettings} target="_blank" rel="noopener noreferrer">Dyhs Auth 고급 설정 ↗<span className="sr-only">새 탭</span></a></div>
      <p className="muted security-note">외부 서비스가 새 탭에서 열립니다. 미리보기 계정과 별개로 실제 Dyhs Auth 계정에 로그인합니다.</p>
    </>}
    {current.id === 'storage' && <><p className="muted">아래 사용량은 미리보기 예시입니다.</p><div className="storage-total"><strong>1.2 <small>GB</small></strong><span>/ 5 GB</span></div><div className="meter large-meter"><span style={{ width: '24%' }} /></div><div className="setting-row"><strong>메일 및 첨부 파일</strong><span>1.2 GB</span></div><div className="setting-row"><strong>남은 공간</strong><span>3.8 GB</span></div><p className="muted">실제 사용량과 용량 변경은 메일 서버 연동 후 확인할 수 있어요.</p></>}
  </section></div></div>;
}

type AuthCategory = '사용자' | '그룹' | '초대 링크' | '애플리케이션';
const authCategories: AuthCategory[] = ['사용자', '그룹', '초대 링크', '애플리케이션'];

function Admin() {
  const [category, setCategory] = useState('사용자');
  const [editor, setEditor] = useState<AuthCategory | null>(null);
  const isAuth = authCategories.includes(category as AuthCategory);
  const categories = [...authCategories, '메일함', '도메인', '별칭', '저장 공간'];
  const rows: Record<string, string[][]> = {
    사용자: [['김하늘', 'haneul@workspace.example', '일반 사용자'], ['이서연', 'seoyeon@workspace.example', '일반 사용자'], ['운영 예시', 'operator@workspace.example', '메일 운영자']],
    그룹: [['MAKE; 구성원', 'make-members', '구성원 2명 · 예시'], ['Workspace 운영', 'workspace-operators', '구성원 1명 · 예시']],
    '초대 링크': [['신규 구성원 초대 예시', 'invitee@workspace.example', '발급 전 · 일회용']],
    애플리케이션: [['Dyhs Workspace', 'workspace-preview', 'OIDC · 등록 전'], ['AMS 출입 시스템', 'ams-planned', 'OIDC 연동 예정']],
    메일함: [['김하늘의 메일함', 'haneul@workspace.example', '1.2 / 5 GB'], ['이서연의 메일함', 'seoyeon@workspace.example', '0.8 / 5 GB']],
    도메인: [['예시 도메인', 'workspace.example', '메일함 2개']],
    별칭: [['프로젝트 팀', 'team@workspace.example', '수신 전용 예시']],
    '저장 공간': [['김하늘', 'haneul@workspace.example', '24% 사용'], ['이서연', 'seoyeon@workspace.example', '16% 사용']],
  };
  return <div className="admin-page">
    <div className="page-heading"><div><span className="eyebrow">WORKSPACE ADMINISTRATION</span><h1>관리 콘솔 <Badge>화면 미리보기</Badge></h1><p>Dyhs Auth와 메일 서비스를 한곳에서 관리하세요.</p></div></div>
    <div className="inline-info"><Icon name="shield" /><p>예시 데이터입니다. 입력과 변경 내용 검토만 가능하며 실제 계정·그룹·초대 링크·앱은 생성하거나 변경하지 않습니다.</p></div>
    <div className="admin-summary"><div className="panel"><span>계정 · Dyhs Auth</span><strong className="stat-word">연동 대기</strong></div><div className="panel"><span>메일 · 캘린더</span><strong className="stat-word">Mailcow</strong></div><div className="panel"><span>향후 SSO 연결</span><strong className="stat-word">AMS</strong></div></div>
    <section className="panel admin-table-panel">
      <nav className="admin-tabs" aria-label="관리 항목">{categories.map(c => <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c} className={category === c ? 'active' : ''}>{c}</button>)}</nav>
      <div className="section-heading"><h2>{category}</h2>{isAuth ? <button className="secondary" onClick={() => setEditor(category as AuthCategory)}><Icon name="plus" size={16} />{category === '초대 링크' ? '초대 만들기' : `${category} 등록`}<span className="sr-only"> 미리보기</span></button> : <Badge>읽기 전용 예시</Badge>}</div>
      <div className="source-status">원본 시스템: {isAuth ? 'Authentik · sso.dyhs.kr' : 'Mailcow · mail.dyhs.kr'} · API 미연결 · 동기화 이력 없음</div>
      <div className="table-container"><table><caption className="sr-only">{category} 예시 목록</caption><thead><tr><th scope="col">이름</th><th scope="col">{isAuth && category !== '사용자' ? '식별자 / 대상' : '주소'}</th><th scope="col">{category === '사용자' ? '역할' : '정보'}</th><th scope="col">상태</th></tr></thead><tbody>{rows[category].map(row => <tr key={row[1]}>{row.map(cell => <td key={cell}>{cell}</td>)}<td><Badge>미연동</Badge></td></tr>)}</tbody></table></div>
      <p className="admin-note">{category === '애플리케이션' ? '앱과 OAuth2/OpenID Connect Provider를 함께 등록하는 흐름입니다. AMS의 로그인과 출입 권한은 별도로 관리합니다.' : category === '초대 링크' ? '초대는 만료 기간과 사용 횟수를 제한합니다. 실제 발급 전에는 복사할 링크가 없습니다.' : '권한 및 관리 범위는 실제 연동 시 서버에서 별도로 검증합니다.'}</p>
    </section>
    {editor && <AdminEditor category={editor} onClose={() => setEditor(null)} />}
  </div>;
}

function AdminEditor({ category, onClose }: { category: AuthCategory; onClose: () => void }) {
  const [review, setReview] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const fields: Record<AuthCategory, { name: string; label: string; type?: string; placeholder?: string }[]> = {
    사용자: [{ name: 'username', label: '사용자 ID', placeholder: 'new-member' }, { name: 'name', label: '이름' }, { name: 'email', label: '이메일', type: 'email', placeholder: 'member@example.com' }],
    그룹: [{ name: 'name', label: '그룹 이름', placeholder: 'MAKE; 구성원' }],
    '초대 링크': [{ name: 'name', label: '초대 이름' }, { name: 'email', label: '초대 대상 이메일', type: 'email', placeholder: 'member@example.com' }],
    애플리케이션: [{ name: 'name', label: '앱 이름', placeholder: 'AMS' }, { name: 'slug', label: '앱 식별자', placeholder: 'ams' }, { name: 'redirect', label: '로그인 콜백 주소', type: 'url', placeholder: 'https://app.example/oidc/callback' }],
  };
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (Object.values(values).some(v => !v.trim())) { setError('공백만 입력할 수 없어요. 각 항목을 확인해 주세요.'); return; }
    if (category === '애플리케이션' && !validRedirectUri(values.redirect)) { setError('콜백 주소는 와일드카드, 로그인 정보, 공백, #이 없는 정확한 HTTPS 주소를 입력해 주세요.'); return; }
    setError(''); setReview(values);
  }
  return <Modal title={`${category} 등록 미리보기`} onClose={onClose} className="admin-editor">
    <form className="dialog-content admin-form" onSubmit={submit} onChange={() => { setReview(null); setError(''); }}>
      <p className="muted">연동 전에 입력 항목과 적용 범위를 확인하는 화면입니다. 서버로 전송하지 않습니다.</p>
      {fields[category].map(field => <label key={field.name} htmlFor={`admin-${field.name}`}>{field.label}<input id={`admin-${field.name}`} name={field.name} type={field.type || 'text'} required maxLength={field.name === 'redirect' ? 2048 : 150} pattern={['username', 'slug'].includes(field.name) ? '[a-z0-9][a-z0-9_-]*' : undefined} title={['username', 'slug'].includes(field.name) ? '영문 소문자와 숫자로 시작하고 소문자, 숫자, 밑줄, 하이픈을 사용하세요.' : undefined} placeholder={field.placeholder} /></label>)}
      {category === '사용자' && <label htmlFor="admin-group">소속 그룹<select id="admin-group" name="group"><option value="none">그룹 없음</option><option value="make-members">MAKE; 구성원 · 예시</option></select></label>}
      {category === '그룹' && <label htmlFor="admin-members">초기 구성원<select id="admin-members" name="members"><option value="none">구성원 없음</option><option value="example-haneul">김하늘 · 예시 계정</option><option value="example-seoyeon">이서연 · 예시 계정</option></select></label>}
      {category === '초대 링크' && <><label htmlFor="admin-expiry">유효 기간<select id="admin-expiry" name="expiry"><option value="24h">발급 후 24시간</option><option value="7d">발급 후 7일</option></select></label><p>일회용 초대 · 가입 후 일반 사용자 · 등록 흐름 연결 대기</p></>}
      {category === '애플리케이션' && <><label htmlFor="admin-protocol">로그인 방식<select id="admin-protocol" name="protocol"><option value="oidc">OpenID Connect</option><option value="oauth2">OAuth 2.0</option></select></label><label htmlFor="admin-client">앱 유형<select id="admin-client" name="client"><option value="confidential">서버 앱 (Confidential)</option><option value="public">브라우저 / 모바일 앱 (Public)</option></select></label><p>Authorization Code + PKCE · 정확한 콜백 주소 일치 · 기본 접근 거부</p></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="secondary" type="submit">변경 내용 검토</button>
      {review && <section className="admin-review" aria-label="변경 내용 검토 결과" aria-live="polite"><h3>이 내용으로 등록할 예정이에요</h3><dl>{Object.entries(review).map(([key, value]) => <div key={key}><dt>{fields[category].find(f => f.name === key)?.label || ({ group: '소속 그룹', members: '초기 구성원', expiry: '유효 기간', protocol: '로그인 방식', client: '앱 유형' })[key]}</dt><dd>{value}</dd></div>)}</dl><p>{category === '사용자' ? '계정만 등록합니다. 메일함 생성과 AMS 출입 허용은 별도 작업입니다.' : category === '그룹' ? '일반 그룹만 생성합니다. 관리자 권한이나 출입 권한을 자동 부여하지 않습니다.' : category === '초대 링크' ? '실제 초대 링크는 발급되지 않았어요. 가입 허용 그룹과 등록 흐름 검증이 필요합니다.' : 'Provider 생성 → 앱 연결 → 접근 정책 적용 순으로 처리할 예정입니다. 실패 시 복구 상태를 남깁니다.'}</p><button className="primary" disabled>연동 후 등록 가능</button></section>}
    </form>
  </Modal>;
}
