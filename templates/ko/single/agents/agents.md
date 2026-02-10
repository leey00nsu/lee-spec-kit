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

- **기능 문서**: `/docs/features/{feature-id}/`
- **템플릿 (SSOT)**: `npx lee-spec-kit feature <name>`로 생성된 문서 구조

---

## 📁 docs 표준 구조

```
docs/
├── README.md           # 문서 안내
├── agents/             # 에이전트 운영 규칙
│   ├── custom.md       # 프로젝트별 커스텀 규칙
│   └── constitution.md # 프로젝트 원칙
│
│   # 엔진 종속 가이드는 프로젝트 docs에 동기화되지 않습니다.
│   # - 조회: npx lee-spec-kit docs list --json
│   # - 예시: npx lee-spec-kit docs get git-workflow --json
├── prd/                # 제품 요구사항
├── designs/            # 디자인 참고 자료
├── ideas/              # 아이디어/To-do (Feature 승격 전)
├── features/           # 기능별 문서
│   └── F00X-{name}/    # 개별 기능
└── scripts/            # 유틸리티
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
