export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function createIdentity(config, fetcher = fetch) {
  async function request(path, method = 'GET', body) {
    if (!config.apiToken) throw new HttpError(503, 'IDENTITY_NOT_CONFIGURED', '계정 관리 연결이 설정되지 않았습니다.');
    let response;
    try {
      response = await fetcher(`${config.authOrigin}/api/v3/${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${config.apiToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new HttpError(502, 'IDENTITY_UNAVAILABLE', '인증 서버 응답을 확인하지 못했습니다.'); }
    if (!response.ok) {
      // Do not relay upstream error bodies, names, tokens or schema internals.
      if (response.status === 400) throw new HttpError(400, 'IDENTITY_REJECTED', '입력 값 또는 중복 계정을 확인해 주세요.');
      if (response.status === 403 || response.status === 401) throw new HttpError(502, 'IDENTITY_PERMISSION', '인증 서버의 관리 권한 설정을 확인해 주세요.');
      throw new HttpError(502, 'IDENTITY_UNAVAILABLE', '인증 서버에서 작업을 완료하지 못했습니다.');
    }
    try { return await response.json(); }
    catch { throw new HttpError(502, 'IDENTITY_RESPONSE', '인증 서버 응답 형식을 확인해 주세요.'); }
  }
  return {
    async users(page) {
      if (!config.userPath) throw new HttpError(503, 'USER_SCOPE_MISSING', '관리할 사용자 경로가 설정되지 않았습니다.');
      const result = await request(`core/users/?${new URLSearchParams({ path: config.userPath, page: String(page), page_size: '25' })}`);
      if (!Array.isArray(result.results)) throw new HttpError(502, 'IDENTITY_RESPONSE', '인증 서버 응답 형식을 확인해 주세요.');
      return { items: result.results.filter(u => u.path === config.userPath && u.type === 'internal' && u.is_superuser === false).map(u => ({ id: String(u.pk), name: String(u.name), username: String(u.username), email: String(u.email || ''), active: u.is_active === true })), hasNext: result.pagination?.next != null && result.pagination.next !== 0 };
    },
    async groups(ids, page) {
      const selected = [...new Set(ids)].slice((page - 1) * 25, page * 25);
      const items = [];
      for (const id of selected) {
        const group = await request(`core/groups/${encodeURIComponent(id)}/`);
        if (group.is_superuser === false) items.push({ id: String(group.pk), name: String(group.name) });
      }
      return { items, hasNext: page * 25 < new Set(ids).size };
    },
    async create(kind, data) {
      const body = kind === 'users'
        ? { username: data.username, name: data.name, email: data.email, path: config.userPath, type: 'internal', is_active: false, groups: [], attributes: {} }
        : { name: data.name, is_superuser: false, users: [], attributes: {} };
      if (kind === 'users' && !config.userPath) throw new HttpError(503, 'USER_SCOPE_MISSING', '관리할 사용자 경로가 설정되지 않았습니다.');
      const result = await request(`core/${kind}/`, 'POST', body);
      if (!(typeof result.pk === 'number' || typeof result.pk === 'string')) throw new HttpError(502, 'IDENTITY_RESPONSE', '생성 결과를 확인하지 못했습니다. 관리 화면에서 확인해 주세요.');
      return String(result.pk);
    },
  };
}

export function creationInput(kind, body) {
  const fields = kind === 'users' ? ['username', 'name', 'email'] : ['name'];
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) throw new HttpError(400, 'INVALID_INPUT', '허용되지 않은 입력 항목입니다.');
  const input = {};
  for (const field of fields) {
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > 150 || /[\x00-\x1f\x7f]/.test(body[field])) throw new HttpError(400, 'INVALID_INPUT', '입력 항목의 형식과 길이를 확인해 주세요.');
    input[field] = body[field].trim();
  }
  if (kind === 'users' && (!/^[a-z0-9][a-z0-9_-]*$/.test(input.username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) throw new HttpError(400, 'INVALID_INPUT', '사용자 ID와 이메일 형식을 확인해 주세요.');
  return input;
}
