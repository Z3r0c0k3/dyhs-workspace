# Dyhs Workspace

MAKE;가 운영하는 통합 작업 공간입니다. **Live 서버와 정적 미리보기를 분리**했습니다. Live에는 OIDC 로그인, PostgreSQL 세션, SSO 계정의 메일함 자동 연결과 Workspace 내부 IMAP/SMTP 송수신, 제한된 사용자·그룹 API가 구현되어 있습니다. 운영 Authentik·Mailcow 연결은 테스트 계정 검증이 남아 있습니다.

`https://workspace.dyhs.kr` 설치는 **[실서비스 연결 설치](docs/live-installation.md)**를 따르세요. 메일 CT 호스트의 Tunnel origin은 `http://127.0.0.1:3081`입니다. 현재 API는 [Live API](docs/live-api.md), 환경 변수는 [.env.example](.env.example)에 정리했습니다. CalDAV·초대·Provider 생성 등 미구현 항목도 실서비스 매뉴얼에 명시했습니다.

운영자가 최초 한 번 Authentik의 `workspace_mail` claim과 Mailcow API 키를 설정하면, 사용자는 SSO 로그인만으로 기존 본인 메일함에 들어갑니다. 사용자별 비밀번호 입력·수동 파일 등록은 필요 없습니다. 설정과 기존 설치 전환 절차는 실서비스 매뉴얼 2–3절에 있습니다.

Workspace 관리자는 Authentik의 `dyhs-admins` 그룹으로 지정합니다. Provider의 기본 `profile` mapping과 ID token claim 포함을 활성화하면 재로그인 시 반영되며, 사용자별 `roles.json` 등록은 필요 없습니다.

## 실행

아래 명령과 화면 설명은 **정적 미리보기 모드** 기준입니다. 해당 모드의 설치·SSH 접속·복구는 [미리보기 설치 매뉴얼](docs/installation.md)을 참고하세요. Live 빌드는 `npm run build:live`, 서버 실행은 설정 후 `npm start`입니다.

Node.js 24 LTS 권장. React + TypeScript + Vite를 사용합니다.

```sh
npm ci
npm run dev
# http://127.0.0.1:5173
```

```sh
npm run build
npm run preview
npm test
npm run test:e2e
```

E2E는 설치된 Google Chrome을 사용합니다. Chrome이 없는 환경에서는 `npx playwright install chrome` 후 실행하세요. `npm test`는 Node의 TypeScript 실행 지원이 필요합니다(Node 22.18+ 또는 24 권장). `.env`는 현재 필요하지 않습니다.

## 구현된 화면

- 홈: 예시 최근 메일, 읽지 않은 메일, 연결 상태, 저장 공간, 빠른 작업.
- Dyhs Mail: 폴더, 중요 메일, 검색, 안 읽음 필터, URL 선택 복원, 본문 격리, 첨부 메타데이터, 빈 상태와 연결 오류 예시.
- 작성: 새 메일, 답장·전체 답장·전달, 수신자 형식 검사, 파일 유형/합계 10 MB 검사, 탭 메모리 내 초안. 새로고침하면 초안은 사라집니다. 보내기·삭제·실제 파일 업로드/다운로드는 제공하지 않습니다.
- 개인 설정: 라이트/다크 설정을 브라우저에 저장. 계정 보안은 패스키·2FA·비밀번호의 빠른 작업 영역과 Dyhs Auth 고급 설정 링크로 구성합니다. 빠른 작업은 본인 인증 flow 검증 전까지 비활성입니다. 메일·저장 공간 설정은 미연동 안내.
- 관리: 계정 메뉴의 **관리자 화면 미리보기**를 선택하면 허구의 사용자·그룹·초대·앱 및 메일함·도메인·별칭·저장 공간을 조회합니다. Authentik 등록 폼과 변경 내용 검토를 체험할 수 있으며 HTTPS 콜백 주소를 검사합니다. 실제 생성/변경, 초대 링크·비밀 발급 또는 API 호출은 없습니다. URL 직접 접근도 기본 상태에서는 안내 화면만 표시합니다.
- 외부 서비스: Dyhs URL과 Authentik 고급 설정은 실제 외부 서비스로 새 탭에서 이동합니다. 미리보기 계정과 별개로 해당 서비스에 로그인해야 합니다.
- 모바일: 하단 제품 탐색, 폴더 선택, 목록/상세 화면 전환. 768–1279px에서는 축약 레일과 목록/상세 전환, 1280px 이상에서는 레일·폴더·목록·본문을 함께 표시합니다.

Pretendard Variable은 npm 패키지에서 번들에 포함하여 같은 출처에서 제공합니다. 글꼴 라이선스는 `public/licenses/Pretendard-LICENSE.txt`에 포함했습니다. 사용자가 제공한 MAKE;와 덕영고 로고 원본은 `public/brand/`에 보관했습니다. MAKE;는 CSS로 바깥 흰 여백만 가려 비율을 유지하며 110px 이하로 표시하고, 다크 모드에서도 흰 카드와 16px 여백을 유지합니다. 덕영고 로고는 홈 하단의 구성원 안내에 표시합니다. 제품 이름과 운영 주체를 분리했으며 학교 공식 서비스가 아님을 명시합니다. 참고 메일 스크린샷은 아직 제공되지 않아 원본 화면과의 배치 비교는 남아 있습니다.

## 구조

```text
apps/web/src/              UI, 격리된 목업 데이터, 반응형 스타일
packages/design-tokens/    공통 색상·테마 토큰
docs/                     연동 결정, 위협 모델, API 계약 초안, 검증 기록
tests/                    Node 로직 검사 + Playwright/axe UI 검사
```

Workspace는 Dockerized Mailcow가 운영되는 **메일 CT**에 별도 서비스로 배포할 예정입니다. `sso.dyhs.kr`(Auth CT), `mail.dyhs.kr`(메일 CT), `url.dyhs.kr`(URL CT)은 기존 분리를 유지합니다. 캘린더는 Mailcow SOGo CalDAV를 사용하며 AMS는 향후 독립 OIDC 앱으로 연결합니다.

아래 미리보기 Compose에는 API·DB가 없습니다. Live는 별도 `compose.live.yaml`을 사용합니다. 두 구성 모두 기존 Mailcow Compose·네트워크·볼륨을 사용하지 않습니다. 공개 배포는 수행하지 않았습니다.

```sh
docker compose -f infra/compose/compose.preview.yaml up -d --build --wait --wait-timeout 120
# 같은 호스트에서 http://127.0.0.1:3080
npm run test:container
# 컨테이너 검사에는 호스트 Node.js가 필요하며, Docker 빌드/실행 자체에는 필요하지 않습니다.
docker compose -f infra/compose/compose.preview.yaml down
```

이 이미지는 비루트 Nginx로 정적 UI만 제공하며 `/api` 요청은 `503 PREVIEW_ONLY`로 거부합니다. 서버 비밀·메일 볼륨·Docker 소켓을 포함하지 않습니다. 3080 포트는 호스트 loopback에만 바인딩됩니다. 컨테이너형 Tunnel에서 연결하려면 `localhost`가 같은 호스트를 뜻하지 않으므로 검증된 전용 네트워크 경로를 별도로 설정해야 합니다. 현재 구성은 외부 공개나 실제 인증 기능을 제공하지 않습니다. 기반 이미지는 테스트용 태그를 사용하며 제한 공개 전 검증된 digest로 고정합니다.

## 다음 단계

[연동 결정 기록](docs/integration-decisions.md), [위협 모델](docs/threat-model.md), [검증 기록](docs/verification.md), [API 계약 초안](docs/openapi.yaml)을 확인하세요.

최신 CT 배치, 기본 보안/고급 설정 분담, Authentik 관리 API 후보 및 AMS 경계는 [배포 및 계정 관리 확장](docs/deployment-and-identity.md)에 정리했습니다. 기존 OpenAPI는 메일 중심 초안이며 신규 identity API 계약은 실제 Authentik 배포 스키마 확인 후 확정합니다.

2단계 이후에는 운영 자격 증명을 코드에 넣지 말고, 읽기 전용 환경 조사와 테스트 계정에서 인증·권한 경계를 먼저 검증해야 합니다. 기존 Mailcow 데이터, SOGo 설정, Cloudflare 경로는 변경하지 않았습니다.
