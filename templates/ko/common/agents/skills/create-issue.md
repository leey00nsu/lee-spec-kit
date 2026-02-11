# GitHub Issue 생성 프로세스

GitHub Issue를 생성할 때 따르는 가이드입니다.

---

## 사전 조건

- [ ] `spec.md` 작성 완료
- [ ] 사용자 승인 완료

---

## 단계

### 1. 이슈 초안 작성

> 📖 **먼저 `docs get`으로 절차/템플릿을 읽고, 초안을 생성해 기준으로 사용하세요.**

```bash
# 1) 절차/템플릿 정책 확인
npx lee-spec-kit docs get create-issue --json
npx lee-spec-kit docs get issue-template --json

# 2) 초안 본문 생성 (원격 작업 아님)
npx lee-spec-kit github issue F001 --json
```

`docs get issue-template --json` 출력은 섹션 정책으로 보고,
`github issue --json`의 `body`를 우선 본문 초안으로 사용하세요.
필요하면 `bodyFile` 경로 파일을 함께 참고하세요.

| 항목   | 형식                                     |
| ------ | ---------------------------------------- |
| 제목   | `{기능명} ({짧은 설명})`                 |
| 본문   | 개요, 목표, 완료 조건, 관련 문서         |
| 라벨   | `enhancement`, `bug`, `documentation` 등 |
| 담당자 | `@me` (기본값)                           |

### 2. 사용자 확인 요청

> 🚨 **사용자 확인 필수**

이슈 생성 전 다음 내용을 공유하고 명시적 승인(OK) 대기:

- 제목
- 본문 전체 초안 (`body` 기준)
- 라벨

생성 전 목표/완료 기준을 spec 기준으로 구체화하고 검토하세요.

### 3. 이슈 생성

```bash
gh issue create \
  --title "{기능명} ({짧은 설명})" \
  --body-file /tmp/issue-body.md \
  --assignee @me \
  --label enhancement

# 또는 lee-spec-kit helper 사용 (명시적 승인 필요)
npx lee-spec-kit github issue F001 --create --confirm OK --labels enhancement
```

---

## 참조 문서

- **초안 생성기**: `npx lee-spec-kit github issue <feature-name>`
- **승인 규칙**: 제목/본문/라벨 공유 후 `--create --confirm OK` 실행
