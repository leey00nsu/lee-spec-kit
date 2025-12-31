# GitHub Issue 템플릿 가이드

에이전트가 GitHub Issue를 생성할 때 참조하는 템플릿입니다.

---

## 이슈 생성 규칙

### 제목 형식

```text
F{번호}: {기능명} ({짧은 설명})
```

예: `F001: user-auth (사용자 인증 기능)`

> "짧은 설명"은 한 줄로 의도를 전달할 수 있을 정도로만 작성합니다.

---

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
| `priority:high` | 높은 우선순위 |
