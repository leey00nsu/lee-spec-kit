# Features 가이드

기능별 스펙, 계획, 태스크를 관리하는 폴더입니다.
**FE/BE 레포가 분리되어 있으므로 Feature도 분리하여 관리합니다.**

---

## 폴더 구조

```
features/
├── README.md           # 이 파일
├── feature-base/       # 공용 템플릿 (수정 시 한 곳만 수정)
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   └── decisions.md
├── be/                 # Backend Features
│   └── F00X-{name}/
└── fe/                 # Frontend Features
    └── F00X-{name}/
```

---

## 새 기능 생성

### CLI 사용 (권장)

```bash
# Backend Feature
npx lee-spec-kit feature --repo be user-auth

# Frontend Feature
npx lee-spec-kit feature --repo fe user-profile
```

> 💡 CLI는 `feature-base/`에서 템플릿을 복사하고 ID를 자동 채번합니다.

---

## 기능 ID 규칙

- `F{번호}-{기능명}` (예: F001-user-auth)
- 번호는 **최소 3자리 패딩** (001, 002, ...)
- 999를 초과하면 **4자리 이상으로 확장** (F1000, F1001, ...)
- 기능명은 kebab-case
- **BE/FE 공통으로 번호는 전역 유일** (중복 사용 금지)
- **Feature = Issue**: 각 Feature는 하나의 GitHub Issue에 대응됩니다.

---

## 상태 확인

Feature 진행 상태는 CLI로 한 번에 확인합니다.

```bash
npx lee-spec-kit status
```

파일로 저장:

```bash
npx lee-spec-kit status --write
```

---

## 각 파일 역할

| 파일           | 역할                       | 작성 시점      |
| -------------- | -------------------------- | -------------- |
| `spec.md`      | **무엇을, 왜** 만드는지    | 기능 정의 시   |
| `plan.md`      | **어떻게** 만드는지 (기술) | 스펙 승인 후   |
| `tasks.md`     | 구체적인 작업 목록         | 계획 승인 후   |
| `decisions.md` | 기술 결정 기록 (ADR)       | 개발 중 수시로 |

---

## 워크플로우

### BE 작업

```
1. docs/features/be/FXXX-{name}/ 생성
2. spec.md → plan.md → tasks.md 작성
3. GitHub Issue 생성
4. 구현 → Commit → PR
```

### FE 작업

```
1. docs/features/fe/FXXX-{name}/ 생성
2. spec.md → plan.md → tasks.md 작성
3. GitHub Issue 생성
4. 구현 → Commit → PR
```
