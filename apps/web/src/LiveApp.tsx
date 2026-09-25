import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from './Icon';
import { services } from './services';
import { api } from './live-api';
import { LiveMail } from './LiveMail';

type Me = {
  displayName: string; email: string | null; subject: string; mailbox: string | null; csrfToken: string; permissions: string[];
  capabilities: { mail: boolean; mailSend: boolean; calendar: boolean; identity: boolean; identityWrites: boolean };
  security: { password: string | null; passkey: string | null; mfa: string | null; advanced: string }; adminUrl: string;
};
type Row = { id: string; name: string; username?: string; email?: string; active?: boolean };
function Logo() { return <span className="make-logo"><span className="make-crop"><img src="/brand/make-original.png" alt="MAKE;" width="1000" height="1000" /></span></span>; }

export function LiveApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(location.hash.slice(2) || 'home');
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('dyhs-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } });
  useEffect(() => {
    let active = true;
    api('/api/me', undefined, false).then(value => { if (active) setMe(value); }).catch(reason => { if (active && !reason.message.includes('세션')) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    const expired = () => { setMe(null); setError('세션이 만료되었습니다. 다시 로그인해 주세요.'); };
    const navigate = () => setPage(location.hash.slice(2) || 'home');
    addEventListener('session-expired', expired); addEventListener('hashchange', navigate);
    return () => { active = false; removeEventListener('session-expired', expired); removeEventListener('hashchange', navigate); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('dyhs-theme', theme); } catch { /* Theme still applies for this visit. */ }
  }, [theme]);
  async function logout() {
    if (!me) return;
    try {
      await api('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: '{}' });
      setMe(null); setError(''); history.replaceState(null, '', '/');
    } catch (reason) { setError((reason as Error).message); }
  }
  if (loading) return <main className="end-screen"><p role="status">계정을 확인하고 있습니다…</p></main>;
  if (!me) return <main className="end-screen live-login"><Logo /><span className="eyebrow">DYHS WORKSPACE</span><h1>일상이 이어지는 작업 공간</h1><p>Dyhs Auth 계정으로 로그인하세요.</p>{(error || location.search.includes('auth_error=')) && <p role="alert">{error || '로그인을 완료하지 못했습니다. 다시 시도해 주세요.'}</p>}<a className="primary" href="/auth/login">Dyhs Auth로 로그인 <Icon name="arrow" /></a><small>운영 · MAKE; · 학교 공식 서비스가 아닙니다.</small></main>;
  const canAdmin = me.permissions.length > 0;
  const navigation = [['home', '홈', 'home'], ['mail', '메일', 'mail'], ['settings', '계정 및 보안', 'settings'], ...(canAdmin ? [['admin', '관리', 'shield']] : [])];
  return <div className="live-workspace">
    <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>본문으로 건너뛰기</a>
    <header className="live-header"><a href="#/home" className="live-brand"><Logo /><strong>Dyhs Workspace</strong></a><div className="live-actions"><span>{me.displayName}</span><button className="icon-button" aria-label={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button><button className="secondary" onClick={logout}>로그아웃</button></div></header>
    <nav className="live-nav" aria-label="제품 탐색">{navigation.map(([id, label, icon]) => <a key={id} href={`#/${id}`} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined}><Icon name={icon} size={18} />{label}</a>)}<a href={services.url} target="_blank" rel="noopener noreferrer">Dyhs URL ↗</a></nav>
    <main id="main" tabIndex={-1} className="live-main">
      {error && <p className="notice" role="alert">{error}</p>}
      {page === 'home' && <><div className="page-heading"><div><span className="eyebrow">YOUR DAY, ALL TOGETHER</span><h1>반가워요, {me.displayName}님.</h1><p>필요한 서비스와 계정 설정을 한곳에서 확인하세요.</p></div><span className="badge">Dyhs Auth 연결됨</span></div><section className="welcome-card"><div><span className="hero-label">나의 일상이 이어지는 곳</span><h2>작은 일부터, 큰 아이디어까지.<br />이제 하나의 Workspace에서.</h2><p>메일과 계정, 필요한 도구를 더 가까이.</p><a className="hero-button" href={services.mail} target="_blank" rel="noopener noreferrer">Dyhs Mail 열기 ↗</a></div></section><div className="live-cards"><section className="panel"><Icon name="shield" /><h2>내 계정</h2><p>{me.email || '확인된 이메일 없음'}</p><a className="secondary" href="#/settings">계정 및 보안</a></section><section className="panel"><Icon name="mail" /><h2>메일·캘린더</h2><p>Workspace 메일 연결을 준비 중입니다. 기존 Dyhs Mail을 계속 이용할 수 있습니다.</p><a className="secondary" href={services.mail} target="_blank" rel="noopener noreferrer">기존 메일 서비스 ↗</a></section></div></>}
      {page === 'mail' && (me.capabilities.mail ? <LiveMail me={me} /> : <section className="panel live-empty"><Icon name="mail" size={32} /><h1>메일함 연결 대기</h1><p>본인 메일함의 접근 권한을 확인한 뒤 Workspace에서 사용할 수 있습니다.</p><a className="primary" href={services.mail} target="_blank" rel="noopener noreferrer">Dyhs Mail 열기 ↗</a></section>)}
      {page.startsWith('settings') && <><div className="page-heading"><div><span className="eyebrow">ACCOUNT & SECURITY</span><h1>계정 및 보안</h1><p>보안 설정은 Dyhs Auth에서 본인 인증 후 적용합니다.</p></div></div><section className="panel settings-panel"><div className="profile-summary"><span className="avatar large">{me.displayName.slice(0, 1)}</span><div><h2>{me.displayName}</h2><p>{me.email || '확인된 이메일 없음'}</p></div></div>{([['passkey', '패스키', '패스키 관리'], ['mfa', '2단계 인증 (2FA)', '2FA 설정'], ['password', '비밀번호', '비밀번호 변경']] as const).map(([key, label, action]) => <div className="setting-row security-action" key={key}><div><strong>{label}</strong><p>{me.security[key] ? 'Dyhs Auth의 본인 설정 화면으로 이동합니다.' : '설정 경로 연결 대기 · 고급 설정에서 관리할 수 있습니다.'}</p></div>{me.security[key] ? <a className="secondary" href={me.security[key]!}>{action} ↗</a> : <button className="secondary" disabled>{action}</button>}</div>)}<div className="advanced-settings"><div><h3>더 자세한 계정 설정</h3><p>프로필, 로그인 세션과 기타 기능을 관리합니다.</p></div><a className="secondary" href={me.security.advanced}>Dyhs Auth 고급 설정 ↗</a></div><details className="live-identity"><summary>계정 연결 식별자</summary><p>관리자가 메일함과 권한을 연결할 때 사용하는 본인 식별자입니다.</p><code>{me.subject}</code></details></section></>}
      {page === 'admin' && (canAdmin ? <LiveAdmin me={me} /> : <section className="panel live-empty"><h1>관리 권한이 필요합니다</h1><p>운영자에게 접근 권한을 요청해 주세요.</p></section>)}
      {!['home', 'mail', 'admin'].includes(page) && !page.startsWith('settings') && <section className="panel live-empty"><h1>페이지를 찾을 수 없습니다</h1><a href="#/home">홈으로 돌아가기</a></section>}
      <footer className="page-footer"><div className="school-identity"><span className="school-logo"><img src="/brand/deokyeong-original.jpg" width="1000" height="1000" alt="덕영고등학교 · Dreams of Youth" /></span><div><strong>덕영고 구성원을 위한 작업 공간</strong><span>운영 · MAKE;</span><small>학교 공식 서비스가 아닙니다.</small></div></div></footer>
    </main>
  </div>;
}

function LiveAdmin({ me }: { me: Me }) {
  const categories = (['users', 'groups'] as const).filter(kind => me.permissions.includes(`identity.${kind}.read`) || me.permissions.includes(`identity.${kind}.create`));
  const [kind, setKind] = useState<'users' | 'groups'>(categories[0] || 'users');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; hasNext: boolean } | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [operation, setOperation] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setData(null); setError('');
    if (me.permissions.includes(`identity.${kind}.read`)) api(`/api/admin/${kind}?page=${page}`).then(value => { if (active) setData(value); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [kind, page, refresh, me.permissions]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (pending) return;
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const key = operation || crypto.randomUUID(); setOperation(key); setPending(true); setError(''); setResult('');
    try {
      const created = await api(`/api/admin/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken, 'Idempotency-Key': key }, body: JSON.stringify(body) });
      setResult(`${kind === 'users' ? '비활성 사용자' : '일반 그룹'} 등록 완료 · 작업 ${created.operationId}`); setRefresh(value => value + 1);
    } catch (reason) { setError(`${(reason as Error).message} 작업 ${key}`); }
    finally { setPending(false); }
  }
  return <><div className="page-heading"><div><span className="eyebrow">WORKSPACE ADMINISTRATION</span><h1>관리 콘솔</h1><p>허용된 범위의 Dyhs Auth 계정과 그룹을 관리합니다.</p></div><a className="secondary" href={me.adminUrl} target="_blank" rel="noopener noreferrer">Authentik 고급 관리 ↗</a></div><section className="panel admin-table-panel"><nav className="admin-tabs" aria-label="관리 항목">{categories.map(category => <button key={category} disabled={pending} aria-pressed={kind === category} className={kind === category ? 'active' : ''} onClick={() => { setKind(category); setPage(1); setOperation(null); setResult(''); }}>{category === 'users' ? '사용자' : '그룹'}</button>)}</nav><div className="live-admin-body">
    {error && <p role="alert" className="form-error">{error}</p>}{result && <p role="status">{result}</p>}
    {data && <><div className="table-container"><table><caption className="sr-only">{kind === 'users' ? '사용자' : '그룹'} 목록</caption><thead><tr><th scope="col">이름</th><th scope="col">식별자</th><th scope="col">상태</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.email || row.id}</td><td>{kind === 'users' ? row.active ? '활성' : '비활성' : '일반 그룹'}</td></tr>)}</tbody></table></div>{data.items.length === 0 && <p>표시할 항목이 없습니다.</p>}<div className="live-actions"><button className="secondary" disabled={page === 1 || pending} onClick={() => setPage(page - 1)}>이전</button><span>{page} 페이지</span><button className="secondary" disabled={!data.hasNext || pending} onClick={() => setPage(page + 1)}>다음</button></div></>}
    {me.permissions.includes(`identity.${kind}.create`) && <form key={kind} className="admin-form live-create" onSubmit={create} onChange={() => { if (!pending) { setOperation(null); setResult(''); } }}><h2>{kind === 'users' ? '사용자 등록' : '그룹 등록'}</h2><p>{kind === 'users' ? '비활성 일반 계정을 만듭니다. 활성화·메일함 생성·그룹 및 출입 권한 부여는 고급 관리에서 별도로 진행하세요.' : '구성원과 권한이 없는 일반 그룹을 만듭니다.'}</p><fieldset disabled={pending || !me.capabilities.identityWrites}>{kind === 'users' && <label>사용자 ID<input name="username" required maxLength={150} pattern="[a-z0-9][a-z0-9_-]*" /></label>}<label>{kind === 'users' ? '이름' : '그룹 이름'}<input name="name" required maxLength={150} /></label>{kind === 'users' && <label>이메일<input name="email" type="email" required maxLength={150} /></label>}<button className="primary" type="submit">{pending ? '처리 중…' : result ? '결과 다시 확인' : operation ? '같은 작업 결과 확인' : '등록'}</button></fieldset>{!me.capabilities.identityWrites && <p>생성 기능은 관리 API 검증 후 활성화됩니다.</p>}</form>}
    <p className="muted">초대 링크와 OAuth/OIDC 앱 생성, 계정 활성화·삭제 및 그룹 구성원 변경은 현재 Authentik 고급 관리에서 진행하세요.</p>
  </div></section></>;
}
