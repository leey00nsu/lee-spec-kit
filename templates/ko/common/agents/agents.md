# Agents Guide

코드 어시스턴트/에이전트가 일관된 코드 생성·리팩토링을 수행하도록 돕는 운영 규칙입니다.

---

## 🚨 사용자 확인 필수 규칙 (MUST)

> ⚠️ **아래 작업은 반드시 사용자의 명시적 승인(OK)을 받은 후에만 진행합니다.**
> **확인 없이 진행 시 작업을 즉시 중단해야 합니다.**
> ✅ 승인 응답은 **`<라벨>` 또는 `<라벨> OK` 형식**(예: `A`, `A OK`)을 의미합니다.

| 작업          | 확인 시점            | 공유 내용                   |
| ------------- | -------------------- | --------------------------- |
| 스펙 작성     | `spec.md` 작성 후    | 스펙 내용 전문              |
| 태스크 실행   | 각 태스크 시작 전    | 태스크 제목                 |
| 커밋 생성     | `git commit` 전      | 커밋 메시지, 포함 파일 목록 |
| 이슈 생성     | `gh issue create` 전 | 제목, 본문, 라벨            |
| PR 생성       | `gh pr create` 전    | 제목, 본문, 라벨            |
| Assignee 변경 | 본인 외 지정 시      | 대상 사용자명               |
| Git 원격 작업 | `push`, `merge` 전 (머지 커밋 포함) | 브랜치, 변경 사항           |

### 확인 프로세스

1. 작업 내용을 사용자에게 **먼저 공유**
2. 사용자의 **명시적 승인(OK)** 대기
3. 승인 후에만 실행

> 🚫 **금지 사항**: 사용자 응답 없이 임의로 진행하는 것

---

## 🧾 라벨 응답 계약 (SSOT)

> lee-spec-kit 프로젝트에서 사용자에게 보내는 응답 포맷의 단일 기준입니다.

- 사용자에게 보내는 **모든 응답의 마지막**에는 반드시 현재 상태와 선택 가능한 라벨을 다시 표시합니다.
- 내용은 최신 `npx lee-spec-kit context --json`(또는 `flow --json`) 결과를 기준으로 작성합니다.
- 라벨 설명은 `actionOptions[].detail` 또는 command `cmd`를 **원문 그대로** 사용합니다. (요약/의역 금지)
- 사용자가 다른 질문을 하더라도 실행 가능한 라벨이 있으면 응답 마지막에 동일한 형식으로 다시 노출합니다.
- 실행 가능한 라벨이 없으면 `선택 가능: 없음`을 명시하고, 다음 확인 명령(`npx lee-spec-kit context`)을 안내합니다.
- 사용자의 입력에 유효 라벨이 없으면 임의 실행하지 말고, 라벨 선택을 다시 요청합니다.

출력 형식:

```text
현재 상태: <reasonCode 또는 상태 요약>
선택 가능:
A: <detail>
B: <detail>
응답 형식: "<LABEL>" 또는 "<LABEL> OK"
```

---

## 참조 문서

### 핵심 문서

> 🚨 **반드시 핵심 문서를 모두 읽고 이해한 후에만 작업을 진행합니다.**

> ⚠️ **`custom.md`의 규칙은 다른 모든 규칙보다 우선합니다.**

- **🔴 커스텀 규칙 (최우선)**: `/docs/agents/custom.md`
- **프로젝트 원칙**: `/docs/agents/constitution.md`
- **에이전트 루트 가이드**: `npx lee-spec-kit docs get agents --json`
- **Git 워크플로우**: `npx lee-spec-kit docs get git-workflow --json`
- **이슈 절차/템플릿**: `npx lee-spec-kit docs get create-issue --json` → `npx lee-spec-kit docs get issue-template --json`
- **PR 절차/템플릿**: `npx lee-spec-kit docs get create-pr --json` → `npx lee-spec-kit docs get pr-template --json`

### PRD

- **제품 요구사항**: `/docs/prd/`

### Feature (기능별 문서)

- **single**: `/docs/features/{feature-id}/`
- **multi**: `/docs/features/{component}/{feature-id}/`
- **템플릿 (SSOT)**: `npx lee-spec-kit feature <name>`로 생성된 문서 구조

---

## 📁 docs 표준 구조

```text
docs/
├── README.md
├── agents/
│   ├── custom.md
│   └── constitution.md
├── prd/
├── designs/
├── ideas/
├── features/
│   ├── (single) F00X-{name}/
│   └── (multi)  {component}/F00X-{name}/
└── scripts/
```

---

## 언어/코드 규칙

- 답변: 한국어
- 코드/파일명: 영어
- 주석/커밋메시지: 한국어
- **날짜/시간: 사용자 PC의 시스템 시간 사용**

---

## 요청 유형별 프로세스

> 📖 각 프로세스의 상세 가이드는 `docs get` 명령으로 먼저 조회하세요.

| 프로세스          | 가이드                            |
| ----------------- | --------------------------------- |
| 새 기능 추가      | `npx lee-spec-kit docs get create-feature --json` |
| GitHub Issue 생성 | `npx lee-spec-kit docs get create-issue --json`   |
| Pull Request 생성 | `npx lee-spec-kit docs get create-pr --json`      |
| 태스크 실행       | `npx lee-spec-kit docs get execute-task --json`   |

---

## 📋 ADR (Architecture Decision Records) 규칙

> `decisions.md`는 기술 결정과 그 이유를 기록하는 **필수** 문서입니다.

### 기록 형식

```markdown
## D{번호}: {결정 제목} ({YYYY-MM-DD})

- **Context**: 문제 상황 또는 배경
- **Options**: 고려한 대안들
- **Decision**: 최종 선택
- **Rationale**: 선택 이유
```
