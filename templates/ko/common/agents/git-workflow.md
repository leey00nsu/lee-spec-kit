# Git 워크플로우 가이드

에이전트가 Git/GitHub 작업을 자동화하기 위한 규칙입니다.

---

## 핵심 개념

| 개념      | GitHub workflow | Local workflow | 설명                    |
| --------- | --------------- | -------------- | ----------------------- |
| Feature   | GitHub Issue    | Feature ID     | 기능 단위 작업          |
| 태스크    | Commit          | Commit         | 개별 구현 단위          |
| 기능 완료 | Pull Request    | Local merge    | Feature 완료 통합       |

---

## 브랜치 전략

```
main
 └── feat/123-feature-name    # Issue #123 기반 브랜치
      ├── commit 1: feat(#123): 기능 구현
      ├── commit 2: test(#123): 테스트 작성
      └── commit 3: docs(#123): 문서 업데이트
```

### 브랜치 네이밍

```
{type}/{issue-number}-{feature-name}
```

| Type       | 설명      |
| ---------- | --------- |
| `feat`     | 새 기능   |
| `fix`      | 버그 수정 |
| `refactor` | 리팩토링  |
| `docs`     | 문서      |

**예시:**

- `feat/123-user-auth`
- `fix/456-login-error`

---

## 커밋 컨벤션

> 📖 Type과 Description은 [Udacity Git Commit Message Style Guide](https://udacity.github.io/git-styleguide/)를 따릅니다.

### 형식

Feature scope는 아래 canonical 형식 중 하나만 사용하며, 에이전트가 임의의 scope 형식을 만들지 않습니다.

```text
# GitHub Issue가 연결된 Feature
{type}(#{issue}): {description}

# Issue가 없는 local Feature
{type}({featureId}): {description}
```

예:

```text
feat(#123): 사용자 인증 구현
docs(#123): 인증 스펙 명확화
feat(K7M2Q9RX4DAB): 알림 설정 구현
docs(K7M2Q9RX4DAB): 알림 문서 업데이트
```

local Feature의 scope는 안정적인 Feature ID(`K7M2Q9RX4DAB`)입니다. 전체 폴더 ref인 `K7M2Q9RX4DAB-notification-settings`를 scope로 사용하지 않으며, `docs: K7M2Q9RX4DAB ...`처럼 Feature scope를 생략한 커밋도 canonical 형식이 아닙니다.

### Type 목록

| Type       | 설명        | 예시                                |
| ---------- | ----------- | ----------------------------------- |
| `feat`     | 새 기능     | `feat(#123): 사용자 인증 구현`      |
| `fix`      | 버그 수정   | `fix(#123): 로그인 오류 수정`       |
| `refactor` | 리팩토링    | `refactor(#123): 인증 로직 분리`    |
| `test`     | 테스트      | `test(#123): 인증 단위 테스트 추가` |
| `docs`     | 문서        | `docs(#123): 스펙 명확화`           |
| `style`    | 코드 스타일 | `style(#123): 린트 오류 수정`       |
| `chore`    | 기타        | `chore(#123): 의존성 업데이트`      |

---

## 자동화 워크플로우

> 📖 단계별 상세 가이드는 `docs get`으로 확인하되, 같은 세션에서 이미 읽은 동일 문서는 다시 호출하지 마세요. (세션 시작/압축 후, 정책·설정 변경, 사용자 새로고침 요청 시에만 재조회)

| 워크플로우   | 가이드                                             |
| ------------ | -------------------------------------------------- |
| Feature 시작 | `npx lee-spec-kit docs get create-feature --json` |
| Issue 생성   | `npx lee-spec-kit docs get create-issue --json`   |
| 태스크 실행  | `npx lee-spec-kit docs get execute-task --json`   |
| PR 생성      | `npx lee-spec-kit docs get create-pr --json`      |

### 브랜치 생성

브랜치/worktree 생성 명령의 기준은 `workflow-stage`입니다.

```bash
npx lee-spec-kit workflow-stage <featureRef> --json
```

worktree 경로를 직접 만들지 말고 반환된 `nextAction.command`를 실행하세요.
`standalone` 모드에서는 이 명령이 공유 `workspaceRoot/.worktrees/{project-name}/`
아래에 worktree를 만들고, Git에 등록되지 않은 이전 managed 디렉터리를 정리하며,
새 worktree에 대상 파일이 없을 때 프로젝트 루트의 기존 `.env`/`.env.*` 파일을 복사합니다.

새 embedded Feature는 `workspace_checkpoint` 안내에 따라 해당 Feature의 계획 문서를 먼저 커밋합니다. 이후 반환된 worktree 생성 명령을 실행하고 지정된 작업 경로에서 이어갑니다. Feature 문서가 없는 HEAD에서 worktree를 직접 만들지 않습니다.


> 이후 작업은 `workflow-stage`가 반환한 worktree 경로에서 진행하세요.

### 문서 커밋 규칙 (Continuous Sync)

> 🔄 **Project 코드 변경 시 Docs 동기화는 필수입니다.**

| 상황                    | 규칙                                                     |
| ----------------------- | -------------------------------------------------------- |
| **Project + Docs 변경** | 프로젝트 커밋 시 Docs도 **반드시 함께 커밋** (Sync 유지) |
| **Docs만 변경**         | `custom.md` 수정 등 문서만 변경된 경우 **Docs만 커밋**   |

#### Standalone 모드 커밋 가이드

workflow에 따라 scope를 선택합니다. Issue가 연결되어 있으면 `#123`, Issue 없는 local Feature라면 `K7M2Q9RX4DAB` 같은 Feature ID를 사용합니다.

1. **Project 커밋** (코드 변경사항이 있는 경우)

   ```bash
   git commit -m "feat(K7M2Q9RX4DAB): 기능 구현"
   ```

2. **Docs 커밋** (문서 변경사항이 있는 경우 - **Docs 레포에서 실행**)
   ```bash
   git commit -m "docs(K7M2Q9RX4DAB): 기능 구현 문서 업데이트"
   ```

> 💡 **Core Rule**: 태스크 완료 시점에는 **변경된 모든 레포지토리**가 커밋되어야 합니다.

---

## Docs Push 규칙

> `.lee-spec-kit.json`의 `docsRepo` 설정을 참조합니다.

| 설정                                         | 동작                              |
| -------------------------------------------- | --------------------------------- |
| `docsRepo: "embedded"`                       | 프로젝트 push 시 docs도 함께 포함 |
| `docsRepo: "standalone"` + `pushDocs: false` | docs는 커밋만, push 안 함         |
| `docsRepo: "standalone"` + `pushDocs: true`  | docs 변경 시 별도 push 진행       |

### Standalone 모드 주의사항

- `pushDocs: false`인 경우 docs 변경사항은 **로컬에만 커밋**
- `pushDocs: true`인 경우 docs 변경 후 **별도로 push** 필요
- 프로젝트 레포와 docs 레포가 분리되어 있으므로 **각각 관리**

---

## GitHub 설정 요구사항

### 필수

- [ ] GitHub CLI (`gh`) 설치 및 인증
- [ ] Branch protection rules (main)
  - Require PR before merging

### 권장

- [ ] Auto-delete head branches
- [ ] Squash merging only

## Feature 격리와 통합

새 GitHub Feature는 SDD 계획 전에 선택한 Issue 번호를 ID로 사용합니다. local ID는 12자리 무작위 값이며 기존 F번호 문서는 호환됩니다. 한 Feature는 한 담당자가 한 Task씩 진행하고, 다른 Feature끼리는 병렬로 개발할 수 있습니다.

새 standalone Feature는 초기 문서를 커밋한 뒤 `workspace prepare`가 반환한 docsDirectory에서 문서를 작성합니다. 기본 문서 체크아웃은 base 브랜치를 유지합니다. local은 코드 통합 검증 → 문서 통합 → 활성화된 경우 OpenWiki 발행 → 정리 순서를 따릅니다. 문서 통합 기록은 내용 변경 없는 Git 커밋으로 남아 문서 저장소 clone 후에도 복원됩니다. base가 앞서가면 `workspace sync-docs`로 반영하고 충돌을 재검증합니다. 중간 실패를 완료로 처리하지 않습니다.

명시적 Task ID에는 task claim/status/transition/release와 최신 해시·세션 토큰을 사용합니다. ID 없는 레거시 Task는 문서에서 상태를 변경합니다. CI에서 feature-audit를 실행하고 sharedDocumentationWarnings의 공통 문서 수정 대상을 검토합니다. PR 병합 재시도 중 자동 rebase·force-push를 하지 않습니다.
