// Requires: docker compose -f infra/compose/compose.preview.yaml up -d --build --wait
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:3080';
const health = await fetch(`${origin}/healthz`);
assert.equal(health.status, 200);
assert.equal(await health.text(), 'preview-ok\n');
const home = await fetch(origin);
assert.equal(home.status, 200);
assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
const html = await home.text();
assert.match(html, /Dyhs Workspace/);
assert.match(html, /\/assets\/index-.*\.js/);
for (const path of ['/api', '/api/me', '/api/mail/send', '/api/admin/users']) {
  const response = await fetch(`${origin}${path}`, { method: path.endsWith('send') ? 'POST' : 'GET' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'PREVIEW_ONLY');
}
assert.equal((await fetch(`${origin}/.env`)).status, 404);
assert.equal((await fetch(`${origin}/brand/make-original.png`)).status, 200);
console.log('Container health, static assets, headers, API rejection and .env isolation passed.');
