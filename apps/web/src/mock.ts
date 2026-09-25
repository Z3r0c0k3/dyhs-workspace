export type Folder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'spam' | 'trash' | 'project';
export type Page = 'home' | 'mail' | 'settings' | 'admin';
export type Mail = {
  id: string; folder: Folder; sender: string; address: string; to: string; cc?: string;
  subject: string; preview: string; body: string; date: string; unread?: boolean; starred?: boolean;
  attachment?: { name: string; size: string };
};
export const account = { name: '김하늘', email: 'haneul@workspace.example' };
export const folders: { id: Folder; label: string; icon: string }[] = [
  { id: 'inbox', label: '받은편지함', icon: 'inbox' }, { id: 'starred', label: '중요 메일', icon: 'star' },
  { id: 'sent', label: '보낸편지함', icon: 'send' }, { id: 'drafts', label: '임시보관함', icon: 'file' },
  { id: 'spam', label: '스팸', icon: 'shield' }, { id: 'trash', label: '휴지통', icon: 'trash' },
  { id: 'project', label: '프로젝트', icon: 'folder' },
];
export const messages: Mail[] = [
  { id: 'welcome', folder: 'inbox', sender: 'Workspace 팀', address: 'hello@workspace.example', to: account.email,
    subject: '함께 만드는 새로운 작업 공간, Dyhs Workspace', preview: '하늘님, 반가워요. 필요한 모든 일을 한곳에서 시작해 보세요.',
    body: '하늘님, 반가워요!\n\nDyhs Workspace에 오신 것을 환영합니다.\n메일을 확인하고, 내 계정을 관리하고, 함께할 일을 준비하는 공간입니다.\n\n작은 일부터, 한곳에서\n받은편지함에서 새로운 소식을 확인하고 새 메일을 작성해 보세요. 개인 설정에서는 나에게 편한 화면을 선택할 수 있어요.\n\n지금 보고 계신 화면은 미리보기입니다. 모든 메일과 계정은 예시이며, 실제 메일을 보내거나 변경하지 않습니다.\n\n여러분의 하루가 조금 더 간결해지길 바랍니다.\nWorkspace 팀 드림', date: '2026-09-24T10:30:00+09:00', unread: true, starred: true },
  { id: 'design', folder: 'inbox', sender: '이서연', address: 'seoyeon@workspace.example', to: account.email, cc: 'team@workspace.example',
    subject: '[디자인] 2차 시안과 피드백을 공유해요', preview: '어제 이야기한 내용을 반영했어요. 첨부한 파일을 확인해 주세요.',
    body: '안녕하세요, 하늘님.\n\n어제 회의에서 이야기한 내용을 반영해 2차 디자인 시안을 정리했습니다.\n\n이번에는 메일을 읽는 흐름과 모바일 화면을 중심으로 다듬었어요. 버튼 간격과 글자 크기도 함께 확인 부탁드립니다.\n\n금요일까지 의견을 남겨 주시면 다음 시안에 반영할게요.\n감사합니다.\n\n이서연 드림', date: '2026-09-24T09:42:00+09:00', unread: true, attachment: { name: '워크스페이스_디자인_시안.pdf', size: '2.4 MB' } },
  { id: 'meeting', folder: 'inbox', sender: '박지우', address: 'jiwoo@workspace.example', to: account.email,
    subject: '이번 주 프로젝트 미팅 안내', preview: '목요일 오후 3시에 만나요. 이야기할 안건을 미리 공유합니다.',
    body: '안녕하세요!\n\n이번 주 프로젝트 미팅을 안내합니다.\n\n일시: 9월 24일 목요일 오후 3시\n장소: 온라인 회의실\n\n함께 이야기할 내용\n1. 지난주 진행 사항 돌아보기\n2. 새 작업 공간 사용 경험 나누기\n3. 다음 주 일정 정하기\n\n편하게 의견을 준비해 주세요.\n미팅에서 뵙겠습니다.', date: '2026-09-24T09:10:00+09:00', unread: true },
  { id: 'notes', folder: 'inbox', sender: '최도윤', address: 'doyun@workspace.example', to: account.email,
    subject: '어제 회의록 정리해서 보내드려요', preview: '결정된 내용과 다음 할 일을 정리했습니다.', body: '하늘님, 안녕하세요.\n\n어제 회의에서 결정한 내용을 공유합니다.\n\n우선 메일과 계정 관리에 집중하고, 캘린더와 주소록은 다음 단계에서 준비하기로 했습니다.\n\n놓친 내용이 있다면 답장으로 알려 주세요.\n감사합니다.', date: '2026-09-23T16:20:00+09:00', starred: true },
  { id: 'newsletter', folder: 'inbox', sender: '메이커 노트', address: 'notes@news.example', to: account.email,
    subject: '9월의 기록 — 더 나은 일상을 만드는 작은 변화', preview: '함께 만든 이야기와 새로운 소식을 모아 전해 드립니다.', body: '이번 달에도 함께해 주셔서 감사합니다.\n\n작은 아이디어들이 모여 일상의 변화를 만듭니다. 이번 달에는 우리에게 정말 필요한 도구가 무엇인지 함께 고민했어요.\n\n다음 소식에서 만나요!', date: '2026-09-23T11:00:00+09:00' },
  { id: 'feedback', folder: 'sent', sender: account.name, address: account.email, to: 'seoyeon@workspace.example',
    subject: 'Re: 첫 번째 시안에 대한 의견', preview: '전체적인 방향이 좋아요. 몇 가지 의견을 정리했습니다.', body: '서연님, 안녕하세요.\n\n첫 번째 시안을 잘 확인했습니다. 모바일에서도 메일 본문을 편하게 읽을 수 있도록 여백을 조정하면 좋겠어요.\n\n감사합니다.', date: '2026-09-22T14:20:00+09:00' },
  { id: 'project-note', folder: 'project', sender: '프로젝트 팀', address: 'team@workspace.example', to: account.email,
    subject: '프로젝트 시작을 위한 체크리스트', preview: '목표와 일정, 각자의 역할을 함께 확인해 주세요.', body: '프로젝트 준비 사항입니다.\n\n목표 확인\n역할 나누기\n첫 일정 정하기\n\n차근차근 함께 만들어 가요.', date: '2026-09-21T10:00:00+09:00' },
];

export function filterMessages(folder: Folder, query = '', unreadOnly = false) {
  const search = query.trim().toLocaleLowerCase();
  return messages.filter(mail => (folder === 'starred' ? mail.starred : mail.folder === folder)
    && (!unreadOnly || mail.unread)
    && `${mail.sender} ${mail.address} ${mail.subject} ${mail.preview}`.toLocaleLowerCase().includes(search));
}
export function parseRoute(hash: string) {
  let url: URL;
  try { url = new URL(hash.replace(/^#/, '') || '/home', 'https://workspace.example'); }
  catch { url = new URL('https://workspace.example/home'); }
  const page = (['home', 'mail', 'settings', 'admin'].includes(url.pathname.slice(1)) ? url.pathname.slice(1) : 'home') as Page;
  const folder = (folders.some(f => f.id === url.searchParams.get('folder')) ? url.searchParams.get('folder') : 'inbox') as Folder;
  const id = url.searchParams.get('id');
  const message = messages.find(m => m.id === id && (folder === 'starred' ? m.starred : m.folder === folder));
  return { page, folder, message, section: url.searchParams.get('section') || 'general' };
}
export function mailUrl(folder: Folder = 'inbox', id?: string) {
  const params = new URLSearchParams({ folder });
  if (id) params.set('id', id);
  return `#/mail?${params}`;
}
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
// Preview accepts text only. Real MIME/HTML needs a maintained sanitizer before integration.
export function mailDocument(text: string) {
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:0;padding:4px;color:#000;background:#fff;font:16px/1.9 sans-serif;overflow-wrap:anywhere}p{white-space:pre-wrap;margin:0}</style></head><body><p>${escapeHtml(text)}</p></body></html>`;
}
