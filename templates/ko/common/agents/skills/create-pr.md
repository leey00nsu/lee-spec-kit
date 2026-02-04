# Pull Request 생성 프로세스

Pull Request를 생성할 때 따르는 가이드입니다.

---

## 사전 조건

- [ ] 모든 태스크 `[DONE]` 상태
- [ ] `tasks.md`의 "완료 조건" 체크리스트 모두 체크
- [ ] 변경 사항 커밋 완료
- [ ] 브랜치 푸시 완료

---

## 단계

### 1. PR 내용 작성

> 📖 **`pr-template.md`를 반드시 참조하세요.**

| 항목   | 형식                               |
| ------ | ---------------------------------- |
| 제목   | `feat(#{이슈번호}): {기능명} ({짧은 설명})` |
| 본문   | 개요, 변경 사항, 테스트, 관련 문서 |
| 라벨   | 적절한 라벨 지정                   |
| 담당자 | `@me` (기본값)                     |

### 2. 테스트 검증

> 🚨 **테스트 미통과 시 PR 생성 불가**

1. 작업과 관련된 테스트 명령어 실행 (예: `npm test`, `pnpm test`), 테스트가 없는 경우 사용자에게 요청
2. 결과 확인 (PASS/FAIL)
3. PR 본문 "테스트" 섹션에 **실행한 테스트만** 체크리스트로 추가하고, **모두 체크([x])** 합니다. (미실행 항목은 작성하지 않기)
4. 테스트를 실행하지 않았다면, PR 생성 전에 사용자에게 요청/확인합니다.

### 3. 스크린샷/다이어그램 작성 (PR 본문에 포함)

PR 본문에 결과물을 포함합니다.

> - UI 변경에 해당된다면 **스크린샷을** 포함하세요.
> - 로직/구조 변경에 해당된다면 **다이어그램을** 포함하세요.

#### UI 변경 (프론트엔드 PR)

- `agent-browser`로 스크린샷을 생성합니다.
- 스크린샷 파일은 로컬 임시 폴더(`/tmp/lee-spec-kit/pr-assets/`)에 저장합니다.
- 릴리스 자산(Release assets)으로 업로드한 뒤, 생성된 이미지 URL을 PR 본문 "스크린샷" 섹션에 넣습니다.

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

# (권장) 스크린샷을 위해 띄운 개발 서버는 작업이 끝나면 종료합니다.
kill \"$DEV_PID\" >/dev/null 2>&1 || true
```

```bash
# 스크린샷을 Release assets로 업로드하고, PR 본문에 넣을 URL 만들기
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
SAFE_BRANCH=$(git branch --show-current | tr '/' '-')
TAG="pr-assets/${SAFE_BRANCH}"

gh release view "$TAG" >/dev/null 2>&1 || \
  gh release create "$TAG" --prerelease --title "pr-assets: ${SAFE_BRANCH}" --notes ""

gh release upload "$TAG" /tmp/lee-spec-kit/pr-assets/* --clobber

echo \"![](https://github.com/${REPO}/releases/download/${TAG}/ui-1.png)\"
```

#### 로직/구조 변경 (백엔드 PR)

- PR 본문에 Mermaid 다이어그램(예: flowchart/sequence)을 작성합니다. (`pr-template.md`의 "아키텍처 다이어그램" 섹션 참고)

### 4. 사용자 확인 요청

> 🚨 **사용자 확인 필수**

PR 생성 전 다음 내용을 **코드블록으로** 사용자에게 공유하고 **명시적 승인(OK)** 대기:

- 제목
- 본문 전체 (`pr-template.md` 형식)
- 라벨

### 5. PR 생성

```bash
gh pr create \
  --title "feat(#{이슈번호}): {기능명} ({짧은 설명})" \
  --body-file /tmp/pr-body.md \
  --assignee @me \
  --base main
```

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

- **PR 템플릿**: `pr-template.md`
- **Git 워크플로우**: `git-workflow.md`
