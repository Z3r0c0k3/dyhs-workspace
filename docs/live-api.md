# 현재 Live API

2026-09-26 구현 기준. 기존 `openapi.yaml`은 전체 목표의 초기 초안이며, 아래가 현재 구현한 경로입니다. 브라우저가 보내는 역할/메일 주소로 세션 주체나 메일함을 선택하지 않습니다.

| 경로 | 처리 |
| --- | --- |
| `GET /healthz` | DB 확인, `{status:"ok", mode:"live"}` |
| `GET /auth/login` | 10분 일회용 OIDC transaction, PKCE/state/nonce 생성 |
| `GET /auth/callback` | OIDC 검증 후 자동 메일 연결, 15분 고정 서버 세션 발급. 자동 연결 모드는 `/#/mail`로 이동. 메일 연결 실패는 로그인 실패로 처리하지 않음. 실패 시 `/?auth_error=login_failed` |
| `GET /api/me` | 본인 `id,subject,displayName,email,mailbox,mailConnection,mailAutoConnect,roles,permissions,csrfToken,sessionSeconds,capabilities,security,adminUrl` |
| `POST /api/logout` | Workspace 세션 및 진행 중인 로그인 transaction 폐기 |
| `GET /api/admin/users?page=1` | 허용 경로의 일반 사용자, `{items,page,hasNext}` |
| `POST /api/admin/users` | `{username,name,email}`로 비활성 일반 계정 생성 |
| `GET /api/admin/groups?page=1` | 허용 일반 그룹, `{items,page,hasNext}` |
| `POST /api/admin/groups` | `{name}`으로 구성원 없는 일반 그룹 생성 |
| `POST /api/mail/connect` | 빈 `{}` 본문. 서명된 SSO claim의 본인 메일함 연결/재확인, `{state,address,message?}` 반환. 주소·비밀번호 입력 거부 |
| `GET /api/mail/folders` | `{id,name,specialUse,unread}[]` |
| `GET /api/mail/messages?folder=INBOX&query=&cursor=` | `{items,nextCursor}`, 최대 50개. summary의 `from`은 표시 문자열 |
| `GET /api/mail/messages/:id` | `{id,subject,from,to,cc,text,attachments}`, 주소 필드는 문자열 배열 |
| `GET /api/mail/messages/:id/attachments/:attachmentId` | 소유권 확인 후 octet-stream 다운로드, UTF-8 파일명 |
| `POST /api/mail/messages/:id/actions` | `{action:"mark_read"}` 또는 `mark_unread` |
| `POST /api/mail/send` | `{to:string[],cc?:string[],subject,text,attachments?:{name,data}[]}`. data는 base64, 발신자는 서버에서 결정 |
| `GET /api/mail/operations/:id` | 본인의 메일 전송 작업 `{id,status}` |

`/api/*`에는 서버 세션 쿠키가 필요합니다. 변경 요청은 동일 Origin + `X-CSRF-Token` + JSON이 필수입니다. 생성/전송에는 UUID v4 `Idempotency-Key`가 추가로 필요합니다. API 토큰과 OIDC token은 브라우저에 반환하지 않습니다.

계정 생성 응답은 `{operationId,status,objectId}`이며 최초 성공은 201, 이미 성공한 동일 요청은 200입니다. 같은 키의 다른 요청은 409입니다. 원본 서버 결과를 확정할 수 없으면 `unknown`으로 남기고 자동으로 다시 생성하지 않습니다.

메일 전송 응답은 `{operationId,status}`이며 HTTP 200만으로 전달 완료를 뜻하지 않습니다. 상태는 `pending`, `smtp_pending`, `smtp_accepted`, `completed`, `sent_copy_failed`, `partially_accepted`, `delivery_unknown`, `rejected`입니다. `completed` 역시 SMTP 수락과 Sent 저장만 의미합니다. 미확정/수락된 작업은 자동 재발송하지 않습니다.

메일 ID와 cursor는 세션 identity·메일함·폴더·UIDVALIDITY·UID에 묶인 HMAC ID입니다. ID를 다른 사용자가 재사용하면 404, UIDVALIDITY 변경은 409입니다. `email_verified`는 이메일 표시만 결정하며 메일함 매핑에는 관여하지 않습니다.

JSON 오류는 `{code,message,requestId}`이며 세션 없음/만료 401, 권한·CSRF 오류 403, 없는 항목 404, 충돌 409, 크기 초과 413, 요청 제한 429, upstream 오류 502, 미설정/비활성 503을 사용합니다. upstream의 비밀/응답 본문은 중계하지 않습니다.

`mailAutoConnect`는 자동 연결 모드 여부입니다. `mailConnection`은 `{state,address,message?}`이며 상태는 `pending`, `creating`, `active`, `revoked`, `blocked`, `unconfigured`입니다. 활성 연결에만 address와 mail/mailSend capability를 제공합니다. 서버 설정 및 서명된 `workspace_mailbox` claim으로만 대상을 결정하며 claim 자체나 암호화된 비밀번호를 API에 반환하지 않습니다.

자동 연결은 `workspace_mail` scope를 요청합니다. Mailcow 요청은 `GET /api/v1/get/mailbox/{address}`, `GET /api/v1/get/app-passwd/all/{address}`, `POST /api/v1/add/app-passwd`를 사용합니다. 생성은 HTTP 상태 외에 Mailcow 응답의 성공 여부도 확인하며 타임아웃 후 새 비밀번호를 무조건 재발급하지 않습니다.

관리자 판정은 검증된 ID token의 `groups` 문자열 배열에 정확한 `dyhs-admins`가 있는지로 결정합니다. 해당 사용자의 `roles`는 `["user","workspace_admin"]`이고 현재 지원하는 4개 identity 권한을 제공합니다. 서버 세션에 판정 결과를 보관하며 브라우저 헤더·role·이메일·기존 sub 매핑으로 권한을 부여하지 않습니다. API 토큰/RBAC와 쓰기 활성화 설정은 별도로 적용됩니다. 그룹 소속 변경은 재로그인 또는 최대 15분 세션 만료 후 반영됩니다.
