# 새 기능 추가 프로세스

새 기능(Feature)을 추가할 때 따르는 단계별 가이드입니다.

---

## 단계

### 1. Feature 폴더 생성

```bash
npx lee-spec-kit feature <name> -d "<설명>"
```

- `<name>`: 기능 이름 (영문, 하이픈 사용)
- `-d`: 기능 설명 (spec.md에 자동 반영)

**예시:**

```bash
npx lee-spec-kit feature user-auth -d "사용자 인증 및 세션 관리"
```

### 2. spec.md 작성

- **무엇을**: 기능이 무엇인지 명확히 기술
- **왜**: 이 기능이 필요한 이유
- ❌ 기술 스택은 작성하지 않음 (plan.md에서 다룸)

### 3. 사용자 확인 요청

> 🚨 **사용자 확인 필수**

spec.md 전문을 사용자에게 공유하고 **명시적 승인(OK)** 대기

### 4. GitHub Issue 생성

→ `skills/create-issue.md` 참조

---

## 참조 문서

- **Feature 템플릿**: `features/feature-base/`
- **Issue 생성 가이드**: `skills/create-issue.md`
