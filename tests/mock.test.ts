import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterMessages, mailDocument, mailUrl, messages, parseRoute } from '../apps/web/src/mock.ts';

test('mail navigation restores only a message belonging to the selected folder', () => {
  assert.equal(parseRoute(mailUrl('inbox', 'welcome')).message?.id, 'welcome');
  assert.equal(parseRoute('#/mail?folder=trash&id=welcome').message, undefined);
  assert.equal(parseRoute('#/mail?folder=unknown').folder, 'inbox');
  assert.equal(parseRoute('#/unknown').page, 'home');
  assert.equal(parseRoute('#http://[').page, 'home');
  assert.equal(parseRoute(mailUrl('starred', 'welcome')).message?.id, 'welcome');
});

test('Korean search, unread filtering and empty folders work together', () => {
  assert.equal(filterMessages('inbox', '시안')[0]?.id, 'design');
  assert.equal(filterMessages('inbox', '', true).length, 3);
  assert.equal(filterMessages('inbox', '  WORKSPACE  ').length, 4);
  assert.equal(filterMessages('trash').length, 0);
  assert.equal(filterMessages('inbox', '<script>').length, 0);
  assert.ok(messages.every(m => m.address.endsWith('.example') && m.to.endsWith('.example')));
});

test('untrusted text cannot become HTML, script, links or remote images', () => {
  const doc = mailDocument('<script>alert(1)</script><img src="https://tracker.example/pixel"><a href="javascript:alert(1)">링크</a>');
  assert.ok(!doc.includes('<script>'));
  assert.ok(!doc.includes('<img'));
  assert.ok(!doc.includes('<a '));
  assert.ok(doc.includes('&lt;script&gt;'));
  assert.ok(doc.includes("default-src 'none'"));
});
