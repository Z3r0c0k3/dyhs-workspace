import { mkdir, writeFile, access, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const directory = new URL('../infra/secrets/', import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
for (const name of ['workspace.env', 'roles.json', 'mailboxes.json']) {
  try { await access(new URL(name, directory)); throw new Error(`${name} already exists; existing configuration was not replaced`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await writeFile(new URL('workspace.env', directory), `WORKSPACE_PUBLIC_URL=https://workspace.dyhs.kr
AUTHENTIK_BASE_URL=https://sso.dyhs.kr
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}
AUTHENTIK_API_TOKEN=
AUTHENTIK_USER_PATH=workspace
AUTHENTIK_GROUP_IDS=
AUTHENTIK_ENABLE_WRITES=false
AUTHENTIK_PASSWORD_FLOW=
AUTHENTIK_PASSKEY_FLOW=
AUTHENTIK_MFA_FLOW=
MAIL_ACCESS_MODE=sso-auto
MAIL_HOST=mail.dyhs.kr
MAIL_ID_SECRET=${randomBytes(32).toString('hex')}
MAIL_ENABLE_SEND=true
MAILCOW_API_URL=https://mail.dyhs.kr
MAILCOW_API_KEY=
MAIL_ALLOWED_DOMAINS=
MAIL_CREDENTIAL_KEY=${randomBytes(32).toString('hex')}
`, { mode: 0o600, flag: 'wx' });
// This file contains authorization rules, not passwords. Parent directory is private;
// the unprivileged container must be able to read the bind-mounted file.
await writeFile(new URL('roles.json', directory), '{"subjects":[]}\n', { mode: 0o644, flag: 'wx' });
await writeFile(new URL('mailboxes.json', directory), '[]\n', { mode: 0o644, flag: 'wx' });
console.log('Created infra/secrets configuration files. Keep this directory private. Set OIDC, Mailcow API key and allowed mail domains before starting. No secrets printed.');
