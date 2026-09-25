import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const me = { displayName: '테스트 사용자', email: 'member@workspace.example', subject: 'test-sub', csrfToken: 'test-csrf', mailbox: 'member@workspace.example', permissions: ['identity.users.read', 'identity.users.create', 'identity.groups.read', 'identity.groups.create'], capabilities: { mail: true, mailSend: true, calendar: false, identity: true, identityWrites: true }, security: { password: 'https://auth.example/if/flow/password/', passkey: 'https://auth.example/if/flow/passkey/', mfa: null, advanced: 'https://auth.example/if/user/#/settings' }, adminUrl: 'https://auth.example/if/admin/' };
test('live login has no example account or administrator toggle', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ status: 401, json: { code: 'SESSION_EXPIRED' } }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Dyhs Auth로 로그인' })).toHaveAttribute('href', '/auth/login');
  await expect(page.getByText('김하늘')).toHaveCount(0);
  await expect(page.getByText('세션이 만료되었습니다. 다시 로그인해 주세요.')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});

for (const width of [320, 768, 1440]) test(`live account, management and mail workflows at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  let authenticated = true;
  let sent = 0;
  const external: string[] = [];
  page.on('request', request => { if (request.url().includes('tracker.example')) external.push(request.url()); });
  await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname === '/api/me') return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? me : { code: 'SESSION_EXPIRED' } });
    if (url.pathname === '/api/logout') { expect(request.headers()['x-csrf-token']).toBe('test-csrf'); authenticated = false; return route.fulfill({ status: 204 }); }
    if (url.pathname === '/api/admin/users' || url.pathname === '/api/admin/groups') {
      if (request.method() === 'POST') return route.fulfill({ status: 201, json: { operationId: 'test-operation', status: 'completed', objectId: '10' } });
      return route.fulfill({ json: { items: [{ id: '10', name: '일반 계정', email: 'another@workspace.example', active: false }], hasNext: false } });
    }
    if (url.pathname === '/api/mail/folders') return route.fulfill({ json: [{ id: 'INBOX', name: '받은편지함', unread: 1 }] });
    if (url.pathname === '/api/mail/messages') return route.fulfill({ json: { items: [{ id: 'message-1', subject: '한글 메일', from: 'sender@workspace.example', receivedAt: null, unread: true }], nextCursor: null } });
    if (url.pathname === '/api/mail/messages/message-1') return route.fulfill({ json: { id: 'message-1', subject: '한글 메일', from: ['sender@workspace.example'], to: [me.mailbox], cc: ['team@workspace.example'], text: '<script>window.compromised = true</script> 한글 본문', attachments: [{ id: '0', filename: '한글.txt', size: 10 }] } });
    if (url.pathname.endsWith('/actions')) return route.fulfill({ status: 204 });
    if (url.pathname === '/api/mail/send') {
      sent++; const body = request.postDataJSON(); expect(body.from).toBeUndefined(); expect(body.to).toEqual(['sender@workspace.example']); expect(body.attachments[0].name).toBe('한글.txt'); expect(request.headers()['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);
      return route.fulfill({ json: { operationId: request.headers()['idempotency-key'], status: 'sent_copy_failed' } });
    }
    if (url.pathname.startsWith('/api/mail/operations/')) return route.fulfill({ json: { status: 'sent_copy_failed' } });
    return route.fulfill({ status: 404, json: { message: 'Unsupported test route' } });
  });
  for (const path of ['home', 'settings', 'admin', 'mail']) {
    await page.goto(`/#/${path}`);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
    if (path === 'mail') await expect(page.getByRole('button', { name: /한글 메일/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([]);
  }
  await page.getByRole('button', { name: /한글 메일/ }).click();
  await expect(page.locator('.live-mail-text')).toContainText('<script>');
  expect(await page.evaluate(() => (window as Window & { compromised?: boolean }).compromised)).toBeUndefined();
  await expect(page.getByRole('link', { name: /한글.txt/ })).toHaveAttribute('href', '/api/mail/messages/message-1/attachments/0');
  await page.getByRole('button', { name: '전체 답장', exact: true }).click();
  await expect(page.getByLabel('참조', { exact: true })).toHaveValue('team@workspace.example');
  await page.getByLabel('첨부 파일 · 최대 10 MB').setInputFiles({ name: '한글.txt', mimeType: 'text/plain', buffer: Buffer.from('첨부') });
  await page.getByRole('button', { name: '메일 보내기', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('보낸편지함 저장에 실패');
  await expect(page.getByRole('button', { name: '메일 보내기', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '결과 확인' }).click(); expect(sent).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(external).toEqual([]);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('link', { name: 'Dyhs Auth로 로그인' })).toBeVisible();
});
