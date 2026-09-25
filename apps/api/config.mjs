import { readFileSync } from 'node:fs';

export const permissions = ['identity.users.read', 'identity.users.create', 'identity.groups.read', 'identity.groups.create'];

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function https(value, name, originOnly = false) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== '/')) throw new Error(`${name} must be a clean HTTPS ${originOnly ? 'origin' : 'URL'}`);
  return originOnly ? url.origin : url.href;
}

export function loadConfig(env = process.env) {
  const publicUrl = https(required(env, 'WORKSPACE_PUBLIC_URL'), 'WORKSPACE_PUBLIC_URL', true);
  const issuer = https(required(env, 'OIDC_ISSUER'), 'OIDC_ISSUER');
  const authOrigin = https(required(env, 'AUTHENTIK_BASE_URL'), 'AUTHENTIK_BASE_URL', true);
  if (new URL(issuer).origin !== authOrigin) throw new Error('OIDC issuer must belong to AUTHENTIK_BASE_URL');
  const flows = {};
  for (const [name, variable] of Object.entries({ password: 'AUTHENTIK_PASSWORD_FLOW', passkey: 'AUTHENTIK_PASSKEY_FLOW', mfa: 'AUTHENTIK_MFA_FLOW' })) {
    const slug = env[variable]?.trim();
    if (slug && !/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) throw new Error(`Invalid ${variable}`);
    flows[name] = slug ? `${authOrigin}/if/flow/${slug}/` : null;
  }
  const userPath = env.AUTHENTIK_USER_PATH?.trim() || '';
  if (userPath && !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(userPath)) throw new Error('Invalid AUTHENTIK_USER_PATH');
  const groupIds = (env.AUTHENTIK_GROUP_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (groupIds.some(id => !/^[a-f0-9-]{36}$/i.test(id))) throw new Error('Invalid AUTHENTIK_GROUP_IDS');
  const port = Number(env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  let mail = null;
  if (env.MAIL_ACCESS_MODE && !['app-password', 'sso-auto'].includes(env.MAIL_ACCESS_MODE)) throw new Error('Unsupported MAIL_ACCESS_MODE');
  if (env.MAIL_ACCESS_MODE) {
    const accounts = env.MAIL_ACCESS_MODE === 'app-password' ? JSON.parse(readFileSync(required(env, 'MAIL_ACCOUNTS_PATH'), 'utf8')) : [];
    if (!Array.isArray(accounts)) throw new Error('Mail accounts must be an array');
    const subs = new Set(), addresses = new Set();
    for (const account of accounts) {
      if (typeof account.sub !== 'string' || !account.sub || subs.has(account.sub) || typeof account.address !== 'string' || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(account.address) || addresses.has(account.address.toLowerCase()) || typeof account.password !== 'string' || !account.password) throw new Error('Invalid or duplicate mail account mapping');
      subs.add(account.sub); addresses.add(account.address.toLowerCase());
    }
    const host = required(env, 'MAIL_HOST');
    if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('MAIL_HOST must be a TLS hostname');
    const idSecret = required(env, 'MAIL_ID_SECRET');
    if (!/^[a-f0-9]{64}$/i.test(idSecret)) throw new Error('MAIL_ID_SECRET must be 32 random bytes encoded as hex');
    mail = { mode: env.MAIL_ACCESS_MODE, accounts, host, idSecret, writes: env.MAIL_ACCESS_MODE === 'sso-auto' ? env.MAIL_ENABLE_SEND !== 'false' : env.MAIL_ENABLE_SEND === 'true' };
    if (mail.mode === 'sso-auto') {
      const apiUrl = https(required(env, 'MAILCOW_API_URL'), 'MAILCOW_API_URL', true);
      const credentialKey = required(env, 'MAIL_CREDENTIAL_KEY');
      if (!/^[a-f0-9]{64}$/i.test(credentialKey)) throw new Error('MAIL_CREDENTIAL_KEY must be 32 random bytes encoded as hex');
      const domains = required(env, 'MAIL_ALLOWED_DOMAINS').toLowerCase().split(',').map(value => value.trim());
      if (domains.some(domain => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain))) throw new Error('Invalid MAIL_ALLOWED_DOMAINS');
      mail.auto = { apiUrl, credentialKey, domains, apiKey: required(env, 'MAILCOW_API_KEY') };
    }
  }
  return {
    publicUrl, issuer, authOrigin, flows, userPath, groupIds, port, mail,
    clientId: required(env, 'OIDC_CLIENT_ID'), clientSecret: required(env, 'OIDC_CLIENT_SECRET'),
    databaseUrl: required(env, 'DATABASE_URL'),
    apiToken: env.AUTHENTIK_API_TOKEN?.trim() || '',
    adminWrites: env.AUTHENTIK_ENABLE_WRITES === 'true',
    redirectUri: `${publicUrl}/auth/callback`,
    sessionSeconds: 900,
  };
}

export function grants(session) {
  return session.profile?.workspaceAdmin === true ? permissions : [];
}
