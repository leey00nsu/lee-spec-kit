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

### 5. 브랜치 생성

```bash
git checkout -b feat/{이슈번호}-{기능명}
```

> ⚠️ **main 브랜치에서 작업하지 마세요.** Issue 생성 후 반드시 브랜치를 생성합니다.

### 6. plan.md 작성

- **plan.md**: 구현 계획 (기술 스택, 아키텍처, 데이터 모델 등)을 작성합니다.

### 7. plan.md 승인 요청

> 🚨 **plan.md 승인 필수**

작성된 plan.md를 사용자에게 공유하고 **명시적 승인(OK)**을 받습니다.

### 8. tasks.md 작성

- **tasks.md**: 승인된 plan.md를 바탕으로 작업 단위(Task)를 분해하여 작성합니다.
- 순서와 의존성을 고려하여 체크리스트 형태로 작성합니다.

### 9. 문서 커밋 전 확인

> ⚠️ **커밋 전 체크리스트**

- [ ] spec.md에 이슈번호 반영 (`- **이슈 번호**: #{이슈번호}`)
- [ ] tasks.md에 이슈번호 반영 (`- **Issue**: #{이슈번호}`)
- [ ] tasks.md에 브랜치명 반영 (`feat/{이슈번호}-{기능명}`)

### 10. 문서 커밋

> 🚨 **사용자 확인 필수**

spec/plan/tasks 최종 확인 후 **Feature 폴더 전체**를 커밋:

```bash
git add docs/features/{be|fe}/F{번호}-{기능명}/
git commit -m "docs(#{이슈번호}): F{번호} 계획 완료"
```

> 📁 **포함 파일**: spec.md, plan.md, tasks.md, decisions.md (비어있어도 포함)
> ⚠️ **Standalone 모드**: Docs 레포로 이동 후 커밋하세요.

---

## 참조 문서

- **Feature 템플릿**: `features/feature-base/`
- **Issue 생성 가이드**: `skills/create-issue.md`
