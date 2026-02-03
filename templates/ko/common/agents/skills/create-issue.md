# GitHub Issue 생성 프로세스

GitHub Issue를 생성할 때 따르는 가이드입니다.

---

## 사전 조건

- [ ] `spec.md` 작성 완료
- [ ] 사용자 승인 완료

---

## 단계

### 1. 이슈 내용 작성

> 📖 **`issue-template.md`를 반드시 참조하세요.**

| 항목   | 형식                                     |
| ------ | ---------------------------------------- |
| 제목   | `{기능명} ({짧은 설명})`                 |
| 본문   | 개요, 목표, 완료 조건, 관련 문서         |
| 라벨   | `enhancement`, `bug`, `documentation` 등 |
| 담당자 | `@me` (기본값)                           |

### 2. 사용자 확인 요청

> 🚨 **사용자 확인 필수**

이슈 생성 전 다음 내용을 공유하고 승인 대기:

- 제목
- 본문
- 라벨

### 3. 이슈 생성

```bash
gh issue create \
  --title "{기능명} ({짧은 설명})" \
  --body-file /tmp/issue-body.md \
  --assignee @me \
  --label enhancement
```

---

## 참조 문서

- **이슈 템플릿**: `issue-template.md`
- **링크 형식 규칙**: `issue-template.md` > "링크 형식" 섹션
