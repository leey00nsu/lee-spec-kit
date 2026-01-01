# GitHub PR 템플릿 가이드

에이전트가 Pull Request를 생성할 때 참조하는 템플릿입니다.

---

## PR 생성 규칙

### 제목 형식

```text
feat(#{이슈번호}): {기능명}
```

Example: `feat(#1): Implement user authentication`

### Link Format (Important!)

For file links within the repo in PR body, **always use current branch name**:

```markdown
[filename](https://github.com/{owner}/{repo}/blob/{branch-name}/docs/path/to/file.md)
```

> ⚠️ `main` branch links will return 404 until merged!
> Always use the **current feature branch name** (e.g., `feat/5-feature-name`).

## PR 본문 템플릿

```markdown
## 개요

{변경 사항에 대한 간략한 설명}

## 변경 사항

- {변경 1}
- {변경 2}
- {변경 3}

## 테스트

- [ ] 유닛 테스트 통과
- [ ] 통합 테스트 완료

## 스크린샷 (UI 변경 시)

{있으면 첨부}

## 관련 문서

- Spec: `docs/features/{be|fe}/F{번호}-{기능명}/spec.md`
- Tasks: `docs/features/{be|fe}/F{번호}-{기능명}/tasks.md`

Closes #{이슈번호}
```

---

## PR 생성 명령어

```bash
# 현재 브랜치명 확인
BRANCH=$(git branch --show-current)

gh pr create \
  --title "feat(#{issue}): {기능명}" \
  --body-file /tmp/pr-body.md \
  --base main
```

---

## 머지 규칙

| 상황         | 머지 방식         |
| ------------ | ----------------- |
| 일반 Feature | Squash and Merge  |
| 긴급 Hotfix  | Merge 또는 Rebase |
| Docs update  | Squash and Merge  |

---

## Body Input Rules (Shell Execution Prevention)

- PR body should use **`--body-file` by default**.
- If the body contains backticks (`) or `$()`and is placed directly in`"..."`, it may be **interpreted by the shell**.
- For multi-line bodies, use **single-quoted heredoc** like `cat <<'EOF'`,
  and handle variables via **placeholder → sed substitution**.
