// Public navigation URLs supplied by the operator. No credentials or API tokens.
export const services = {
  auth: 'https://sso.dyhs.kr',
  authSettings: 'https://sso.dyhs.kr/if/user/#/settings',
  mail: 'https://mail.dyhs.kr',
  url: 'https://url.dyhs.kr',
} as const;

// Form validation only; the future API must independently enforce its host allowlist.
export function validRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return /^https:\/\//.test(value) && url.protocol === 'https:' && !!url.hostname
      && !url.username && !url.password && !/[#\s*\\]/.test(value)
      && !/%2a/i.test(value);
  } catch { return false; }
}
