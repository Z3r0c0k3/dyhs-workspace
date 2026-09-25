# 연동 결정 기록

최신 갱신: 2026-09-26. Live OIDC/서버 세션·관리자 제어 claim을 통한 자동 메일 연결·Mailcow API 앱 비밀번호 발급/암호화 보관·IMAP/SMTP 및 `dyhs-admins` 그룹 기반 Workspace 관리자 권한을 추가했습니다. 격리 테스트 통과, 운영 연결 검증은 미실시입니다. **최신 실행 범위는 [Live 설치](live-installation.md), 실제 계약은 [Live API](live-api.md)를 기준으로 합니다.** 아래는 2026-09-24 초기 조사/설계 기록입니다.

추가 결정: Workspace는 **메일 CT**에 별도 서비스로 배포하고 Auth(`sso.dyhs.kr`)·Mail(`mail.dyhs.kr`)·URL(`url.dyhs.kr`)은 서로 다른 CT를 유지합니다. 캘린더 원본은 Mailcow SOGo CalDAV로 확정했습니다. 기본 계정 보안 3종, 간편 Authentik 관리, 추후 AMS 연동의 최신 설계는 [배포 및 계정 관리 확장](deployment-and-identity.md)을 기준으로 합니다.

## 조사 결과와 한계

조사 시작 시 프로젝트 디렉터리에는 제공된 두 Markdown 지시서만 있었으며 기존 애플리케이션, Git 이력, 배포 구성이나 참고 화면 이미지가 없었습니다. 이후 사용자가 MAKE;와 덕영고 로고, 서비스 공개 URL 및 CT 배치를 제공하여 반영했습니다. 운영 자격 증명·배포 버전·내부 네트워크 구성은 제공되지 않았습니다. 홈 디렉터리의 자격 증명 등을 임의 탐색하지 않았습니다. 제공된 공개 URL의 읽기 전용 확인 범위는 확장 문서에 기록했습니다.

| 조사 항목 | 결과 | 이후 필요한 확인 |
| --- | --- | --- |
| Mailcow / Dovecot / Postfix 버전 | 알 수 없음 | 배포 tag/commit, 이미지 digest, 인증 설정의 비밀 제거본 |
| Authentik 버전·issuer·클레임 | 알 수 없음 | provider 구성, 테스트 계정의 비밀 제거 클레임 예시 |
| 사용자 생성·변경 방식 | 알 수 없음 | 운영 주체, 원본 시스템, 기존 중복/주소 변경 처리 |
| 기존 SSO / IMAP / SMTP 인증 | 알 수 없음 | 활성 SASL 방식, 토큰 위임 지원, 폐기·만료 테스트 |
| CT 배치 / 공개 URL | 사용자 제공 방향 확정 | 메일 CT에 Workspace 배포; Auth/URL CT 분리. 내부 경로와 공개 Workspace 주소 확인 필요 |
| SOGo 기능과 경로 | Mailcow CalDAV 사용 결정 | 실제 DAV 인증·principal 경로·공유 캘린더 권한 검증 필요 |
| Cloudflare Tunnel | 알 수 없음 | 공개 hostname과 내부 origin, 네트워크 분리 구성 |
| MAKE; 및 덕영고 로고 | 사용자 제공 원본 반영 | 원본 파일 보존, CSS로 MAKE; 바깥 여백 조정, 흰 카드에 표시 |
| 참고 메일 스크린샷 | 미제공 | 문서의 3열 배치 적용; 원본 화면과의 비교는 미실시 |
| 현재 로컬 실행 환경 | Node 24.18.0, npm 11.16.0 | package-lock.json으로 의존성 고정 |

## 공식 문서에서 확인한 범위

1. Authentik의 Mailcow 연동 안내는 Mailcow 2025-03 이상을 요구하고 Generic-OIDC 설정을 설명합니다. **현재 배포가 이 조건을 충족하는지는 미확인**입니다. [Authentik 공식 연동 문서](https://docs.goauthentik.io/integrations/services/mailcow/)
2. Mailcow Generic-OIDC 문서는 외부 IMAP/SMTP 클라이언트에 앱 비밀번호 사용을 안내합니다. 따라서 웹 OIDC 성공만으로 Workspace 서버의 메일함 접근이 성립한다고 볼 수 없습니다. [Mailcow 공식 문서](https://docs.mailcow.email/manual-guides/mailcow-UI/u_e-mailcow_ui-generic-oidc/)
3. Dovecot 2.3 문서에는 OAuth2 passdb와 XOAUTH2/OAUTHBEARER 구성이 있지만, 이것이 현재 Mailcow 배포에 활성화되었거나 Authentik 토큰과 호환된다는 증거는 아닙니다. 실제 배포 버전에 맞춰 별도로 검증해야 합니다. [Dovecot 공식 문서](https://doc.dovecot.org/2.3/configuration_manual/authentication/oauth2/)

위 문서의 설정을 운영 서버에 적용하지 않았습니다. Mailcow 관리 API를 메시지 조회 API로 사용하지 않습니다.

## 이번 구현 결정

- UI는 React/TypeScript와 Vite 정적 앱. 지시서의 React 기준을 충족하며 서버 렌더링이 필요하지 않은 목업 단계에서 Next.js/API/DB를 미리 추가하지 않습니다. Vite 실행 조건은 [공식 안내](https://vite.dev/guide/)를 확인했습니다.
- 모든 메일은 `mock.ts`에 분리된 `.example` 허구 데이터. 로그인·메일 API·실제 발송·삭제 코드는 없습니다. 공개 서비스 링크는 `services.ts`에 분리했으며 `VITE_*` 환경 변수에 비밀을 넣지 않습니다.
- hash URL로 화면, 폴더, 선택 메시지, 설정 섹션을 복원합니다. 실데이터 단계에서는 검색·정렬·페이징을 서버로 옮깁니다.
- UI 테마만 localStorage에 저장. 작성 내용과 파일 이름/크기는 탭 메모리에만 있으며 실제 파일은 읽거나 업로드하지 않습니다.
- 본문은 plain text를 HTML escape 후 sandbox iframe에 표시. iframe CSP `default-src 'none'`으로 링크·스크립트·원격 이미지·외부 자원을 차단합니다. 발신자 본문은 별도 흰 배경/시스템 글꼴로 표시하고 셸 테마를 강제하지 않습니다. 실제 HTML/MIME 정화 지원과 구분합니다.
- 실제 API가 없으므로 서버 권한을 검증했다고 주장하지 않습니다. 관리자 체크박스는 UI 시연용이며 인증 기능이 아닙니다.
- 정적 미리보기용 독립 Compose를 추가했습니다. 운영 네트워크·DB·Mailcow Compose는 수정하지 않으며, 실제 연동은 배포 환경 검증 뒤 별도로 추가합니다. 기존 SOGo는 유지합니다.

## 인증·메일함 연결 결정 게이트

현재 선택: **읽기 전용 데이터 목업 유지**. 메일 접근 방식은 미결정이며 테스트 도메인에서 아래 후보를 비교하고 운영 책임자가 결정해야 합니다.

| 후보 | 조건 | 주요 검증 |
| --- | --- | --- |
| 사용자별 OAuth2 위임 | 현재 Dovecot/Mailcow가 지원하고 토큰 audience/scope를 제한할 수 있음 | 서로 다른 2개 사용자 격리, 만료, 즉시 폐기, SMTP 지원, 키 회전 |
| 서버 측 사용자별 앱 비밀번호 보관 | 안전한 등록·암호화·회전·삭제 절차가 합의됨 | 키 관리, 사용자별 자격 증명 분리, 비밀번호 유출 방지, 사용자 철회 |
| IMAP 마스터 계정 | 이번 단계에서 채택하지 않음 | 광범위한 접근 권한을 피할 대안과 최소 권한 근거 필요 |

어떤 후보도 지금 구현·연결하지 않았습니다. 브라우저나 로그에는 비밀번호·마스터 자격·API 키를 제공하지 않습니다.

2단계 구현 전 필요한 서버 불변 조건:

- `(issuer, sub)`를 유일한 외부 식별자로 저장. 이메일은 표시/검증 대상이며 자동 연결 키가 아닙니다.
- 메일함 연결은 서버 검증 및 명시된 프로비저닝 결과로만 생성. 중복 연결은 DB unique constraint로 거부. 주소 변경은 같은 sub의 명시적 변경 절차, sub 변경은 재연결 검토, 미연결은 지원 요청 상태.
- OIDC Authorization Code + PKCE, state/nonce 일회 검증, issuer/audience/signature 검증, 엄격한 redirect URI. 서버 세션 쿠키만 브라우저에 제공(HttpOnly/Secure/SameSite), 만료·회전·로그아웃·폐기 구현.
- 사용자 역할은 서버 설정으로 매핑하며 기본 거부. 메일 운영자는 명시된 도메인만 접근. 그룹 문자열이나 클라이언트 역할 표시는 신뢰하지 않음.
- 사용자/관리 API별 소유권·도메인 범위 검사, 상태 변경 CSRF 및 Origin 검증, rate limit, 민감 응답 `Cache-Control: no-store`.
- 권한 변경, 연결 생성/폐기, 전송 결과에 비밀·본문 없이 actor, 대상 식별자, 결과, correlation ID 기록. 보존 기간은 운영 정책으로 결정.

## 단계별 실행 및 완료 조건

| 단계 | 현재 상태 | 실행 / 환경 / 필요한 검증 |
| --- | --- | --- |
| 0 | 문서 조사 완료, 운영 조사 미실시 | 본 문서와 위협 모델. 환경변수 이름은 `.env.example`; 실제 값 불필요 |
| 1 | 구현 완료 | `npm ci && npm run dev`; `npm run build`, `npm test`, `npm run test:e2e`; 결과는 verification.md |
| 2 | 미구현 | 테스트 issuer/client/redirect, DB/세션 설정 확보. SSO·CSRF·역할·주소 변경·중복 연결·세션 만료 검증 |
| 3 | 미구현 | 검증된 사용자별 메일 접근. 폴더+UIDVALIDITY+UID 수명, opaque ID 소유권, 한글 MIME/첨부, 원격 이미지 및 HTML 정화 검증 |
| 4 | 미구현 | 허용 발신자 검증, idempotency, SMTP 수락 기록, Sent 저장 부분 실패, 제한된 첨부·용량 및 재시도 검증 |
| 5 | 미구현 | 지원 API/권한 확인된 설정만 연결. 분산 프로비저닝 단계·오류·재시도·수동 복구 기록. 삭제는 별도 승인·백업 단계 |
| 6 | 미실시 | 테스트 계정 E2E 후 제한 공개. 기존 SOGo 폴백 유지. DNS/Tunnel/SKIP_SOGO 변경과 Kutt 이전은 이번 범위 밖 |

되돌리기: 현재는 로컬 정적 앱 프로세스만 중지하면 됩니다. 운영 전환 후에도 기존 SOGo를 유지하고 Workspace 노출만 제거할 수 있도록 별도 origin에서 검증합니다.
