# Git 워크플로우 가이드

에이전트가 Git/GitHub 작업을 자동화하기 위한 규칙입니다.

---

## 핵심 개념

| 개념      | GitHub 매핑  | 설명                    |
| --------- | ------------ | ----------------------- |
| Feature   | GitHub Issue | 기능 단위 작업          |
| 태스크    | Commit       | 개별 구현 단위          |
| 기능 완료 | Pull Request | Feature 완료 시 PR 생성 |

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

```
{type}(#{issue}): {description}
```

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

> 📖 단계별 상세 가이드는 CLI 내장 가이드를 참조하세요.

| 워크플로우   | 가이드                          |
| ------------ | ------------------------------- |
| Feature 시작 | CLI 내장 `create-feature`       |
| Issue 생성   | CLI 내장 `create-issue`         |
| 태스크 실행  | CLI 내장 `execute-task`         |
| PR 생성      | CLI 내장 `create-pr`            |

### 브랜치 생성

```bash
git checkout -b feat/{issue-number}-{feature-name}
```

### 문서 커밋 규칙 (Continuous Sync)

> 🔄 **Project 코드 변경 시 Docs 동기화는 필수입니다.**

| 상황                    | 규칙                                                     |
| ----------------------- | -------------------------------------------------------- |
| **Project + Docs 변경** | 프로젝트 커밋 시 Docs도 **반드시 함께 커밋** (Sync 유지) |
| **Docs만 변경**         | `custom.md` 수정 등 문서만 변경된 경우 **Docs만 커밋**   |

#### Standalone 모드 커밋 가이드

1. **Project 커밋** (코드 변경사항이 있는 경우)

   ```bash
   git commit -m "feat(#123): 기능 구현"
   ```

2. **Docs 커밋** (문서 변경사항이 있는 경우 - **Docs 레포에서 실행**)
   ```bash
   git commit -m "docs(#123): 기능 구현 문서 업데이트"
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
