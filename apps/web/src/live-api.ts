export async function api(path: string, init?: RequestInit, notifyExpiry = true) {
  const response = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) { if (notifyExpiry) dispatchEvent(new Event('session-expired')); throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.'); }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return body;
}
