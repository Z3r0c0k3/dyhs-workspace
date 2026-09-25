import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('mail navigation, safe body, draft, settings and admin preview', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '반가워요, 하늘님.' })).toBeVisible();
  await page.getByRole('link', { name: '내 메일함 열기' }).click();
  await page.getByRole('searchbox', { name: '메일 검색' }).fill('시안');
  await expect(page.locator('.mail-row')).toHaveCount(1);
  await page.locator('.mail-row').click();
  await page.reload();
  await expect(page.locator('#message-title')).toContainText('2차 시안');
  await expect(page.frameLocator('iframe').locator('body')).toContainText('안녕하세요, 하늘님.');
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', '');
  await page.getByRole('button', { name: '전체 답장', exact: true }).click();
  await expect(page.getByLabel('참조', { exact: true })).toHaveValue('team@workspace.example');
  await expect(page.getByRole('button', { name: '메일 보내기', exact: true })).toBeDisabled();
  await page.getByLabel('메일 내용', { exact: true }).fill('한글 초안 테스트');
  await page.getByRole('button', { name: '초안 보관' }).click();
  await page.getByRole('link', { name: '임시보관함' }).click();
  await page.getByRole('button', { name: /미리보기 초안/ }).click();
  await expect(page.getByLabel('메일 내용', { exact: true })).toHaveValue('한글 초안 테스트');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /미리보기 초안/ })).toBeFocused();
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: '다크' }).check();
  await page.getByRole('button', { name: '설정 저장' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: '관리 화면은 권한이 필요해요' })).toBeVisible();
  await page.getByRole('button', { name: /김하늘/ }).click();
  await page.getByRole('checkbox', { name: '관리자 화면 미리보기' }).check();
  await expect(page.getByRole('heading', { name: /관리 콘솔/ })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [320, 768, 1440]) {
  test(`responsive navigation and WCAG AA at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const hash of ['/home', '/mail', '/mail?folder=inbox&id=welcome', '/settings', '/settings?section=mail', '/settings?section=security', '/settings?section=storage']) {
      await page.goto(`/#${hash}`);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).setLegacyMode().options({ iframes: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    }
    if (width < 1280) {
      await page.goto('/#/mail');
      await page.locator('.mail-row').first().click();
      await expect(page.locator('.mail-list')).not.toBeVisible();
      await page.getByRole('link', { name: '메일 목록으로 돌아가기' }).click();
      await expect(page.locator('.mail-list')).toBeVisible();
      await page.goBack();
      await expect(page.locator('#message-title')).toBeVisible();
    }
    await page.goto('/#/home');
    await page.getByRole('button', { name: /새 메일 쓰기/ }).click();
    expect(await page.evaluate(() => document.querySelector('dialog')!.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).setLegacyMode().options({ iframes: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '김하늘 계정 메뉴' }).click();
    await page.getByRole('checkbox', { name: '관리자 화면 미리보기' }).check();
    await page.goto('/#/admin');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).setLegacyMode().options({ iframes: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: '다크 모드로 전환' }).click();
    expect((await new AxeBuilder({ page }).setLegacyMode().options({ iframes: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  });
}

test('security shortcuts and Authentik creation previews stay separate from real operations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const mutations: string[] = [];
  page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(request.url()); });
  await page.goto('/#/settings?section=security');
  for (const label of ['패스키 관리', '2FA 설정', '비밀번호 변경']) {
    await expect(page.getByRole('button', { name: label })).toBeDisabled();
  }
  await expect(page.getByRole('link', { name: /Dyhs Auth 고급 설정/ })).toHaveAttribute('href', 'https://sso.dyhs.kr/if/user/#/settings');
  await page.getByRole('button', { name: '김하늘 계정 메뉴' }).click();
  await expect(page.getByRole('link', { name: 'Dyhs URL · 새 탭 ↗' })).toHaveAttribute('href', 'https://url.dyhs.kr');
  await page.getByRole('checkbox', { name: '관리자 화면 미리보기' }).check();
  await page.goto('/#/admin');
  for (const category of ['사용자', '그룹', '초대 링크', '애플리케이션']) {
    await page.getByRole('button', { name: category, exact: true }).click();
    await page.getByRole('button', { name: category === '초대 링크' ? '초대 만들기 미리보기' : `${category} 등록 미리보기` }).click();
    const dialog = page.getByRole('dialog');
    for (const input of await dialog.locator('input').all()) {
      const name = await input.getAttribute('name');
      await input.fill(name === 'email' ? 'new@workspace.example' : name === 'redirect' ? 'http://ams.example/callback' : 'preview');
    }
    await dialog.getByRole('button', { name: '변경 내용 검토' }).click();
    if (category === '애플리케이션') {
      await expect(dialog.getByRole('alert')).toContainText('HTTPS');
      await dialog.getByLabel('로그인 콜백 주소').fill('https://ams.example/callback');
      await dialog.getByRole('button', { name: '변경 내용 검토' }).click();
    }
    await expect(dialog.getByRole('region', { name: '변경 내용 검토 결과' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '연동 후 등록 가능' })).toBeDisabled();
    expect(await dialog.evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).setLegacyMode().options({ iframes: false }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
  }
  expect(mutations).toEqual([]);
});
