import * as oidc from 'openid-client';

export async function connectOidc(config, fetcher = fetch) {
  // Fixed server configuration only. Redirects cannot carry credentials to another origin.
  const transport = (url, options) => {
    if (new URL(url).origin !== config.authOrigin) throw new Error('Unexpected OIDC endpoint origin');
    return fetcher(url, { ...options, redirect: 'error' });
  };
  const client = await oidc.discovery(new URL(config.issuer), config.clientId, config.clientSecret, undefined, { timeout: 10, [oidc.customFetch]: transport });
  oidc.enableNonRepudiationChecks(client);
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    const endpoint = client.serverMetadata()[key];
    if (!endpoint || new URL(endpoint).origin !== config.authOrigin) throw new Error(`Invalid OIDC ${key}`);
  }
  return {
    async start() {
      const verifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const url = oidc.buildAuthorizationUrl(client, {
        redirect_uri: config.redirectUri, scope: `openid profile email${config.mail?.mode === 'sso-auto' ? ' workspace_mail' : ''}`, response_type: 'code',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce,
        // Require current account authentication; a local logout cannot silently reuse SSO.
        prompt: 'login', max_age: '0',
      });
      return { url: url.href, data: { verifier, state, nonce } };
    },
    async complete(url, transaction) {
      const tokens = await oidc.authorizationCodeGrant(client, url, { pkceCodeVerifier: transaction.verifier, expectedState: transaction.state, expectedNonce: transaction.nonce, idTokenExpected: true, maxAge: 0 });
      const claims = tokens.claims();
      if (!claims || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new Error('Invalid OIDC subject');
      // Only this administrator-controlled, signed claim can select an automatic mailbox.
      // The editable display email is never used as a fallback.
      return {
        sub: claims.sub,
        profile: {
          // Membership comes only from the verified ID token, never request headers or profile input.
          workspaceAdmin: Array.isArray(claims.groups) && claims.groups.every(group => typeof group === 'string') && claims.groups.includes('dyhs-admins'),
          name: typeof claims.name === 'string' ? claims.name.slice(0, 150) : 'Workspace 사용자',
          email: claims.email_verified === true && typeof claims.email === 'string' ? claims.email.slice(0, 254) : null,
          ...(config.mail?.mode === 'sso-auto' ? { mailboxClaim: typeof claims.workspace_mailbox === 'string' ? claims.workspace_mailbox : null } : {}),
        },
      };
    },
  };
}
