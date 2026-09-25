// Requires a built dyhs-workspace-live-web:local image and the isolated PostgreSQL test DB.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const run = promisify(execFile);
assert.ok(process.env.TEST_DATABASE_URL, 'An isolated TEST_DATABASE_URL is required');
const directory = await mkdtemp(join(tmpdir(), 'dyhs-live-smoke-'));
const name = `dyhs-workspace-live-smoke-${process.pid}`;
let container = false, provider;
try {
  await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-days', '1', '-subj', '/CN=host.docker.internal', '-addext', 'subjectAltName=DNS:host.docker.internal']);
  let authOrigin;
  provider = createServer({ key: await readFile(join(directory, 'key.pem')), cert: await readFile(join(directory, 'cert.pem')) }, (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ issuer: `${authOrigin}/issuer/`, authorization_endpoint: `${authOrigin}/authorize`, token_endpoint: `${authOrigin}/token`, jwks_uri: `${authOrigin}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] }));
  });
  provider.listen(0, '0.0.0.0'); await once(provider, 'listening');
  authOrigin = `https://host.docker.internal:${provider.address().port}`;
  const database = new URL(process.env.TEST_DATABASE_URL); database.hostname = 'host.docker.internal';
  await run('docker', ['run', '-d', '--rm', '--name', name, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--memory', '512m', '--cpus', '0.5', '-p', '127.0.0.1::8080',
    '-v', `${join(directory, 'cert.pem')}:/run/test-ca.pem:ro`,
    '-e', 'NODE_EXTRA_CA_CERTS=/run/test-ca.pem', '-e', 'WORKSPACE_PUBLIC_URL=https://workspace.example', '-e', `AUTHENTIK_BASE_URL=${authOrigin}`, '-e', `OIDC_ISSUER=${authOrigin}/issuer/`, '-e', 'OIDC_CLIENT_ID=container-test', '-e', 'OIDC_CLIENT_SECRET=container-test-secret', '-e', `DATABASE_URL=${database.href}`,
    '-e', 'MAIL_ACCESS_MODE=sso-auto', '-e', 'MAIL_HOST=mail.workspace.example', '-e', `MAIL_ID_SECRET=${'a'.repeat(64)}`, '-e', `MAIL_CREDENTIAL_KEY=${'b'.repeat(64)}`, '-e', `MAILCOW_API_URL=${authOrigin}`, '-e', 'MAILCOW_API_KEY=test-only-key', '-e', 'MAIL_ALLOWED_DOMAINS=workspace.example', 'dyhs-workspace-live-web:local']);
  container = true;
  const port = (await run('docker', ['port', name, '8080'])).stdout.trim().split(':').at(-1);
  const origin = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { const response = await fetch(`${origin}/healthz`); healthy = response.ok && (await response.json()).mode === 'live'; if (healthy) break; } catch { /* Allow startup and discovery. */ }
    await setTimeout(250);
  }
  if (!healthy) throw new Error(`Container startup failed: ${(await run('docker', ['logs', name])).stderr}`);
  assert.equal((await run('docker', ['exec', name, 'id', '-u'])).stdout.trim(), '1000');
  assert.match(await (await fetch(origin)).text(), /workspace-mode" content="live/);
  assert.equal((await fetch(`${origin}/brand/make-original.png`)).status, 200);
  assert.equal((await fetch(`${origin}/api/me`)).status, 401);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
  const login = await fetch(`${origin}/auth/login`, { redirect: 'manual' });
  assert.equal(login.status, 303);
  assert.match(new URL(login.headers.get('location')).searchParams.get('scope'), /workspace_mail/);
  assert.equal(new URL(login.headers.get('location')).origin, authOrigin);
  assert.match(login.headers.get('set-cookie'), /HttpOnly.*Secure/);
  console.log('Live container: automatic mail configuration without a manual account file, TLS OIDC discovery, PostgreSQL, non-root/read-only runtime, assets, authentication boundary and login redirect passed.');
} finally {
  if (container) await run('docker', ['rm', '-f', name]);
  if (provider) await new Promise(resolve => provider.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
