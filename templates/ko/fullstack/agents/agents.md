# Agents Guide

코드 어시스턴트/에이전트가 일관된 코드 생성·리팩토링을 수행하도록 돕는 운영 규칙입니다.

---

## 🚨 사용자 확인 필수 규칙 (MUST)

> ⚠️ **아래 작업은 반드시 사용자의 명시적 승인(OK)을 받은 후에만 진행합니다.**
> **확인 없이 진행 시 작업을 즉시 중단해야 합니다.**

| 작업          | 확인 시점            | 공유 내용                   |
| ------------- | -------------------- | --------------------------- |
| 스펙 작성     | `spec.md` 작성 후    | 스펙 내용 전문              |
| 태스크 실행   | 각 태스크 시작 전    | 실행 계획                   |
| 커밋 생성     | `git commit` 전      | 커밋 메시지, 포함 파일 목록 |
| 이슈 생성     | `gh issue create` 전 | 제목, 본문, 라벨            |
| PR 생성       | `gh pr create` 전    | 제목, 본문, 라벨            |
| Assignee 변경 | 본인 외 지정 시      | 대상 사용자명               |
| Git 원격 작업 | `push`, `merge` 전   | 브랜치, 변경 사항           |

### 확인 프로세스

1. 작업 내용을 사용자에게 **먼저 공유**
2. 사용자의 **명시적 승인(OK)** 대기
3. 승인 후에만 실행

> 🚫 **금지 사항**: 사용자 응답 없이 임의로 진행하는 것

---

## 참조 문서

### 핵심 문서

> ⚠️ **`custom.md`의 규칙은 다른 모든 규칙보다 우선합니다.**

- **🔴 커스텀 규칙 (최우선)**: `/docs/agents/custom.md`
- **프로젝트 원칙**: `/docs/agents/constitution.md`
- **Git 워크플로우**: `/docs/agents/git-workflow.md`
- **이슈 템플릿**: `/docs/agents/issue-template.md`
- **PR 템플릿**: `/docs/agents/pr-template.md`

### PRD

- **제품 요구사항**: `/docs/prd/`

### Feature (기능별 문서)

- **BE 기능**: `/docs/features/be/{feature-id}/`
- **FE 기능**: `/docs/features/fe/{feature-id}/`
- **템플릿 (SSOT)**: `/docs/features/feature-base/` (spec, plan, tasks, decisions)

---

## 📁 docs 표준 구조

```
docs/
├── README.md           # 문서 안내
├── agents/             # 에이전트 운영 규칙
│   ├── agents.md       # 메인 규칙 (이 파일)
│   ├── constitution.md # 프로젝트 원칙
│   ├── git-workflow.md # Git 자동화
│   ├── issue-template.md
│   ├── pr-template.md
│   └── skills/         # 단계별 가이드
│       ├── create-feature.md
│       ├── create-issue.md
│       ├── create-pr.md
│       └── execute-task.md
├── prd/                # 제품 요구사항
├── designs/            # 디자인 참고 자료
├── ideas/              # 아이디어/To-do (Feature 승격 전)
├── features/           # 기능별 문서
│   ├── be/             # Backend Features
│   │   └── F00X-{name}/
│   └── fe/             # Frontend Features
│       └── F00X-{name}/
└── scripts/            # 유틸리티
```

### 규칙

- **기술 결정**: Feature의 `decisions.md`에 기록 (ADR 스타일)

---

## 언어/코드 규칙

- 답변: 한국어
- 코드/파일명: 영어
- 주석/커밋메시지: 한국어
- Issue/PR 제목·본문: 한국어
- **날짜/시간: 사용자 PC의 시스템 시간 사용** (예: `2025-12-27`)

---

## 요청 유형별 프로세스

> 📖 각 프로세스의 상세 가이드는 `skills/` 폴더를 참조하세요.

| 프로세스          | 가이드                     |
| ----------------- | -------------------------- |
| 새 기능 추가      | `skills/create-feature.md` |
| GitHub Issue 생성 | `skills/create-issue.md`   |
| Pull Request 생성 | `skills/create-pr.md`      |
| 태스크 실행       | `skills/execute-task.md`   |

### 추가 규칙 (Fullstack)

- **대상 레포 확인**: 기능 생성 전 BE 또는 FE 레포 확인
- **plan.md 작성**: 스펙 승인 후 기술 스택, 아키텍처 결정
- **decisions.md 기록**: 주요 기술 결정 필수 기록

---

## 📋 ADR (Architecture Decision Records) 규칙

> `decisions.md`는 기술 결정과 그 이유를 기록하는 **필수** 문서입니다.

### 언제 기록하는가?

1. **기술/라이브러리 선택 시** (예: Prisma vs TypeORM)
2. **아키텍처 결정 시** (예: 단일 테이블 + JSON vs 정규화)
3. **설계 트레이드오프 시** (예: 성능 vs 가독성)
4. **코드 리뷰 피드백 반영 시**
5. **문제 해결 시** (예: 에러 핸들링 방식 변경)

### 기록 형식

```markdown
## D{번호}: {결정 제목} ({YYYY-MM-DD})

- **Context**: 문제 상황 또는 배경
- **Options**: 고려한 대안들
- **Decision**: 최종 선택
- **Rationale**: 선택 이유
- **Consequences**: 결과 및 영향 (선택사항)
```

### 에이전트 행동 규칙

- 태스크 진행 중 **기술 결정이 발생하면 즉시 `decisions.md`에 기록**
- 코드 리뷰 피드백으로 **접근 방식이 변경되면 새 결정으로 추가**
- **암묵적인 결정도 명시적으로 기록**
