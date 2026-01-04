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

### 1. Feature 시작

```bash
# 1. GitHub Issue 생성 (Feature = Issue)
# 2. 브랜치 생성
git checkout -b feat/{issue-number}-{feature-name}
```

> `gh`로 이슈/PR 생성·수정 시 작성할 제목/본문/라벨을 먼저 공유하고 **반드시** 사용자 확인(OK) 후 진행합니다.

### 2. 문서 커밋 (docs 레포)

> 📌 docs 폴더는 별도 git으로 관리되므로 프로젝트와 분리된 커밋 전략을 사용합니다.

| #   | 커밋 시점                                  | 포함 문서                     | 커밋 메시지 예시                     |
| --- | ------------------------------------------ | ----------------------------- | ------------------------------------ |
| 1   | **계획 완료 시** (spec+plan+tasks 승인 후) | spec.md, plan.md, tasks.md    | `docs(#123): spec, plan, tasks 작성` |
| 2   | **Feature 완료 시** (모든 태스크 완료 후)  | tasks.md (상태), decisions.md | `docs(#123): Feature 완료`           |

> ⚠️ **Feature 폴더 생성 시점**에는 커밋하지 않습니다.

### 3. 태스크 완료 시 자동 커밋

태스크 하나가 완료되면:

```bash
git add .
git commit -m "{type}(#{issue}): {task-description}"
```

> `git commit` 실행 전 커밋 메시지와 포함될 파일 목록을 먼저 공유하고 **반드시** 사용자 확인(OK) 후 진행합니다.

### 4. Feature 완료 시 PR 생성

모든 태스크 완료 시:

```bash
git push origin feat/{issue-number}-{feature-name}
gh pr create --title "feat(#{issue}): {feature-title}" \
  --body "Closes #{issue}" \
  --base main
```

### 5. 머지

모든 리뷰 해결 시:

```bash
# 머지 전 main 최신화
git checkout main
git pull

# Squash and Merge
gh pr merge --squash --delete-branch

# 머지 후 main 최신화
git pull
```

---

## 에이전트 자동화 규칙

### 태스크 완료 시

```
1. 코드 변경 완료
2. tasks.md 상태 [DOING] → [DONE] 업데이트 (docs)
3. git add .
4. git commit -m "{type}(#{issue}): {description}"
5. 다음 태스크 진행
```

### Feature 완료 시

```
1. 모든 태스크 [DONE] 확인
2. git push origin {branch}
3. gh pr create
4. 리뷰 대기
5. 리뷰 코멘트 수정
6. gh pr merge --squash
```

---

## GitHub 설정 요구사항

### 필수

- [ ] GitHub CLI (`gh`) 설치 및 인증
- [ ] Branch protection rules (main)
  - Require PR before merging

### 권장

- [ ] Auto-delete head branches
- [ ] Squash merging only
