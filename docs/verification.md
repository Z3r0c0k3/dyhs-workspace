# 구현 및 검증 기록

## 2026-09-25 Live 추가 검증

- OIDC/서버 API: 실제 격리 PostgreSQL에 세션을 저장하고 PKCE·state·nonce·서명·issuer·audience·만료·재인증·CSRF·권한 범위·중복 생성 차단을 검증했습니다.
- 메일: IMAP/SMTP 대역과 실제 MIME 라이브러리로 다른 사용자/UIDVALIDITY/첨부 접근, 한글 HTML+첨부, 발신자 고정, SMTP 불명·부분 수락·Sent 저장 실패와 중복 재전송 방지를 검증했습니다.
- `npm run test:live`: 4개 시나리오 통과. 320/768/1440px 홈·계정·관리·메일의 가로 넘침과 axe AA 위반 없음. API 응답 대역으로 발송 UI·본문 안전 표시·로그아웃 확인.
- Live 이미지 빌드 및 `tests/server/container-smoke.mjs`: 실제 Docker의 TLS OIDC discovery·PostgreSQL·비루트 UID 1000·읽기 전용 실행·로고·API 401·로그인 리다이렉트 검사 통과.
- 운영 Authentik·Mailcow에 대한 실제 로그인/메일 전송은 미실시입니다. 출시 전 확인과 현재 제한은 [Live 설치](live-installation.md)에 명시했습니다.

## 2026-09-24 미리보기 검증

검증일: 2026-09-24. 범위: 로컬 목업, 운영 서버 연결 없음.

## 실행 결과

| 항목 | 결과 |
| --- | --- |
| `npm run build` | TypeScript 검사와 Vite 배포 빌드 통과 |
| `npm test` | Node 테스트 4개 통과 |
| `npm run test:e2e` | Chrome/Playwright 시나리오 5개 통과(10.3초) |
| `docker compose -f infra/compose/compose.preview.yaml config --quiet` | 독립 미리보기 Compose 구성 검사 통과 |
| Docker 이미지 빌드 및 `up --wait` | 로컬 OrbStack에서 빌드 통과, 비루트 Nginx 컨테이너 Healthy 확인 |
| `npm run test:container` | 상태 확인·정적 화면/로고·보안 헤더·API 503 차단·`.env` 404 검사 통과 |
| OpenAPI 초안 | Ruby YAML 파싱 통과, 9개 경로 확인. 실제 API 검증 아님 |
| 의존성 설치 시 npm audit | 알려진 취약점 0개(설치 시점 결과) |

기본 테스트: 잘못된 URL의 안전한 처리, 폴더-메일 선택 일치, 한글 검색/안 읽음 필터, 빈 폴더, 허구 도메인 사용, HTML/script/image/link 텍스트 escape 및 본문 CSP. 앱 callback에 대해 HTTPS·자격 증명·와일드카드·공백·fragment 검사를 추가했습니다.

브라우저 테스트: 홈 진입 → 검색 → 메일 선택 → 새로고침 선택 복원 → 격리된 한글 본문 확인 → 전체 답장 → 초안 보관/재개 → Escape 닫기 및 원래 버튼 초점 복귀 → 다크 테마 저장/새로고침 → 관리자 화면 기본 제한/예시 토글.

추가 시나리오: 빠른 계정 보안 3개 작업 비활성 확인, Auth 고급 설정/URL 외부 링크 확인, 사용자·그룹·초대·앱 등록 폼 검토, 잘못된 callback 오류, 실제 변경 HTTP 요청 0건. 320px에서 새 대화상자 4종의 가로 넘침과 axe 접근성도 확인했습니다. 테마 변경 중 버튼 배경만 전환되어 일시적으로 대비가 낮아지는 문제를 찾아 배경 전환 애니메이션을 제거했습니다.

320px, 768px, 1440px에서 홈, 메일 목록·읽기, 일반·메일·보안·저장 공간 설정, 작성 대화상자, 관리 화면을 확인했습니다. 검증한 화면에서 페이지 가로 넘침 없음. 태블릿/모바일의 목록-상세 전환 및 브라우저 뒤로 가기 확인. 해당 화면의 axe WCAG 2 A/AA 및 2.1 AA 자동 검사에서 위반 0개; 관리 화면은 라이트·다크 모두 검사했습니다.

## 수동 확인

- 로컬 브라우저의 데스크톱 홈과 4영역 메일 배치, 320px 메일 상세 표시를 확인했습니다.
- 청색 메일 헤더, 연한 브랜드 선택 배경, 얇은 구분선, 자체 제공 Pretendard Variable 적용.
- 상단 고정 미리보기 표시, 비활성 전송·삭제, 준비 중 앱의 비활성 탐색 확인.
- 사용자 제공 MAKE; 원본을 CSS 표시 창으로 여백 조정하고 덕영고 원본을 홈에 배치. 이미지 원본은 수정하지 않음.
- 검정 글자를 포함한 로고는 다크 모드에서도 흰 카드 사용. 제품 이름과 운영 MAKE; 및 학교 공식 서비스 아님을 별도로 표시.
- 컨테이너에서 업로드 원본의 파일 권한 때문에 발생한 로고 403을 확인하고, 빌드 산출물을 Nginx 사용자 소유로 복사하도록 수정해 해결했습니다. 미리보기는 로컬 `127.0.0.1:3080`에서만 제공하며 운영 메일 CT 배포 검증은 아닙니다.

## 자동 검사의 범위와 제한

메일 본문 iframe은 빈 sandbox 권한과 CSP로 스크립트 실행을 차단합니다. 이 보안을 낮추지 않기 위해 axe는 legacy 모드/`iframes: false`로 셸을 검사합니다. 본문은 별도의 Playwright 프레임 읽기와 escape 테스트로 확인했으며 흰 배경·검정 16px 텍스트(21:1 대비)를 사용합니다. iframe 내부 전체 접근성 자동 검증이나 스크린리더 실사용 인증을 뜻하지 않습니다.

실제 HTML 메일, 한국어 MIME/첨부 다운로드, OIDC/CSRF/세션 만료, 서버 측 사용자별 권한, SMTP 전송/중복 방지/Sent 부분 실패, 프로비저닝 복구, 운영 배포/백업/전환은 **미구현·미검증**입니다. 실제 연동을 완료했다고 볼 수 없습니다.

메일 참고 화면 이미지는 아직 제공되지 않아 원본과 픽셀 단위 비교는 하지 않았습니다. 초안은 탭 메모리에만 존재하며 새로고침하면 사라집니다. 메일 설정 편집과 빠른 비밀번호·패스키·2FA 작업은 지원 API/flow 검증 전까지 비활성입니다. 사용자 제공 Auth 도메인의 공식 사용자 설정 경로에는 외부 링크를 제공합니다. 실제 인스턴스 로그인 및 설정 변경은 수행하지 않았습니다.

## 다음 단계에 필요한 입력

- Mailcow/Authentik/Dovecot의 실제 버전과 비밀을 제거한 인증·배포 구성.
- 테스트 계정/도메인, OIDC issuer·클라이언트·엄격한 redirect 등록 및 서버 비밀 전달 경로.
- 사용자별 메일함 접근 방식 검증 및 역할/도메인 매핑 결정.
- 기존 SOGo 경로와 Cloudflare Tunnel origin, 공식 메일 참고 화면.

다음 단계의 실행 순서와 환경 변수 이름은 [연동 결정](integration-decisions.md) 및 [환경 변수 예시](../.env.example)를 참고하세요. 기존 운영 서비스는 변경하지 않았습니다.


## 2026-09-26 SSO 메일 자동 연결

- `npm run build:live`: TypeScript 및 Live 번들 통과.
- `npm run test:server`: 격리 PostgreSQL로 3개 통합 검사 통과. 서명 검증 전 Mailcow 호출 차단, SSO → 자동 발급 → 내부 메일 이동, CSRF, 주소 주입 거부, 계정별 연결 고정, 암호문/사용자 바인딩, 재시작·동시 로그인·발급 응답 유실 복구, 폐기 후 재발급 차단, 자동 자격 증명을 사용하는 IMAP/SMTP와 Sent 저장 확인.
- `npm run test:live`: 5개 통과. 320/768/1440px 접근성·메일 송수신 UI, 홈의 내부 메일 링크, 비밀번호 입력 없는 연결 재시도 확인.
- Docker 이미지 빌드 및 `tests/server/container-smoke.mjs`: 수동 메일 계정 파일 없이 sso-auto 기동, TLS OIDC discovery, workspace_mail scope, DB, 비루트/읽기 전용 실행 확인.
- 임시 디렉터리의 초기 설정 생성, 키 생성/0600 권한, 필수 변수 검증, Compose config 검사 통과.

Mailcow API 응답 형식은 공식 json_api.php와 functions.app_passwd.inc.php를 확인했습니다. 네트워크 인증·발급·메일 전송은 테스트 대역을 사용했으며 **운영 Authentik·Mailcow 계정으로 실제 송수신한 결과는 아닙니다**. 실제 배포의 claim·API 키·993/465 TLS 경로 검증은 실서비스 설치 문서 2–4절을 따릅니다.


## 2026-09-26 Workspace 관리자 그룹

- `dyhs-admins`를 포함한 서명된 OIDC claim으로 관리자 API 조회/생성이 허용되는 통합 테스트 통과. 일반 그룹, 다른 대소문자/접두사, Authentik 관리자 그룹만 있는 경우, 누락/잘못된 groups claim, 위조 헤더는 권한을 얻지 못함. 같은 sub가 그룹에서 빠진 뒤 재로그인하면 일반 사용자로 처리됨.
- `npm run test:server`: 3개 통과, 기존 자동 메일 연결/IMAP/SMTP 회귀 검사 포함.
- 운영 Docker 이미지 빌드와 roles.json 없는 비루트/읽기 전용 컨테이너 기동 검사 통과.
- 실제 운영 Authentik 그룹/Provider 설정은 변경하지 않음. 기존 세션은 재로그인 필요, 그룹 제거의 기존 세션 반영 지연은 최대 15분.
