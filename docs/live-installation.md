# 실서비스 연결 설치

2026-09-25 기준. `workspace.dyhs.kr`을 메일 CT 호스트의 Cloudflare Tunnel에 연결하는 구성입니다. **코드와 격리 테스트는 준비됐지만 실제 Authentik·Mailcow 계정으로 운영 연결을 검증한 상태는 아닙니다.** 먼저 테스트 계정으로 확인하세요.

## 현재 지원 범위

- Authentik OIDC Authorization Code + PKCE, state·nonce·JWT 서명 검증, PostgreSQL 서버 세션, CSRF, 로그아웃.
- 사용자별 Mailcow 앱 비밀번호와 명시적 `sub` 매핑: 폴더·검색·목록·본문·첨부 다운로드·읽음 변경, 작성·답장·전체 답장·전달·첨부 발송.
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

`infra/secrets/`에 환경 파일, 권한 파일, 빈 메일 매핑 파일을 만듭니다. 기존 파일을 덮어쓰지 않습니다. 디렉터리는 0700, 환경 파일은 0600입니다. JSON 파일은 비루트 컨테이너가 읽을 수 있게 0644이며 **상위 비밀 디렉터리의 0700 권한을 유지**해야 합니다. 이 경로는 Git과 이미지 빌드에서 제외됩니다. 내용을 채팅·이슈·공개 로그에 올리지 마세요.

## 2. Authentik에서 Workspace 앱 등록

Auth CT의 Authentik 관리자에서 별도의 OAuth2/OpenID Connect Provider와 Application을 만듭니다. 기존 Mailcow/URL Provider를 재사용하지 않습니다.

| 항목 | 설정 |
| --- | --- |
| Client type | Confidential |
| Redirect URI | **Strict** `https://workspace.dyhs.kr/auth/callback` |
| 흐름 | Authorization Code, PKCE S256 |
| Scope/property mapping | `openid`, `profile`, `email` |
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

## 3. 시작과 Tunnel 연결

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

## 4. 첫 로그인과 계정 보안

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

## 5. 사용자별 메일 연결

Mailcow의 본인 메일함 설정에서 **Workspace 전용 앱 비밀번호**를 발급합니다. 본인 `sub`와 해당 메일함의 소유 관계를 운영자가 확인한 뒤 `infra/secrets/mailboxes.json`에 기록합니다. 이메일이 같다는 이유로 자동 연결하지 않습니다. [Mailcow 앱 비밀번호 안내](https://docs.mailcow.email/manual-guides/mailcow-UI/u_e-mailcow_ui-generic-oidc/)

```json
[
  {
    "sub": "확인한_Workspace_Provider_sub",
    "address": "테스트_메일함_주소",
    "password": "해당_메일함의_Workspace_전용_앱_비밀번호"
  }
]
```

실제 값으로 교체해야 하며 위 예시 그대로는 검증을 통과하지 않습니다. 중복 sub·메일함은 시작 시 거부됩니다. 매핑은 현재 설정한 Issuer에만 적용됩니다. 앱 비밀번호는 서버 파일과 메모리에만 존재하고 브라우저·DB·일반 로그로 반환하지 않습니다. 서버 관리자만 해당 파일/백업에 접근하도록 관리하세요.

환경 파일에서 먼저 읽기만 활성화합니다.

```dotenv
MAIL_ACCESS_MODE=app-password
MAIL_HOST=mail.dyhs.kr
MAIL_ENABLE_SEND=false
```

`MAIL_ID_SECRET`은 초기 설정에서 만든 값을 유지합니다. 변경하면 이전 목록의 메시지 ID가 만료됩니다. IMAP은 TLS 993, SMTP는 TLS 465를 사용합니다. `MAIL_HOST`는 두 포트에 직접 연결할 수 있고 TLS 인증서 이름과 일치해야 합니다. **HTTP Cloudflare Tunnel은 IMAP/SMTP 경로가 아닙니다.** 공개 메일 hostname이 Cloudflare 프록시로 연결된다면 검증된 직접 접속 hostname 또는 CT 내부 DNS 경로를 사용하세요. TLS 검증을 해제하거나 운영 Mailcow 포트를 임의 변경하지 않습니다.

서버를 다시 만들고 폴더·검색·한글 본문·첨부·읽음 상태를 테스트합니다. 다른 sub는 해당 메일함에 접근하지 못하는지도 확인합니다. 다음으로 테스트 수신자를 정한 뒤 `MAIL_ENABLE_SEND=true`를 설정해 SMTP와 보낸편지함 저장을 검증합니다. 다른 사용자에게 공개하기 전에 이 확인이 필요합니다.

첨부는 최대 10개/합계 10 MB, 수신 메일 원문은 20 MB까지 지원합니다. 발신자는 매핑된 본인 주소로 고정됩니다. 별칭 발신은 아직 지원하지 않습니다. 실행 파일·스크립트 첨부 일부 확장자는 거부합니다. 전송 성공·일부 수신자 수락·보낸편지함 저장 실패·전송 결과 불명을 구분하며 **결과 불명이나 저장 실패 시 자동 재발송하지 않습니다**. 초안은 메일 화면 메모리에만 보관됩니다.

## 6. 간편 계정 관리

제한된 Authentik API 계정/토큰을 준비하고 `AUTHENTIK_API_TOKEN`에 설정합니다. 메일 API 키를 여기에 사용하지 않습니다. 대상 버전의 `/api/v3/schema/`와 RBAC를 확인한 뒤 테스트합니다.

`infra/secrets/roles.json`에 관리자의 **이 Workspace Provider sub**를 명시합니다. 그룹명이나 브라우저의 role 값을 권한으로 사용하지 않습니다.

```json
{
  "subjects": [
    {
      "sub": "관리자의_Workspace_Provider_sub",
      "permissions": [
        "identity.users.read", "identity.users.create",
        "identity.groups.read", "identity.groups.create"
      ]
    }
  ]
}
```

`AUTHENTIK_USER_PATH`는 조회/생성할 정확한 사용자 경로입니다. 다른 경로·서비스 계정·superuser는 조회에서 제외합니다. `AUTHENTIK_GROUP_IDS`에는 조회를 허용한 일반 그룹 UUID를 쉼표로 구분해 입력합니다. Workspace에서 생성에 성공한 그룹도 조회 대상에 포함됩니다. 상위 API의 RBAC 역시 같은 범위를 제한해야 합니다.

처음에는 `AUTHENTIK_ENABLE_WRITES=false`로 조회를 검증하고, 검증 후 `true`로 전환합니다. 사용자 생성은 **비활성 일반 계정, 그룹 없음**으로 제한됩니다. 그룹 생성은 **일반 그룹, 구성원 없음**입니다. 활성화·권한 부여·초대·Provider 생성은 현재 Authentik 고급 관리에서 진행합니다. 실패한 요청을 새 작업으로 반복하기 전에 원본 Authentik에서 실제 생성 여부를 확인하세요.

## 7. 백업, 갱신, 복구

Workspace 전용 PostgreSQL 볼륨에 세션과 작업 결과가 저장됩니다. `infra/secrets/`와 DB 백업을 접근이 제한된 저장소에 함께 보관합니다. Mailcow 메일 원본은 기존 Mailcow 백업 절차를 그대로 사용합니다.

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
