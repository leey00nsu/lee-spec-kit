# lee-spec-kit

프로젝트 문서 구조 생성기 - AI 에이전트 기반 개발을 위한 docs 템플릿 CLI

[![npm version](https://img.shields.io/npm/v/lee-spec-kit.svg)](https://www.npmjs.com/package/lee-spec-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 설치

```bash
# npx로 바로 사용
npx lee-spec-kit init

# 또는 전역 설치
npm install -g lee-spec-kit
```

## 사용법

### 프로젝트 초기화

```bash
# 대화형 모드
npx lee-spec-kit init

# 옵션 지정
npx lee-spec-kit init --name my-project --type fullstack --lang ko
```

**옵션:**

| 옵션                | 설명                           | 기본값      |
| ------------------- | ------------------------------ | ----------- |
| `-n, --name <name>` | 프로젝트 이름                  | 현재 폴더명 |
| `-t, --type <type>` | `single` 또는 `fullstack`      | 대화형 선택 |
| `-l, --lang <lang>` | `ko` (한국어) 또는 `en` (영어) | `ko`        |
| `-d, --dir <dir>`   | 설치 디렉토리                  | `./docs`    |
| `-y, --yes`         | 대화형 프롬프트 스킵           | -           |

### 새 기능 생성

```bash
# Single 프로젝트
lee-spec-kit feature user-auth

# Fullstack 프로젝트
lee-spec-kit feature --repo be user-auth
lee-spec-kit feature --repo fe user-profile
```

### 상태 확인

```bash
# 터미널에 출력
lee-spec-kit status

# 파일로 저장
lee-spec-kit status --write
```

## 생성되는 구조

### Fullstack (FE/BE 분리)

```
docs/
├── README.md
├── agents/
│   ├── agents.md           # 에이전트 운영 규칙
│   ├── constitution.md     # 프로젝트 원칙
│   ├── git-workflow.md     # Git 자동화 규칙
│   ├── issue-template.md
│   └── pr-template.md
├── prd/
│   └── README.md
└── features/
    ├── README.md
    ├── feature-base/       # 공용 템플릿
    ├── be/                 # Backend Features
    └── fe/                 # Frontend Features
```

### Single (단일 레포)

```
docs/
├── README.md
├── agents/
├── prd/
└── features/
    ├── feature-base/
    └── F001-feature/       # 개별 기능
```

## 프로젝트 타입

| 타입        | 설명                                         |
| ----------- | -------------------------------------------- |
| `single`    | 단일 레포 프로젝트 (모노레포 또는 단일 스택) |
| `fullstack` | FE/BE 분리 프로젝트                          |

## Feature 워크플로우

1. `spec.md` 작성 - **무엇을, 왜** 만드는지
2. 사용자 리뷰 요청
3. `plan.md` 작성 - **어떻게** 만드는지 (기술 스택)
4. `tasks.md` 작성 - 태스크 분해
5. `decisions.md` - 기술 결정 기록 (ADR)

## 라이선스

MIT
