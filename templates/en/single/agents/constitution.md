# {{projectName}} Constitution

Core principles and technical decision guidelines for the project.
All development decisions should be based on this document.

> **📌 Document Scope**
>
> - **This document**: Tech stack, architecture principles, code quality, security principles
> - **PRD**: Product requirements, business logic, user stories → `prd/*.md`

---

## 프로젝트 미션

> (프로젝트의 미션을 작성하세요)

---

## 기술 스택

### Backend

| 기술         | 버전   | 이유        |
| ------------ | ------ | ----------- |
| (예: NestJS) | (버전) | (선택 이유) |

### Frontend

| 기술        | 버전   | 이유        |
| ----------- | ------ | ----------- |
| (예: React) | (버전) | (선택 이유) |

### 공통

| 기술              | 버전   | 이유        |
| ----------------- | ------ | ----------- |
| TypeScript        | strict | 타입 안전성 |
| ESLint + Prettier | -      | 코드 품질   |
| pnpm              | -      | 패키지 관리 |

---

## 아키텍처 원칙

### 1. Feature 중심 관리

- 새 기능은 `docs/features/F00X/` 구조로 관리
- FE/BE 분리하여 **기능 단위**로 개발
- spec → plan → tasks → decisions 워크플로우

### 2. (추가 원칙)

(프로젝트별 아키텍처 원칙을 작성하세요)

---

## 코드 품질 기준

- TypeScript strict mode 필수
- ESLint + Prettier 필수
- 주요 비즈니스 로직 테스트 커버리지 **80%+**
- 컴포넌트는 **단일 책임 원칙**
- 중복 코드 최소화

---

## 보안 원칙

- 환경 변수로 시크릿 관리 (저장소 커밋 금지)
- 사용자 데이터 **최소 수집**
- CORS는 허용 오리진만 설정

---

## 언어/코드 규칙

- **답변**: 한국어
- **코드/파일명**: 영어
- **주석/커밋**: 한국어
- **날짜/시간**: 사용자 PC 시스템 시간 기준 (예: `{{date}}`)
