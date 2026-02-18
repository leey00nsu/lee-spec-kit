# Pull Request 생성 프로세스

Pull Request를 생성할 때 따르는 가이드입니다.
실행 상태 SSOT는 Feature 폴더의 `pr.md`입니다.

---

## 사전 조건

- [ ] 모든 태스크 `[DONE]` 상태
- [ ] `tasks.md`의 "완료 조건" 체크리스트 모두 체크
- [ ] 변경 사항 커밋 완료
- [ ] 브랜치 푸시 완료

---

## Pre-PR 기본 체크리스트(`builtin-checklist`)

Pre-PR 리뷰에서 항상 수행하는 최소 기준입니다. 가능한 경우 리뷰 스킬을 추가로 사용해 심화 검토를 진행하세요.

1. `spec.md` / `plan.md` / `tasks.md` 기준으로 변경 범위 정합성을 확인하고, 구현이 원래 목적에 맞는지 점검합니다.
2. 회귀/예외 처리, 크리티컬·보안 리스크, 사이드 이펙트, 사용자 흐름 영향, 배포 준비도를 점검합니다.
3. 유지보수성을 점검합니다: 큰 함수/파일은 필요 시 분리하고, 기존 코드 재사용·통합 가능성을 확인하며, 불필요해진 코드를 정리합니다.
4. 관련 테스트/검증 명령을 실행합니다. 실행하지 못했다면 사유를 명시합니다.
5. `PR 전 리뷰 Evidence`에 실제 근거(리뷰 링크, 로그, 문서 경로)를 기록합니다.
6. `PR 전 리뷰 Decision`을 `결정: ...`(또는 `decision: ...`) 형식으로 기록해 핵심 판단 근거를 남깁니다.
7. 체크리스트 완료 후에만 `PR 전 리뷰`를 `Done`으로 변경합니다.

---

## 단계

### 1. `pr.md` 본문 초안 준비

> 📖 **이번 세션에 아직 읽지 않았다면 `docs get`으로 절차/템플릿을 읽고, 이미 읽은 동일 문서는 재호출하지 않은 채 본문 템플릿을 생성해 기준으로 사용하세요.**

```bash
# 1) 절차/템플릿 정책 확인 (이번 세션 미확인 문서만)
npx lee-spec-kit docs get create-pr --json
npx lee-spec-kit docs get pr-doc --json

# 2) 본문 템플릿 생성 (원격 작업 아님)
npx lee-spec-kit github pr F001 --json
# - 스크린샷 강제 포함: --screenshots on
# - Mermaid 강제 포함: --mermaid on
# - 자동 정책(기본): --screenshots auto --mermaid auto
```

`docs get pr-doc --json` 출력은 문서 구조 정책으로 보고,
`github pr --json`의 `body`를 참고해 `pr.md` 초안을 보완하세요.
실제 진행 상태는 `pr.md`의 `상태(Draft | Ready)`를 사용합니다.

| 항목   | 형식                               |
| ------ | ---------------------------------- |
| 제목   | `feat(#{이슈번호}): {기능명} ({짧은 설명})` |
| 본문   | 개요, 변경 사항, 테스트, 관련 문서 |
| 라벨   | **최소 1개 필수** (비워둘 수 없음) |
| 담당자 | `@me` (기본값)                     |

> ⚠️ 라벨을 비워둘 수 없습니다. 적절한 라벨이 없거나 확신이 없다면, PR 생성 전에 사용자에게 라벨을 요청/확인하세요.

### 2. 테스트 검증

> 🚨 **테스트 미통과 시 PR 생성 불가**

1. 작업과 관련된 테스트 명령어 실행 (예: `npm test`, `pnpm test`), 테스트가 없는 경우 사용자에게 요청
2. 결과 확인 (PASS/FAIL)
3. PR 본문 "테스트" 섹션은 생성된 본문 템플릿 기준으로, 실제 실행한 테스트만 반영합니다.
4. 테스트를 실행하지 않았다면, PR 생성 전에 사용자에게 요청/확인합니다.

### 3. 스크린샷/다이어그램 작성 (PR 본문에 포함)

PR 본문에 결과물을 포함합니다.

> - UI 변경에 해당된다면 **스크린샷을** 포함하세요.
> - 로직/구조 변경에 해당된다면 **다이어그램을** 포함하세요.
> - `--mermaid auto`는 기본적으로 다이어그램을 포함합니다. 로직/구조 변경이 전혀 없는 경우에만 `--mermaid off`를 사용하세요.

#### UI 변경

- 기본값은 `pr.screenshots.upload: false`입니다. 업로드/URL 포함이 필요하다면 `.lee-spec-kit.json`에서 `true`로 켜세요.
- `.lee-spec-kit.json`에서 `pr.screenshots.upload: false`라면 **업로드/URL 포함을 하지 않으며**, PR 본문에서도 **"스크린샷" 섹션을 만들지 않습니다.**
- `agent-browser`로 스크린샷을 생성합니다.
- 스크린샷 파일은 로컬 임시 폴더(`/tmp/lee-spec-kit/pr-assets/`)에 저장합니다.
- 릴리스 자산(Release assets)으로 업로드한 뒤, 생성된 이미지 URL을 PR 본문 "스크린샷" 섹션에 넣습니다.
- 스크린샷을 업로드하기 전에 **이미지 파일을 직접 열어** 다음을 확인하고, PR 생성 전 사용자에게도 검증받습니다.
  - 로그인 화면/권한 오류/에러 화면/빈 화면이 아닌지
  - 이번 PR의 변경 사항이 실제로 보이는지
  - 민감 정보(실서비스 토큰/개인정보/내부 URL)가 노출되지 않았는지

> 로그인/권한이 필요한 화면이라면, 스크린샷을 찍기 전에 사용자에게 아래 중 하나를 요청하세요.
> - 개발 서버에서 **로그인 없이** 접근 가능한 미리보기 URL 제공 (dev-only bypass 포함)
> - **테스트 계정** 제공(실계정/실서비스 토큰 금지) + 로그인 절차 안내
> - 시드 데이터/더미 데이터로 재현 가능한 경로 제공

```bash
# (최초 1회) agent-browser 설치
npm i -g agent-browser
agent-browser install  # Playwright 브라우저 설치

# 개발 서버 실행: 이미 사용 중인 포트가 많으므로 "빈 포트"를 권장합니다.
# - 이미 떠있는 개발 서버가 있다면 그 URL을 PREVIEW_URL로 지정해도 됩니다.
PORT=$(node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});")
# (예시) Vite
pnpm dev --host 127.0.0.1 --port \"$PORT\" >/tmp/lee-spec-kit-dev.log 2>&1 &
DEV_PID=$!
PREVIEW_URL=\"http://127.0.0.1:${PORT}\"

# (예시) 미리보기 URL을 정해 스크린샷 생성
mkdir -p /tmp/lee-spec-kit/pr-assets
agent-browser open "$PREVIEW_URL"
agent-browser screenshot /tmp/lee-spec-kit/pr-assets/ui-1.png --full
agent-browser close

# (필수) 스크린샷 파일을 열어 검증 (로그인/에러/빈 화면이면 재촬영)
ls -lh /tmp/lee-spec-kit/pr-assets/ui-1.png
# macOS: open /tmp/lee-spec-kit/pr-assets/ui-1.png
# Linux: xdg-open /tmp/lee-spec-kit/pr-assets/ui-1.png

# (권장) 스크린샷을 위해 띄운 개발 서버는 작업이 끝나면 종료합니다.
kill \"$DEV_PID\" >/dev/null 2>&1 || true
```

```bash
# 스크린샷을 Release assets로 업로드하고, PR 본문에 넣을 URL 만들기
# - `.lee-spec-kit.json`에서 `pr.screenshots.upload: false`라면 이 단계는 생략합니다.
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
SAFE_BRANCH=$(git branch --show-current | tr '/' '-')
TAG="pr-assets/${SAFE_BRANCH}"

gh release view "$TAG" >/dev/null 2>&1 || \
  gh release create "$TAG" --prerelease --title "pr-assets: ${SAFE_BRANCH}" --notes ""

gh release upload "$TAG" /tmp/lee-spec-kit/pr-assets/* --clobber

echo \"![](https://github.com/${REPO}/releases/download/${TAG}/ui-1.png)\"
```

#### 로직/구조 변경

- PR 본문에 Mermaid **`sequenceDiagram`**을 작성하고, 생성된 본문 템플릿 형식과 일치하게 유지합니다.
- 이 기준은 프론트/백엔드 구분이 아니라 변경 유형(로직/구조) 기준으로 적용합니다.

### 4. 사용자 확인 요청 + `Ready` 전환

> 🚨 **사용자 확인 필수**

PR 생성 전 다음 내용을 **코드블록으로** 사용자에게 공유하고 **명시적 승인(OK)** 대기:

- 제목
- 본문 전체 템플릿 (`pr.md` 기준)
- 라벨(최소 1개, 비워둘 수 없음)

승인/생성 전에 `pr.md`의 변경 사항/테스트 섹션을 실제 작업 기준으로 보완하세요.
승인 후 `pr.md` 상태를 `Ready`로 변경하세요.

### 5. PR 생성 (`pr.md`가 `Ready`일 때)

```bash
gh pr create \
  --title "feat(#{이슈번호}): {기능명} ({짧은 설명})" \
  --body-file /tmp/pr-body.md \
  --label "{라벨1,라벨2}" \
  --assignee @me \
  --base main

# 또는 lee-spec-kit helper 사용 (명시적 승인 필요)
npx lee-spec-kit github pr F001 --create --confirm OK --labels enhancement
```

생성 후:
- 생성된 PR 링크를 `tasks.md`에 기록
- PR 상태를 `Review`로 기록/유지
- `pr.md` 상태는 `Ready`로 유지 (생성/머지 상태는 `tasks.md`의 PR/PR 상태로 관리)

---

## 주의사항

### 링크 형식

PR 본문의 파일 링크는 **현재 브랜치명**을 사용:

```markdown
[파일명](https://github.com/{owner}/{repo}/blob/{브랜치명}/path/to/file)
```

> ⚠️ `main` 브랜치 링크는 머지 전까지 404 발생!

---

## 코드리뷰 수정 기준

> 📋 **리뷰 피드백으로 수정이 필요할 때 task 추가 여부 판단 기준**

### task 추가 불필요 (사소한 수정)

- 오타/코드 스타일 수정
- 변수명/함수명 변경
- 주석 추가/수정
- 린트 오류 수정

### task 추가 필요 (중요한 수정)

- 로직/알고리즘 변경
- 새 파일/함수 추가
- API 시그니처 변경
- 테스트 케이스 추가
- spec.md 또는 plan.md 변경이 필요한 경우

---

## 참조 문서

- **본문 템플릿 생성기**: `npx lee-spec-kit github pr <feature-name>`
- **승인 규칙**: 제목/본문/라벨 공유 후 `--create --confirm OK` 실행
- **실행 상태 SSOT**: `docs/features/.../<feature>/pr.md`
