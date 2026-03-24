# GitHub Issue 생성 프로세스

GitHub Issue를 생성할 때 따르는 가이드입니다.
실행 상태 SSOT는 Feature 폴더의 `issue.md`입니다.

---

## 사전 조건

- [ ] `spec.md` 작성 완료
- [ ] 사용자 승인 완료

---

## 단계

### 1. `issue.md` 초안 준비

> 📖 **이번 세션에 아직 읽지 않았다면 `docs get`으로 절차/템플릿을 읽고, 이미 읽은 동일 문서는 재호출하지 않은 채 초안을 생성해 기준으로 사용하세요.**

```bash
# 1) 절차/템플릿 정책 확인 (이번 세션 미확인 문서만)
npx lee-spec-kit docs get create-issue --json
npx lee-spec-kit docs get issue-doc --json

# 2) 초안 본문 생성 (원격 작업 아님)
npx lee-spec-kit github issue F001 --json
```

`docs get issue-doc --json` 출력은 문서 구조 정책으로 보고,
`github issue --json`의 `body`를 참고해 `issue.md` 초안을 보완하세요.
실제 진행 상태는 `issue.md`의 `상태(Draft | Ready)`를 사용합니다.

| 항목   | 형식                                     |
| ------ | ---------------------------------------- |
| 제목   | `{기능명} ({짧은 설명})`                 |
| 본문   | 개요, 목표, 완료 조건, 관련 문서         |
| 라벨   | `enhancement`, `bug`, `documentation` 등 |
| 담당자 | `@me` (기본값)                           |

### 2. 사용자 확인 요청 + `Ready` 전환

> 🚨 **사용자 확인 필수**

`issue.md` 초안 기준으로 다음 내용을 공유하고 라벨 승인(`A` 또는 `A OK`) 대기:

- 제목
- 본문 전체 초안 (`issue.md` 기준)
- 라벨

승인 후 `issue.md` 상태를 `Ready`로 변경하세요.

### 3. 이슈 생성 (`issue.md`가 `Ready`일 때)

원격 이슈 생성은 반드시 lee-spec-kit helper로만 실행합니다.
`gh issue create`를 직접 호출하거나 raw `issue.md`를 그대로 `--body-file`에 넘기지 마세요.

```bash
npx lee-spec-kit github issue F001 --create --confirm OK --labels enhancement
```

생성 후:
- 생성된 이슈 번호를 `tasks.md`에 기록
- `issue.md` 상태는 `Ready`로 유지 (생성 상태는 `tasks.md`에서 관리)

---

## 참조 문서

- **초안 생성기**: `npx lee-spec-kit github issue <feature-name>`
- **원격 생성 규칙**: 반드시 `npx lee-spec-kit github issue <feature-name> --create --confirm OK --labels ...` 사용
- **승인 규칙**: 제목/본문/라벨 공유 후 `--create --confirm OK` 실행
- **실행 상태 SSOT**: `docs/features/.../<feature>/issue.md`
