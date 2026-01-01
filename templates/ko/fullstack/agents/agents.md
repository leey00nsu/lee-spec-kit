# Agents Guide

코드 어시스턴트/에이전트가 일관된 코드 생성·리팩토링을 수행하도록 돕는 운영 규칙입니다.

---

## 참조 문서

### 핵심 문서

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
│   └── pr-template.md
├── prd/                # 제품 요구사항
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

### 1. 새 기능 추가 요청

1. 대상 레포 확인 (BE 또는 FE)
2. 새 기능 폴더 생성: `npx lee-spec-kit feature <name>` 또는 `docs/features/README.md` 참조
3. `spec.md` 작성 - 무엇을, 왜 만드는지 (기술 스택 X)
4. 사용자에게 스펙 초안 확인 요청
5. GitHub Issue 생성 (`agents/issue-template.md` 참조)

### 2. 기능 스펙 → 계획 수립

1. 스펙이 명확한지 확인
2. `plan.md` 작성 - 기술 스택, 아키텍처, 파일 구조
3. **`decisions.md`에 주요 기술 결정 기록** (필수)
4. 사용자 승인 후 태스크 분해

### 3. 태스크 실행 및 관리

1. `tasks.md`에 태스크 작성 (Acceptance/Checklist 필수)
2. 사용자 승인 후 실행
3. **진행 전/후 상태 확인 및 즉시 전환**: `[TODO]` → `[DOING]` → `[DONE]`
4. 상태 전환 시 날짜 기록 (YYYY-MM-DD)
5. 태스크를 [DONE]으로 전환할 때 Checklist를 모두 체크
6. **태스크 완료 직후 상태/날짜 갱신** → 커밋 메시지 제안

### 4. 분석/검토 요청

1. 분석 리포트 작성 (현재 상태, 문제점, 제안, 영향)
2. 변경 필요시 새 기능/태스크 생성 권장

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
