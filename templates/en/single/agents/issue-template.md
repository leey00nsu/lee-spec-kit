# GitHub Issue 템플릿 가이드

에이전트가 GitHub Issue를 생성할 때 참조하는 템플릿입니다.

---

## 이슈 생성 규칙

### 제목 형식

```text
F{번호}: {기능명} ({짧은 설명})
```

예: `F001: user-auth (사용자 인증 기능)`

> Keep the "short description" concise enough to convey the intent in one line.

### Link Format (Important!)

In GitHub Issues, use different link formats **based on file location**:

1. **Files within project repo**: Use full URL (clickable)
   - **Merged documents/code**: Use `main` branch
     ```markdown
     [filename](https://github.com/{owner}/{repo}/blob/main/path/to/file)
     ```
   - **In-progress documents** (not merged yet): Use **Feature branch**
     ```markdown
     [filename](https://github.com/{owner}/{repo}/blob/{feat-branch}/path/to/file)
     ```

2. **External documents (with public URL)**: Use **absolute URL**

   ```markdown
   [react-i18next](https://react.i18next.com/)
   ```

3. **External/local documents** (no URL available): Use **relative path as text only**
   ```text
   ../docs/features/F001-feature-name/spec.md
   ```

> ⚠️ Local documents are not clickable on GitHub, so provide path text only.

## 이슈 본문 템플릿

```markdown
## 개요

{기능에 대한 간략한 설명}

## 목표

- {목표 1}
- {목표 2}

## 완료 조건

- [ ] {조건 1}
- [ ] {조건 2}

## 관련 문서

- Spec: `docs/features/{be|fe}/F{번호}-{기능명}/spec.md`

## 라벨

- `enhancement` (새 기능)
- `bug` (버그 수정)
- `documentation` (문서)
```

---

## 라벨 규칙

| 라벨            | 용도          |
| --------------- | ------------- |
| `enhancement`   | 새 기능       |
| `bug`           | 버그 수정     |
| `documentation` | 문서 작업     |
| `backend`       | BE 관련       |
| `frontend`      | FE 관련       |
| `priority:high` | High priority |

---

## Body Input Rules (Shell Execution Prevention)

- Issue body should use **`--body-file` by default**.
- If the body contains backticks (`) or `$()`and is placed directly in`"..."`, it may be **interpreted by the shell**.
- For multi-line bodies, use **single-quoted heredoc** like `cat <<'EOF'`,
  and handle variables via **placeholder → sed substitution**.
