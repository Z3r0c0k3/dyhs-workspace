# Dyhs Workspace 설치 매뉴얼

**실서비스 연결은 [새 Live 설치 매뉴얼](live-installation.md)을 따르세요.** 아래는 기존 정적 미리보기 전용 절차입니다. Live는 `workspace.dyhs.kr`과 메일 CT 호스트의 loopback 3081을 사용합니다.

최종 갱신: 2026-09-24. 현재 소스의 **0.1.0 정적 미리보기** 기준입니다. Docker 빌드·실행은 로컬 OrbStack에서 검증했으며 실제 메일 CT에서는 아직 검증하지 않았습니다.

## 1. 설치 범위와 배치

| 서비스 | 설치 위치 / 주소 | 현재 Workspace와의 관계 |
| --- | --- | --- |
| Workspace | 메일 CT의 별도 Compose 프로젝트, 공개 주소 미정 | 이번 매뉴얼로 설치하는 정적 UI |
| Dyhs Mail | 메일 CT, `https://mail.dyhs.kr` | 기존 Dockerized Mailcow 및 SOGo 유지 |
| Dyhs Auth | 별도 Auth CT, `https://sso.dyhs.kr` | 고급 계정 설정 외부 링크 제공, OIDC/API 미연동 |
| Dyhs URL | 별도 URL CT, `https://url.dyhs.kr` | 외부 링크 제공 |
| CalDAV / AMS | Mailcow SOGo / 추후 별도 AMS | 연동 예정, 이번 설치로 활성화되지 않음 |

현재 메일과 관리자 데이터는 예시입니다. 발송·삭제·계정 생성·초대 링크 발급·OAuth/OIDC 앱 생성·패스키·2FA·비밀번호 변경은 동작하지 않습니다. 관리자 미리보기 토글은 화면 확인용이며 인증 기능이 아닙니다. 모든 `/api` 요청은 `503 PREVIEW_ONLY`를 반환합니다.

## 2. 사전 준비

메일 CT에는 기존 Docker Engine과 Compose 플러그인을 사용합니다. Docker를 재설치하거나 Mailcow의 Compose를 수정할 필요가 없습니다. 다음 명령으로 대상 Docker 환경과 Compose 지원을 확인하세요.

```sh
docker context show
docker info --format '{{.Name}}'
docker compose version
docker compose up --help
```

`up` 도움말에 `--wait`와 `--wait-timeout`이 있어야 합니다. Compose가 없다면 CT의 운영체제에 맞는 [공식 Compose 설치 안내](https://docs.docker.com/compose/install/)를 따르세요. 아래 명령은 배포 사용자가 Docker에 접근할 수 있다는 전제입니다.

- Docker 이미지 레지스트리와 npm 레지스트리에 접근할 수 있어야 합니다. 최초 빌드 시 이미지를 받고 `npm ci`를 실행합니다.
- 호스트의 `127.0.0.1:3080`이 비어 있어야 합니다. 기존 메일 서비스의 80/443/IMAP/SMTP 포트는 사용하지 않습니다.
- Node.js는 Docker 빌드 단계에 포함되므로 **메일 CT 호스트에 따로 설치할 필요가 없습니다**.
- 실행 컨테이너의 제한은 메모리 128 MB, CPU 0.5, PID 100입니다. 이 제한이 이미지 빌드에도 적용되는 것은 아니므로 메일 CT의 여유 자원을 확인한 뒤 빌드하세요.

## 3. 메일 CT에 소스 복사

소스를 이미 CT에 복사했다면 해당 프로젝트 루트에서 4절부터 진행합니다. 아래는 개발 PC에서 현재 프로젝트 전체를 압축해 전달하는 예시입니다. `deploy@MAIL_CT_IP`는 실제 SSH 사용자와 **메일 CT** 주소로 바꾸세요. 저장소 URL은 아직 없으므로 임의의 `git clone` 주소를 사용하지 않습니다.

개발 PC의 프로젝트 루트에서:

```sh
tar --exclude='./node_modules' --exclude='./dist' --exclude='./.git' \
  --exclude='./.env' --exclude='./.env.*' \
  --exclude='./test-results' --exclude='./playwright-report' \
  -czf /tmp/dyhs-workspace-preview.tar.gz .
scp /tmp/dyhs-workspace-preview.tar.gz deploy@MAIL_CT_IP:~/
```

이 복사 예시는 비밀 파일을 제외하며 `.env.example`도 제외합니다. 현재 미리보기 실행에는 환경 파일이 필요하지 않습니다. 별도 경로에 비밀을 보관했다면 그 파일도 전달 대상에서 제외하세요.

메일 CT에 SSH로 접속한 뒤:

```sh
mkdir -p ~/services/dyhs-workspace
tar -xzf ~/dyhs-workspace-preview.tar.gz -C ~/services/dyhs-workspace
cd ~/services/dyhs-workspace
```

이 경로는 예시이며 Mailcow 설치 디렉터리와 분리합니다. 이후 Docker 명령은 모두 Workspace 프로젝트 루트에서 실행합니다. 빌드에는 `package-lock.json`, `apps/web/src`, `packages/design-tokens`, `public`, `infra/compose`와 루트 설정 파일이 필요하므로 Compose 파일만 복사하지 마세요.

## 4. 빌드 및 시작

```sh
docker compose -f infra/compose/compose.preview.yaml config --quiet
docker compose -f infra/compose/compose.preview.yaml up -d --build --wait --wait-timeout 120
docker compose -f infra/compose/compose.preview.yaml ps
```

`web`이 `healthy`이면 시작된 것입니다. 상태 검사는 30초 간격이므로 첫 판정까지 기다릴 수 있습니다. `--wait-timeout 120`은 실행 상태 대기 시간이며 이미지 다운로드/빌드 전체의 제한 시간이 아닙니다. [Compose 실행 옵션](https://docs.docker.com/reference/cli/docker/compose/up/)

배포 설정은 다음과 같습니다.

| 항목 | 값 |
| --- | --- |
| Compose 프로젝트 | `dyhs-workspace-preview` |
| 서비스 / 이미지 | `web` / `dyhs-workspace-preview-web:latest` |
| 호스트 → 컨테이너 | `127.0.0.1:3080` → `8080` |
| 웹 서버 | 비루트 Nginx, 읽기 전용 파일시스템, 임시 공간 `/tmp` |
| 영구 데이터 | DB 및 영구 볼륨 없음 |
| 로그 | 파일당 최대 5 MB, 최대 2개 |

Mailcow 네트워크·메일 볼륨·Docker 소켓을 마운트하지 않습니다. 현재 Compose에는 자동 재시작 정책이 없으므로 CT/Docker 재시작 뒤에는 같은 `up -d --wait --wait-timeout 120` 명령으로 다시 시작하세요.

## 5. 접속 및 정상 동작 확인

메일 CT 안에서:

```sh
curl -fsS http://127.0.0.1:3080/healthz
curl -I http://127.0.0.1:3080/
curl -i http://127.0.0.1:3080/api/me
```

순서대로 `preview-ok`, HTTP 200, HTTP 503과 `PREVIEW_ONLY`가 정상 결과입니다. API의 503은 미연동 상태를 명시하는 응답입니다.

다른 PC의 브라우저로 확인할 때는 **해당 PC에서** SSH 포워딩을 실행하고 연결을 유지하세요.

```sh
ssh -N -L 13080:127.0.0.1:3080 deploy@MAIL_CT_IP
```

브라우저에서 `http://127.0.0.1:13080`을 엽니다. PC의 `localhost:3080`이나 `메일_CT_IP:3080`으로 직접 접속하는 방식은 현재 loopback 바인딩에 맞지 않습니다. 같은 PC에서 Docker를 실행했다면 `http://127.0.0.1:3080`으로 바로 접속합니다.

홈의 미리보기 표시와 로고, 메일 검색·읽기·작성, 개인 설정, 계정 메뉴의 관리자 화면 미리보기를 확인하세요. 초안은 탭 메모리에만 있어 새로고침하면 사라집니다. 테마는 해당 브라우저에 저장됩니다.

Node.js 24가 설치된 **Docker 실행 호스트**에서는 다음 추가 검사를 실행할 수 있습니다. 이 검사는 별도 npm 의존성 설치가 필요하지 않습니다.

```sh
node tests/preview-smoke.mjs
```

상태·정적 화면/로고·보안 헤더·API 차단·`.env` 미노출을 검사합니다. 검사 주소는 `127.0.0.1:3080`으로 고정되어 있습니다.

## 6. 업데이트, 복구, 중지

업데이트 전 현재 이미지를 복구용으로 보관하세요. 이 태그는 다음 백업 때 덮어쓰므로 여러 버전을 보관하려면 별도 버전 태그를 사용합니다. 배포 중인 소스와 Compose/Nginx 설정도 함께 보관하세요.

```sh
docker image tag dyhs-workspace-preview-web:latest dyhs-workspace-preview-web:rollback
```

새 소스로 교체한 뒤 프로젝트 루트에서:

```sh
docker compose -f infra/compose/compose.preview.yaml config --quiet
docker compose -f infra/compose/compose.preview.yaml build
docker compose -f infra/compose/compose.preview.yaml up -d --wait --wait-timeout 120
curl -fsS http://127.0.0.1:3080/healthz
```

빌드가 실패하면 다음 `up`을 실행하지 말고 원인을 확인합니다. 별도 `build` 단계 동안 기존 실행 컨테이너는 유지됩니다. 교체 시에는 짧은 중단이 발생할 수 있습니다.

새 이미지 실행에 문제가 있으면 이전 Compose/Nginx 설정을 복원한 뒤 아래 명령으로 저장한 이미지로 돌아갑니다. **복구 때 `--build`를 붙이지 마세요.**

```sh
docker image tag dyhs-workspace-preview-web:rollback dyhs-workspace-preview-web:latest
docker compose -f infra/compose/compose.preview.yaml up -d --no-build --pull never --force-recreate --wait --wait-timeout 120
```

로그 확인 및 미리보기 중지/제거:

```sh
docker compose -f infra/compose/compose.preview.yaml logs --tail 100 web
docker compose -f infra/compose/compose.preview.yaml down
```

위 `down`은 Workspace 프로젝트만 대상으로 합니다. 소스와 이미지는 남습니다. Mailcow 디렉터리에서 명령을 실행하거나 공유 Docker의 전체 정리 명령을 사용하지 마세요.

## 7. 로컬 개발

Node.js 24와 npm을 준비하고 프로젝트 루트에서 실행합니다.

```sh
npm ci
npm run dev
```

개발 화면은 `http://127.0.0.1:5173`입니다. 배포 산출물 확인은 `npm run build` 후 `npm run preview`로 실행하며 기본 주소는 `http://127.0.0.1:4173`입니다. Vite 개발/미리보기 서버는 이번 Docker 배포의 Nginx와 별개입니다.

```sh
npm test
npm run test:e2e
```

브라우저 검사는 설치된 Google Chrome을 사용합니다. 없다면 개발 PC에서 `npx playwright install chrome`으로 설치합니다. Docker 컨테이너가 실행 중이면 `npm run test:container`도 사용할 수 있습니다.

## 8. 환경 변수와 실제 서비스 연결

현재 UI와 Compose는 `.env.example`의 연동 변수를 사용하지 않습니다. `.env`를 만들거나 API 키를 넣어도 SSO·메일·CalDAV·계정 관리가 활성화되지 않습니다. 공개 서비스 링크는 `apps/web/src/services.ts`에 정의되어 있습니다.

실제 연동에 앞서 Workspace 공개 hostname, Authentik/Mailcow/SOGo 버전, 테스트 계정, 사용자별 IMAP/SMTP 및 CalDAV 인증 방식, Authentik OIDC/관리 API 권한을 확인해야 합니다. 개인 보안은 패스키·2FA·비밀번호 작업과 Authentik 고급 설정으로 나누고, AMS는 추후 별도 OIDC 앱으로 연결합니다. 자세한 항목은 [배포 및 계정 관리 확장](deployment-and-identity.md)을 참고하세요.

외부 HTTPS 공개용 Cloudflare Tunnel 설정은 아직 포함하지 않았습니다. 메일 CT의 호스트 프로세스라면 origin 후보는 `http://127.0.0.1:3080`입니다. Tunnel이 컨테이너나 다른 CT에서 실행 중이면 그 `localhost`는 Workspace 호스트가 아니므로 실제 네트워크 경로부터 확인해야 합니다. 현재 인증 없는 목업을 공개하기 위해 포트 바인딩만 전체 인터페이스로 바꾸지 마세요. 공개 전 접근 범위, 인증, 이미지 digest 고정과 기존 SOGo 유지 경로를 확정합니다.

## 9. 문제 해결

| 증상 | 확인 / 조치 |
| --- | --- |
| Docker daemon 연결 실패 | `docker context show`, `docker info`로 대상과 접근 권한 확인. 운영 CT의 Docker를 임의 재시작하지 않음 |
| `--wait` 옵션을 모름 | Compose 플러그인 버전 확인 후 공식 설치 안내에 맞춰 갱신 |
| 3080 포트 충돌 | 해당 포트의 기존 사용 서비스 확인. 기존 메일 서비스를 중지하지 않음 |
| `unhealthy` 또는 대기 시간 초과 | `ps`, `logs --tail 100 web` 및 `/healthz` 응답 확인. 시작 지연과 반복 오류 구분 |
| 이미지 또는 npm 다운로드 실패 | 레지스트리 접근·DNS·프록시 확인. 실행 컨테이너와 빌드 로그 구분 |
| 로고가 403으로 표시됨 | 최신 Dockerfile의 `COPY --chown=nginx:nginx` 포함 여부 확인 후 재빌드. 원본 파일 권한 문제 수정 반영됨 |
| UI는 열리지만 API가 503 | 현재 정적 미리보기의 정상 동작. 실제 서버 API 구현 필요 |
| 다른 PC 또는 Tunnel에서 접속 불가 | loopback 바인딩과 SSH 포워딩/실제 Tunnel 실행 위치 확인 |
| `/settings` 같은 직접 경로가 404 | 현재 앱은 `/#/settings` 형태의 hash 탐색 사용. 앱 메뉴로 이동 |

검증 범위와 남은 작업은 [검증 기록](verification.md), 인증·메일 연결 결정은 [연동 결정 기록](integration-decisions.md)을 참고하세요.
