# 실서비스 연결 설치

2026-09-26 기준. `workspace.dyhs.kr`을 메일 CT 호스트의 Cloudflare Tunnel에 연결하는 구성입니다. **코드와 격리 테스트는 준비됐지만 실제 Authentik·Mailcow 계정으로 운영 연결을 검증한 상태는 아닙니다.** 먼저 테스트 계정으로 확인하세요.

## 현재 지원 범위

- Authentik OIDC Authorization Code + PKCE, state·nonce·JWT 서명 검증, PostgreSQL 서버 세션, CSRF, 로그아웃.
- SSO 로그인 시 본인 Mailcow 메일함 자동 연결 및 내부 메일 화면 이동: 폴더·검색·목록·본문·첨부 다운로드·읽음 변경, 작성·답장·전체 답장·전달·첨부 발송.
- 서버 권한에 따른 사용자 조회/비활성 계정 생성, 지정한 그룹 조회/일반 그룹 생성. 생성 요청의 중복 방지와 결과 불명 상태 기록.
- 패스키·2FA·비밀번호는 설정한 Authentik 본인 flow로 이동. 고급 설정 링크 제공.

**아직 포함하지 않은 기능:** Workspace 내부 CalDAV, 메일 이동·삭제, 영구 초안, 메일함/별칭/쿼터 관리, 사용자 활성화·삭제·그룹 구성원 변경, 초대 링크·OAuth/OIDC 앱 생성, AMS. 이 기능은 기존 SOGo/Authentik을 이용합니다. HTML 메일은 텍스트로 변환해 표시하며 원격 이미지와 HTML 스크립트는 실행하지 않습니다.

## 1. 소스 및 초기 설정

메일 CT에서 Mailcow 디렉터리와 분리해 설치합니다. Docker Engine과 Compose 플러그인은 기존 설치를 사용합니다.

```sh
git clone https://github.com/Z3r0c0k3/dyhs-workspace.git
cd dyhs-workspace
```

이미 설치했다면 해당 디렉터리에서 `git pull --ff-only`로 갱신합니다. 로컬 변경이 있으면 먼저 검토·보관하세요.

Node.js 24가 있으면:

```sh
node scripts/setup-live.mjs
```

호스트에 Node가 없다면:

```sh
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/app" -w /app node:24-alpine node scripts/setup-live.mjs
```

`infra/secrets/`에 환경 파일과 빈 메일 매핑 파일을 만듭니다. 기존 파일을 덮어쓰지 않습니다. 디렉터리는 0700, 환경 파일은 0600입니다. JSON 파일은 비루트 컨테이너가 읽을 수 있게 0644이며 **상위 비밀 디렉터리의 0700 권한을 유지**해야 합니다. 이 경로는 Git과 이미지 빌드에서 제외됩니다. 내용을 채팅·이슈·공개 로그에 올리지 마세요.

## 2. Authentik에서 Workspace 앱 등록

Auth CT의 Authentik 관리자에서 별도의 OAuth2/OpenID Connect Provider와 Application을 만듭니다. 기존 Mailcow/URL Provider를 재사용하지 않습니다.

| 항목 | 설정 |
| --- | --- |
| Client type | Confidential |
| Redirect URI | **Strict** `https://workspace.dyhs.kr/auth/callback` |
| 흐름 | Authorization Code, PKCE S256 |
| Scope/property mapping | `openid`, `profile`, `email`, `workspace_mail` |
| Include claims in ID token | 활성화 |
| 서명 | RSA 서명 키, RS256 ID token |
| 인증 정책 | 먼저 허용된 테스트 사용자/그룹만 앱에 접근하도록 제한 |
| 재인증 | `prompt=login`, `max_age=0` 처리 및 ID token의 `auth_time` 확인 |

Provider 화면에 표시되는 **Issuer**, Client ID, Client Secret을 `infra/secrets/workspace.env`에 입력합니다. Issuer는 실제 값을 복사하며 임의로 경로를 추정하지 않습니다.

```dotenv
WORKSPACE_PUBLIC_URL=https://workspace.dyhs.kr
AUTHENTIK_BASE_URL=https://sso.dyhs.kr
OIDC_ISSUER=실제_Provider_Issuer
OIDC_CLIENT_ID=실제_Client_ID
OIDC_CLIENT_SECRET=실제_Client_Secret
```

`POSTGRES_PASSWORD`는 생성된 값을 유지합니다. 새 DB용이며 Mailcow DB 비밀번호가 아닙니다. 콜백은 서버에서 고정하므로 별도 `OIDC_REDIRECT_URI` 변수는 사용하지 않습니다. 모든 OIDC endpoint는 설정한 Auth origin 안에 있어야 합니다. 인증서 검증을 끄지 마세요. [사용한 OIDC 클라이언트](https://github.com/panva/openid-client)

## 3. SSO 메일 자동 연결 (최초 1회 설정)

**사용자는 Workspace에 SSO 로그인만 하면 본인 메일함으로 이동해 송수신합니다.** 메일 비밀번호 입력이나 사용자별 `mailboxes.json` 등록은 필요 없습니다. 기존 받은편지함·폴더·메일 원본은 Mailcow에 그대로 두고 Workspace가 IMAP/SMTP로 접근합니다. Mailcow를 중지하거나 메일 데이터를 Workspace DB로 옮기지 않습니다. SOGo는 미지원 기능의 보조 화면으로 유지할 수 있습니다.

### Authentik 메일함 claim

Authentik의 **Customization → Property mappings**에서 OAuth2 Scope Mapping을 만들고 Scope name을 `workspace_mail`로 지정합니다. 아래 예시는 **관리자가 발급한 Authentik username이 기존 메일함의 아이디와 같은 구성**입니다. 실제 메일 도메인으로 바꿉니다.

```python
username = request.user.username.strip().lower()
return {"workspace_mailbox": username if "@" in username else username + "@dyhs.kr"}
```

Workspace Provider의 scope/property mappings에 이 매핑을 추가하고 **Include claims in ID token**을 켭니다. 로그인 요청이 `workspace_mail` scope를 자동으로 요청합니다. [Authentik scope mapping](https://docs.goauthentik.io/add-secure-apps/providers/property-mappings/), [OIDC Provider 설정](https://docs.goauthentik.io/add-secure-apps/providers/oauth2)

**이 규칙의 입력은 관리자만 변경할 수 있어야 합니다.** Authentik의 회원가입·프로필 수정 flow에서 username을 사용자가 임의 선택/변경할 수 없게 하고, 연결된 외부 Source가 username을 덮어쓰지 않는지 확인합니다. 기존 username이 메일 아이디와 다르다면 관리자가 유지하는 메일함 속성에서 claim을 반환하도록 매핑을 바꾸세요. 사용자 수정 가능한 `email`이나 `email_verified`에서 메일함을 추정하지 마세요. Workspace는 이 두 값을 연결에 사용하지 않습니다.

최초 연결 이후에는 DB가 `(issuer, sub)`와 메일함의 관계를 고정합니다. 같은 메일 주소를 가진 다른 sub, 기존 sub의 다른 메일함 연결은 거부합니다. Provider의 subject/issuer 설정이나 사용자명을 변경하기 전에 연결을 검토하세요. Mailcow에 **이미 존재하고 활성화된 메일함**만 연결하며 새 메일함이나 별칭을 자동 생성하지 않습니다.

### Mailcow API와 환경 변수

Mail CT의 Mailcow 관리자에서 Workspace 서버 전용 **읽기/쓰기 API 키**를 발급합니다. 실제 버전에서 메일함 조회와 앱 비밀번호 조회/생성을 허용해야 합니다. Mailcow API IP 허용 목록에는 Workspace 요청이 실제 도달하는 출발지 IP만 지정합니다. 지원되는 키/도메인 권한 제한도 적용합니다. 이 키는 Authentik API 토큰과 별개입니다.

`infra/secrets/workspace.env`에 다음을 채웁니다.

```dotenv
MAIL_ACCESS_MODE=sso-auto
MAILCOW_API_URL=https://mail.dyhs.kr
MAILCOW_API_KEY=Workspace_전용_Mailcow_API_키
MAIL_ALLOWED_DOMAINS=dyhs.kr
MAIL_HOST=mail.dyhs.kr
MAIL_ENABLE_SEND=true
```

`MAIL_ALLOWED_DOMAINS`에는 **실제 메일함 주소의 도메인**을 쉼표로 구분해 입력합니다. 위 `dyhs.kr`은 예시이며 `mail.dyhs.kr` 같은 웹메일 호스트명과 구별합니다. `MAILCOW_API_URL`은 `/api/v1`을 제외한 HTTPS origin입니다. Tunnel을 통하는 API 경로가 Cloudflare Access의 로그인 화면이나 봇 차단으로 막히지 않는지 확인합니다. API 키를 브라우저 변수/VITE 변수에 넣지 마세요.

신규 설치는 초기화 스크립트가 `MAIL_ID_SECRET`, `MAIL_CREDENTIAL_KEY`를 각각 생성합니다. **기존 설치**는 초기화 스크립트를 다시 실행하지 말고 환경 파일에 새 변수를 추가합니다. `MAIL_CREDENTIAL_KEY`가 없다면 로컬 터미널에서 `openssl rand -hex 32`로 생성한 64자리 값을 입력합니다. 이미 설정한 키는 유지합니다. 모드를 바꾸기 전 기존 `mailboxes.json`의 소유 관계와 새 SSO claim이 같은지 확인하고, 전환 후 이전 수동 앱 비밀번호는 Mailcow에서 폐기합니다.

Workspace는 Mailcow API로 `dyhs-workspace-…` 이름의 IMAP/SMTP 전용 앱 비밀번호를 자동 발급하고 **AES-256-GCM으로 암호화하여 Workspace DB에 저장**합니다. 키는 환경 파일에만 두며, 메일 비밀번호·API 키·Mailcow 응답의 비밀번호 해시는 브라우저/일반 로그로 반환하지 않습니다. 재로그인은 같은 연결을 재사용합니다. Mailcow의 [외부 메일 클라이언트 인증 안내](https://docs.mailcow.email/manual-guides/mailcow-UI/u_e-mailcow_ui-generic-oidc/), [앱 비밀번호 API 구현](https://github.com/mailcow/mailcow-dockerized/blob/master/data/web/json_api.php)

IMAP은 TLS 993, SMTP는 TLS 465입니다. `MAIL_HOST`는 두 포트에 직접 연결할 수 있고 TLS 인증서 이름과 일치해야 합니다. **HTTP Cloudflare Tunnel은 IMAP/SMTP 경로가 아닙니다.** 공개 메일 hostname이 Cloudflare 프록시로 연결된다면 직접 접속 hostname 또는 CT 내부 DNS 경로를 사용하세요. 인증서 검증을 끄거나 Mailcow 포트를 임의 변경하지 않습니다.

### 연결 확인과 해제

다음 절의 기동 후 테스트 계정으로 SSO 로그인하면 `/#/mail`이 열립니다. 기존 받은편지함·폴더·검색·한글 본문·첨부가 보이는지 확인하고 테스트 수신자에게 발송한 뒤 수신과 보낸편지함 저장을 확인합니다. 읽기부터 확인하려면 `MAIL_ENABLE_SEND=false`로 시작해 이후 `true`로 바꿉니다. 새 메일은 메일 화면의 새로고침으로 확인합니다. 다른 sub의 메일함 접근이 차단되는지도 확인하세요.

연결 실패 시 SSO 세션은 유지되고 메일 화면에 원인과 **메일함 다시 연결** 버튼이 표시됩니다. 서버는 주소/비밀번호 입력을 받지 않습니다. 설정한 claim이 누락되었다면 Provider 수정 후 로그아웃하고 다시 로그인합니다.

Mailcow에서 해당 `dyhs-workspace-…` 앱 비밀번호를 삭제하거나 비활성화하면 메일 인증이 차단됩니다. Workspace는 다음 로그인/연결 확인에서 이를 `revoked`로 기록하고 자동 재발급하지 않습니다. 로그아웃은 Workspace 세션만 폐기하며 암호화된 메일 연결은 다음 로그인에 재사용합니다.

발급 도중 통신이 끊기면 다음 연결 때 동일 앱 이름을 조회해 복구합니다. 생성 여부를 확정하지 못하면 `creating` 상태에서 중단하고 중복 발급하지 않습니다. 운영자는 DB의 `app_name`과 Mailcow의 실제 앱을 비교해 확인하세요. 재발급이 필요하면 web을 중지하고 해당 Workspace 앱 비밀번호가 폐기된 것을 확인한 뒤, 소유 관계를 확인한 **해당 연결 행만** 제거하고 다시 로그인합니다. 전체 연결 테이블을 비우거나 사용자 비밀번호를 변경하지 마세요. DB 행을 제거하면 주소 고정도 해제되므로 계정 이름 변경/재사용 여부를 함께 확인해야 합니다.

첨부는 최대 10개/합계 10 MB, 수신 원문은 20 MB까지 지원합니다. 발신자는 연결된 본인 주소로 고정되며 별칭 발신은 미지원입니다. 전송 결과 불명·일부 수신자 수락·보낸편지함 저장 실패 시 자동 재발송하지 않습니다. 초안은 메일 화면 메모리에만 보관됩니다.

<details><summary>기존 수동 연결 모드 유지</summary>

`MAIL_ACCESS_MODE=app-password`로 설정하면 기존 `mailboxes.json`의 `[{"sub":"본인 sub","address":"본인 메일함","password":"전용 앱 비밀번호"}]` 매핑을 사용합니다. 이 모드는 자동 발급 API를 사용하지 않습니다. 자동 연결 모드에서는 이 파일을 읽지 않으며 빈 `[]`를 그대로 두면 됩니다.

</details>

## 4. 시작과 Tunnel 연결

프로젝트 루트에서:

```sh
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml config --quiet
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml up -d --build --wait --wait-timeout 120
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml ps
curl -fsS http://127.0.0.1:3081/healthz
```

web과 db가 healthy이고 `{"status":"ok","mode":"live"}`가 나오면 기동됐습니다. OIDC 설정·discovery나 DB 연결이 잘못되면 시작되지 않습니다. `config --quiet`는 Compose 문법/필수 값 검사이며 실제 인증 성공을 뜻하지 않습니다. `config` 전체 출력에는 비밀이 포함될 수 있으므로 공유하지 마세요.

메일 CT **호스트에서 실행 중인** Cloudflare Tunnel에 다음 hostname/origin을 추가합니다.

| Public hostname | Service/origin |
| --- | --- |
| `workspace.dyhs.kr` | `http://127.0.0.1:3081` |

기존 `mail.dyhs.kr` 등의 ingress를 덮어쓰지 않습니다. 로컬 관리 Tunnel이라면 새 hostname 규칙을 마지막 catch-all 앞에 추가합니다. Dashboard 관리 Tunnel이라면 해당 Tunnel의 published application route에 추가합니다. 실제 Tunnel 변경은 운영자가 사용하는 관리 방식으로 적용하세요. Workspace 경로에는 캐시 우회가 필요하며 응답의 `Cache-Control: no-store`를 유지합니다.

브라우저에서는 **https://workspace.dyhs.kr**로 접속합니다. 세션 쿠키가 Secure이므로 loopback HTTP는 상태 검사 용도이며 로그인 검증 주소가 아닙니다. 호스트 포트는 loopback 3081만 사용하고, DB 포트는 외부에 공개하지 않습니다. Mailcow 네트워크·메일 볼륨·Docker 소켓을 연결하지 않습니다.

## 5. 첫 로그인과 계정 보안

테스트 계정으로 로그인해 이름이 표시되는지 확인합니다. 이메일은 ID token의 `email_verified=true`인 경우에만 표시하며 메일함 연결 키로 사용하지 않습니다. `계정 및 보안 → 계정 연결 식별자`에서 본인의 `sub`를 확인할 수 있습니다.

기본 세션은 15분 고정 만료이며 브라우저에 토큰을 저장하지 않습니다. 로그아웃은 Workspace 세션을 제거합니다. Authentik의 다른 앱 세션까지 종료하지 않으며 다음 Workspace 로그인에는 재인증을 요청합니다. 계정 정지의 기존 Workspace 세션 반영은 최대 15분 지연될 수 있습니다. 즉시 전체 세션을 폐기하려면:

```sh
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml exec -T db psql -U workspace -d workspace -c 'DELETE FROM workspace_sessions;'
```

패스키/2FA/비밀번호 버튼을 연결하려면 검증한 본인 설정 flow의 slug를 환경 파일에 입력합니다. 미설정 버튼은 비활성이고 고급 설정은 사용할 수 있습니다. Workspace는 비밀번호·2FA 시드·패스키 키를 직접 받지 않습니다.

```dotenv
AUTHENTIK_PASSWORD_FLOW=
AUTHENTIK_PASSKEY_FLOW=
AUTHENTIK_MFA_FLOW=
```

환경 파일 변경은 `up -d --force-recreate web`, JSON 파일 변경은 `restart web`으로 적용합니다. 두 명령 모두 위와 동일한 `--env-file`과 `-f` 인자를 사용합니다.

## 6. 간편 계정 관리

제한된 Authentik API 계정/토큰을 준비하고 `AUTHENTIK_API_TOKEN`에 설정합니다. 메일 API 키를 여기에 사용하지 않습니다. 대상 버전의 `/api/v3/schema/`와 RBAC를 확인한 뒤 테스트합니다.

Workspace 관리자 권한은 **Authentik의 `dyhs-admins` 그룹 소속**으로 결정합니다. 그룹 이름은 대소문자까지 정확히 일치해야 하며 Authentik의 Superuser privileges는 필요하지 않습니다. 멤버는 현재 구현된 사용자·그룹 조회/생성 권한과 관리 메뉴를 자동으로 받습니다.

Workspace Provider에서 기본 **`profile` scope mapping**을 선택하고 **Include claims in ID token**을 켭니다. Authentik의 기본 profile mapping은 실제 그룹 소속을 `groups` 문자열 배열로 반환합니다. 커스텀 mapping을 사용한다면 같은 형식으로 실제 그룹 이름을 반환하도록 설정하세요. 사용자 수정 가능한 속성에서 groups를 만들지 마세요. [Authentik 기본 profile mapping](https://github.com/goauthentik/authentik/blob/main/blueprints/system/providers-oauth2.yaml)

```json
{"groups": ["dyhs-students", "dyhs-admins"]}
```

위 값은 **서명된 ID token의 claim 예시**이며 Workspace에 업로드하거나 입력하는 설정이 아닙니다. 서버가 검증한 그룹 소속만 신뢰합니다. claim 누락/형식 오류/다른 그룹이면 일반 사용자이며, `authentik Admins` 소속만으로는 Workspace 관리자 권한을 받지 않습니다.

기존 설치의 `roles.json` 및 `ROLE_MAPPING_PATH`는 더 이상 사용하지 않습니다. 관리자 사용자를 Authentik의 `dyhs-admins`에 추가한 뒤 **로그아웃하고 다시 로그인**하세요. 기존 Workspace 세션에도 재로그인이 필요합니다. 그룹 제거는 다음 로그인부터 반영되며 이전 세션에는 최대 15분간 권한이 남을 수 있습니다. 즉시 반영하려면 5절의 세션 폐기 명령을 사용합니다.

`AUTHENTIK_USER_PATH`는 조회/생성할 정확한 사용자 경로입니다. 다른 경로·서비스 계정·superuser는 조회에서 제외합니다. `AUTHENTIK_GROUP_IDS`에는 조회를 허용한 일반 그룹 UUID를 쉼표로 구분해 입력합니다. Workspace에서 생성에 성공한 그룹도 조회 대상에 포함됩니다. 상위 API의 RBAC 역시 같은 범위를 제한해야 합니다.

처음에는 `AUTHENTIK_ENABLE_WRITES=false`로 조회를 검증하고, 검증 후 `true`로 전환합니다. 사용자 생성은 **비활성 일반 계정, 그룹 없음**으로 제한됩니다. 그룹 생성은 **일반 그룹, 구성원 없음**입니다. 활성화·권한 부여·초대·Provider 생성은 현재 Authentik 고급 관리에서 진행합니다. 실패한 요청을 새 작업으로 반복하기 전에 원본 Authentik에서 실제 생성 여부를 확인하세요.

## 7. 백업, 갱신, 복구

Workspace 전용 PostgreSQL 볼륨에 세션·작업 결과·고정된 메일함 연결·암호화된 앱 비밀번호가 저장됩니다. `MAIL_CREDENTIAL_KEY`를 잃거나 임의 교체하면 기존 메일 연결을 복호화할 수 없습니다. `infra/secrets/`와 DB 백업을 접근이 제한된 저장소에 함께 보관합니다. Mailcow 메일 원본은 기존 Mailcow 백업 절차를 그대로 사용합니다.

```sh
umask 077
mkdir -p backups
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml exec -T db pg_dump -U workspace -d workspace -Fc > "backups/workspace-$(date +%Y%m%d-%H%M%S).dump"
docker image tag dyhs-workspace-live-web:latest dyhs-workspace-live-web:rollback
git pull --ff-only
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml build web
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml up -d --wait --wait-timeout 120
```

빌드가 실패하면 다음 `up`을 실행하지 않습니다. 이전 소스·Compose 설정도 보관하고, 이미지 복구 시 해당 설정을 되돌린 뒤 다음 명령을 사용합니다.

```sh
docker image tag dyhs-workspace-live-web:rollback dyhs-workspace-live-web:latest
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml up -d --no-build --pull never --force-recreate web
```

DB 백업 복원은 연결된 사용자와 진행 중인 전송이 없는 상태에서 `web`을 중지하고 수행해야 합니다. 과거 작업 DB로 돌아가면 그 뒤의 중복 방지 기록도 사라집니다. 운영 복원 전에 별도의 복구 DB에서 백업 검증과 데이터 손실 범위를 확인하세요. `down -v`나 Docker 전체 정리를 사용하지 않습니다.

현재 web은 CPU 0.5/메모리 512 MB, DB는 CPU 0.5/256 MB 제한입니다. 이미지 빌드는 이 실행 제한과 별개입니다. 초기 배포는 API 1개 인스턴스를 전제로 하며 IP별 분당 120 API/auth 요청, 전체 동시 메일 작업 2개/사용자별 1개를 제한합니다. 호스트 Tunnel 뒤에서는 동일 IP로 집계될 수 있으므로 제한된 사용자로 부하를 확인하고 규모 확장 전에 신뢰할 프록시와 공유 요청 제한을 설계해야 합니다.

## 8. 검증 결과와 다음 확인

로컬 PostgreSQL 기반 OIDC/권한/CSRF/중복 방지 검사, 메일 서버 대역을 사용한 MIME·UID·SMTP 부분 실패 검사, 320/768/1440px UI 검사, 실제 Docker 이미지의 TLS OIDC discovery·DB·비루트 실행 검사를 통과했습니다. 운영 Authentik/Mailcow에 실제 로그인·메일 발송한 결과는 아닙니다.

연결 오류는 다음으로 확인합니다. 비밀 값이나 메일 원문을 공유하지 마세요.

```sh
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml logs --tail 100 web
docker compose --env-file infra/secrets/workspace.env -f infra/compose/compose.live.yaml ps
```

최종 공개 전 실제 릴리스 번호·Issuer/RBAC·TLS 메일 경로·앱 비밀번호 폐기·다른 사용자 접근 차단·SMTP/Sent 저장을 테스트 계정으로 확인합니다. 새 endpoint와 오류 응답은 [Live API](live-api.md)에 정리했습니다.
