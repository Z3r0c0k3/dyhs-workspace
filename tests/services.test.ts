import assert from 'node:assert/strict';
import { test } from 'node:test';
import { services, validRedirectUri } from '../apps/web/src/services.ts';

test('provider form accepts precise HTTPS callbacks and rejects ambiguous or unsafe URIs', () => {
  assert.equal(validRedirectUri('https://ams.example/oidc/callback'), true);
  for (const url of ['javascript:alert(1)', 'http://ams.example/cb', 'https:ams.example/cb', 'https://user:pass@ams.example/cb', 'https://ams.example/#', 'https://ams.example/#cb', 'https://*.example/cb', 'https://ams.example/%2a', 'https://ams.example/ cb', ' https://ams.example/cb', 'https://ams.example/\\cb', 'bad']) {
    assert.equal(validRedirectUri(url), false, url);
  }
  assert.equal(new URL(services.authSettings).origin, services.auth);
  assert.equal(new URL(services.mail).hostname, 'mail.dyhs.kr');
  assert.equal(new URL(services.url).hostname, 'url.dyhs.kr');
});
