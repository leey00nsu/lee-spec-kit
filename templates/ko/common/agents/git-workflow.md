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

> 📖 단계별 상세 가이드는 `skills/` 폴더를 참조하세요.

| 워크플로우   | 가이드                     |
| ------------ | -------------------------- |
| Feature 시작 | `skills/create-feature.md` |
| Issue 생성   | `skills/create-issue.md`   |
| 태스크 실행  | `skills/execute-task.md`   |
| PR 생성      | `skills/create-pr.md`      |

### 브랜치 생성

```bash
git checkout -b feat/{issue-number}-{feature-name}
```

### 문서 커밋 시점 (docs 레포)

| 커밋 시점                              | 포함 문서                  | 커밋 메시지 예시                     |
| -------------------------------------- | -------------------------- | ------------------------------------ |
| 계획 완료 시 (spec+plan+tasks 승인 후) | spec.md, plan.md, tasks.md | `docs(#123): spec, plan, tasks 작성` |
| Feature 완료 시 (모든 태스크 완료 후)  | tasks.md, decisions.md     | `docs(#123): Feature 완료`           |

> ⚠️ Feature 폴더 생성 시점에는 커밋하지 않습니다.

### 머지 전략

| 상황         | 머지 방식         |
| ------------ | ----------------- |
| 일반 Feature | Squash and Merge  |
| 긴급 Hotfix  | Merge 또는 Rebase |

---

## GitHub 설정 요구사항

### 필수

- [ ] GitHub CLI (`gh`) 설치 및 인증
- [ ] Branch protection rules (main)
  - Require PR before merging

### 권장

- [ ] Auto-delete head branches
- [ ] Squash merging only
