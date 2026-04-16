# 기능 구현 프로세스: Docs-first

이 가이드는 Codex-native lee-spec-kit 경로에서 feature를 시작하거나 이어갈 때 따르는 기준입니다.

---

## 시작

1. `npx lee-spec-kit detect --json`를 실행합니다.
2. 감지되면 `npx lee-spec-kit docs get agents --json`과 아직 읽지 않은 후속 문서를 확인합니다.
3. 아직 feature 폴더가 없다면:
   - 사용자가 실제로 `I001`, `I001-slug`, `docs/ideas/...` 같은 explicit Idea ref를 말한 경우에만 그 ref를 유지합니다
   - 그럴 때만 `npx lee-spec-kit feature <name> --idea <ref>`를 사용합니다
   - 그 외에는 `npx lee-spec-kit feature <name> -d "<설명>"`으로 생성합니다
4. 활성 feature를 정하고 `spec.md`, `plan.md`, `tasks.md`, `decisions.md`를 읽습니다.
5. 다음 workflow 액션을 시작하기 전에 `npx lee-spec-kit workflow-stage <feature-ref> --json`를 실행합니다.

## 작업 규칙

- 문서가 SSOT입니다. 활성 feature 문서를 직접 따라갑니다.
- 문서 단계는 직접 따라갑니다:
  - `spec.md`는 범위와 리뷰 상태를 정의합니다
  - `plan.md`는 구현 접근을 정의합니다
  - `tasks.md`는 실제 실행 순서를 정의합니다
  - `issue.md`, `pr.md`는 GitHub 단계에 들어가면 stage gate의 일부로 사용합니다
- `tasks.md`가 있다고 바로 구현하지 않습니다. 구현은 `workflow-stage --json`가 허용할 때만 시작합니다.
- 범위나 동작이 바뀌면 같은 턴 안에서 활성 feature 문서를 같이 업데이트합니다.
- 사용자 승인은 문서화된 review checkpoint와 원격/파괴적 작업 전에만 요청합니다.
- docs 경로 검사가 중요하면 `git commit` 전에 `npx lee-spec-kit commit-audit --json`를 사용합니다.
- 코드나 feature 문서를 바꿨다면 종료 전에 `npx lee-spec-kit workflow-audit --json`로 동기화 상태를 확인합니다.

## 절대 규칙

1. 이슈/PR 번호나 상태를 임의로 만들지 않습니다.
2. 범위, 동작, evidence가 바뀌었는데 필요한 문서 업데이트를 건너뛰지 않습니다.
3. unmanaged docs 산출물은 feature 폴더로 정규화하거나 allowlist하기 전까지 active workflow SSOT로 취급하지 않습니다.
