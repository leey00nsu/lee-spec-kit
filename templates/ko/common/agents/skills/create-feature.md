# 기능 구현 프로세스: Docs-first

이 가이드는 Codex-native lee-spec-kit 경로에서 feature를 시작하거나 이어갈 때 따르는 기준입니다.

---

## 시작

1. `npx lee-spec-kit detect --json`를 실행합니다.
2. 감지되면 `npx lee-spec-kit docs get agents --json`과 아직 읽지 않은 후속 문서를 확인합니다.
3. 기존 Feature를 먼저 결정합니다. 세션에서 선택한 ID를 유지하거나 명시적인 ID·분명한 현재 브랜치를 사용하고 `spec.md`, `plan.md`, `tasks.md`, `decisions.md`를 읽습니다. `FEATURE_SELECTION_REQUIRED`는 기존 Feature를 선택하라는 뜻이며 새 생성 사유가 아닙니다.
4. 진행 중인 Feature가 있으면 문서 편집 전 `workspace_prepare` / `workspace_enter`를 따릅니다. 추가 구현·수정 요청은 `task add <feature-ref>`로 해당 Feature에 기록하고 SDD를 동기화합니다. 질문과 분석만으로 작업 항목을 만들지 않습니다. 모든 task가 DONE이어도 workflow `done` 전에는 Feature가 끝난 것이 아닙니다.
5. Feature가 없고 구현을 요청받은 경우 첫 Feature를 생성합니다. workflow `done` 이후 새로 요청한 구현도 새 Feature로 시작할 수 있습니다. 진행 중에 사용자가 별도 Feature를 명시적으로 요청하거나 제안한 분할을 선택한 경우에만 `--separate`를 사용합니다. GitHub 모드는 `feature <name> --issue <number>`로 Issue를 연결하고, 새 Issue는 제목·본문을 공유하고 승인받은 뒤 `--create-issue --desc "<요약>" --confirm OK`로 생성합니다. local 모드는 `feature <name> -d "<설명>"`으로 무작위 ID를 생성합니다. 사용자가 Idea를 명시한 경우에만 `--idea <ref>`를 추가하고 새 F번호를 배정하지 않습니다.
6. 범위·계획 변경 후를 포함해 다음 workflow 액션 전에 `npx lee-spec-kit workflow-stage <feature-ref> --json`를 실행합니다.

## 작업 규칙

- 활성 Feature SDD가 이번 변경의 권위 있는 계약입니다. 현재 실행 동작에 관한 내용은 추적된 코드와 일치시키면서 Feature 문서를 직접 따릅니다.
- 문서 단계는 직접 따라갑니다:
  - `spec.md`는 범위와 리뷰 상태를 정의합니다
  - `plan.md`는 구현 접근과 Verification Contract를 정의합니다
  - `tasks.md`는 실제 실행 순서를 정의합니다
  - `issue.md`, `pr.md`는 GitHub 단계에 들어가면 stage gate의 일부로 사용합니다
- `tasks.md`가 있다고 바로 구현하지 않습니다. 구현은 `workflow-stage --json`가 허용할 때만 시작합니다.
- Plan 검수가 활성화되어 있으면 `plan.md`를 Review로 바꾸고 반환된 fresh 읽기 전용 `plan_review`를 위임한 뒤 `reviewRound`, evidence, decision, reviewer metadata, `specHash`, `planHash`를 기록합니다. approve 검수는 현재 hash와 일치해야 하며, 한도를 소진한 `changes_requested`는 아래의 잔여 위험 자동 완료 경로를 따릅니다. reviewer는 문서를 수정하지 않고 NONE/UPDATE/ADD 결정, 요구사항 커버리지, 독립적인 Oracle, 안정적인 관찰 경계, 현실적인 실패/롤백, 제외 범위, focused/full 검증 범위를 점검합니다.
- `workflow.agentReview.maxRounds`는 fresh Plan 리뷰의 최대 실행 횟수입니다. 마지막 허용 Round가 `changes_requested`이면 지적을 한 번 반영하고 남은 finding과 그 결과의 hash 변경을 잔여 위험으로 보존한 뒤, 추가 리뷰나 사용자 리뷰 승인 토큰 없이 Plan을 자동 승격합니다. `maxRounds=1`이면 Round 2는 없습니다. `blocked`는 자동 완료하지 않습니다.
- 범위나 동작이 바뀌면 같은 턴 안에서 활성 feature 문서를 같이 업데이트합니다.
- 사용자 승인은 문서화된 review checkpoint와 원격/파괴적 작업 전에만 요청합니다.
- docs 경로 검사가 중요하면 `git commit` 전에 `npx lee-spec-kit commit-audit --json`를 사용합니다.
- 코드나 feature 문서를 바꿨다면 종료 전에 `npx lee-spec-kit workflow-audit --json`로 동기화 상태를 확인합니다.

## 절대 규칙

1. 이슈/PR 번호나 상태를 임의로 만들지 않습니다.
2. 범위, 동작, evidence가 바뀌었는데 필요한 문서 업데이트를 건너뛰지 않습니다.
3. unmanaged docs 산출물은 feature 폴더로 정규화하거나 allowlist하기 전까지 active workflow SSOT로 취급하지 않습니다.

## Single-owner collaboration

- Select the Feature by ID or an unambiguous branch; never choose by recency or numeric order.
- New Features use code worktrees. For standalone docs, commit the seed and follow `workspace prepare`; work from the returned docsDirectory. Follow returned docs integration/cleanup steps after code integration.
- Claim one owner session with `task claim`; use `task status` or workflow-stage's tasksHash and `task transition --session <token> --expected-hash <hash>`. Release the session at handoff. Never run two DOING/REVIEW tasks in one Feature.
- Run `feature-audit --enforce --json` alongside workflow-audit; use `--base-ref <fetched-base>` in CI to check immutable identity. Resolve sharedDocumentationWarnings against the latest base.
- If the base advances, sync it explicitly in the Feature worktree and reverify/review. Never automatically rebase and force-push during merge retries.
