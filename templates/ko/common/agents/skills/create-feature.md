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

## Spec 결정 확인

결정 확인은 `stage: spec` 안에서 진행합니다. 질문이 남아 있거나 완료 기록이 유효하지 않으면 `nextAction.category: spec_clarify`를 따릅니다. 새 승인 category나 승인 토큰을 추가하지 않으며 기존 Spec 승인 전에 필요한 답변을 확인합니다.

1. 질문 전에 요청·현재 코드·권위 있는 문서·호환성 제약·기존 답변을 조사합니다. 조사로 알 수 있는 사실과 제품 동작·범위·인수 조건·호환성에 영향을 주는 선택을 구분합니다. 일상적인 구현 세부사항은 조사와 판단으로 해결합니다.
2. 모든 새 Spec에 `## Spec 결정 확인` 섹션과 리터럴 필드 `- **Clarification Status**: Pending`, `- **Clarification Summary**: -`를 둡니다. 상태 값은 Pending | Complete입니다. 한국어 템플릿도 필드명과 값은 영문 그대로 유지합니다. metadata 없는 기존 승인·완료 Feature는 호환성을 유지하고, 새 범위나 동작으로 Spec을 수정할 때 이 섹션을 적용합니다.
3. 실제 질문은 `decisions.md`의 실제 `## SC-01: 제목`으로 기록합니다(`###`도 허용). SC-02부터 이어가되 D001 ADR 번호와 독립적으로 관리합니다. 첫 ADR 자리표시자 교체 시 보존되도록 결정 확인 섹션과 기록은 D001 앞에 둡니다. fenced 예시는 실제 질문이 아닙니다. 두 언어 모두 Status, Question, Options, Recommendation, Answer, Decision, Spec Refs 필드를 영문 그대로 사용합니다.
4. 현재 독립적으로 답할 수 있는 질문을 한 번에 clarificationPolicy.maxQuestionsPerRound개까지(설정 workflow.specClarification.maxQuestionsPerRound, 기본 3) 선택지·권고안·장단점과 함께 제시합니다. 결정에 필요한 답변을 기다리고 종속 질문은 다음 라운드에 묻습니다. 새 범위·동작의 중대한 변경으로 관련 선택이 달라진 경우 외에는 기존 답변을 재사용하고 반복해서 묻지 않습니다. 질문 선택지를 workflow 승인 토큰으로 제시하지 않습니다.
5. OPEN은 완료를 막습니다. 종결 상태의 Answer, Decision, Spec Refs에는 자리표시자가 아닌 실질적인 내용을 채웁니다. RESOLVED는 실제 사용자 답변과 그에 따른 결정을 기록합니다. DELEGATED는 명시적 사용자 위임을 전제로 에이전트의 선택·범위를 기록합니다. DEFERRED는 명시적 사용자 합의를 전제로 제외 범위·구체적인 후속 조치를 기록하고 Spec Refs로 해당 범위·인수 조건을 연결합니다. 침묵·기본값·시간 경과·리뷰 한도로 위임·보류·동의를 추정하지 않습니다. `workflow.agentReview.maxRounds`로 질문을 자동 완료하지 않습니다.
6. 답변과 Spec 범위·인수 조건은 같은 턴에 반영합니다. 질문 중 HTML 변경 비교 보고서는 초안으로 유지하며, 기존 Spec 승인 경계에서 제시하기 전에 결정 내용을 반영해 갱신합니다. 새 범위·동작의 중대한 변경은 관련 선택을 다시 열고 이전 답변을 이력으로 보존하며 Clarification Status를 Pending으로 되돌립니다.
7. OPEN 질문이 없고 모든 종결 기록이 유효할 때만 Complete로 바꿉니다. Clarification Summary의 자리표시자를 조사·기존 답변으로 추가 질문이 불필요한 이유 또는 결정을 Spec에 어떻게 반영했는지 설명하는 실질적인 내용으로 바꿉니다. `workflow-stage`를 다시 실행하고 기존 Spec 승인 액션이 반환되면 따릅니다.

CLI는 기록된 완료 상태와 미해결 질문을 검증합니다. 질문의 품질이나 실제 사용자 답변의 출처를 검증하거나, 결정 확인을 내용 hash에 결합하거나, 모든 제품 선택을 식별했다고 증명하지 않습니다. 사실 조사·의미 있는 질문·충실한 기록은 주 에이전트가 책임집니다.

## Spec 변경 비교 보고서

새 Spec 또는 수정한 Spec의 승인을 요청하기 전에 주 에이전트가 활성 Feature의 `spec.md` 옆 `artifacts/change-report.html`을 작성합니다. 먼저 관리 workspace를 결정하고, standalone이면 docs worktree를 사용합니다. 등록 seed에 빈 보고서를 넣는 대신 Spec 작성 단계에서 `artifacts/`를 만듭니다. 이 보고서는 Spec 검토에 필요한 산출물이며, 중복 보조 보고서를 만들지 않는 규칙의 명시적인 예외입니다.

1. As-Is를 쓰기 전에 현재 코드·문서와 확인 가능한 UI를 살펴봅니다. 소스 경로와 관찰 근거를 적고 확인할 수 없는 사항과 열린 질문을 표시합니다. 신규 기능이면 현재의 부재 또는 수동 대체 절차를 보여줍니다.
2. 문제와 목표를 짧게 설명하고 같은 시나리오의 As-Is / To-Be를 나란히 보여줍니다. 입력·실행 계기, 사용자에게 보이는 결과·출력, 의미 있는 오류·빈 상태를 포함합니다. UI 변경은 화면 스케치 또는 스크린샷 쌍, 동작 변경은 흐름 비교와 구체적인 입력·출력 예시, 혼합 변경은 둘 다 사용합니다. 화면 배치나 상호작용을 바꾸는 작업을 글로만 된 카드로 대신하지 않습니다.
3. To-Be는 구현 검증 전까지 제안으로 표시합니다. 스케치는 목업으로 구분하고 관찰 사실·가정·기대 수치를 분리합니다. 만들어낸 스크린샷·측정값·테스트 성공을 근거처럼 제시하지 않습니다. 성능 개선 작업은 지표·단위·목표를 Spec에 정하고 Plan에서 기준선·측정 절차를 구체화합니다. 구현 후에는 `decisions.md`의 `Performance Evidence`에 상세 실측을 남기고 HTML에는 같은 전후 수치와 ADR 링크를 요약합니다. 기존 Feature의 기록 형식은 `npx lee-spec-kit docs get performance-evidence --json`으로 확인합니다.
4. 비교 항목을 Spec의 US/FR/인수 조건과 연결합니다. 제외 범위, 미해결 질문, 차이를 확인할 방법을 담습니다. 요구사항과 승인 상태의 권위는 `spec.md`에 두고 보고서는 별도의 계약을 추가하지 않고 시각적으로 설명합니다.
5. 빌드·서버·CDN·외부 폰트·네트워크 요청 없이 로컬에서 열리는 HTML을 만듭니다. 필요하면 인라인 CSS·SVG와 보존한 로컬 자산의 상대경로를 사용합니다. 의미 있는 제목, 읽기 쉬운 대비, 좁은 화면에서 비교 패널이 세로로 쌓이는 반응형 레이아웃을 적용합니다. 핵심 비교를 먼저 보여주고 Spec 본문을 그대로 늘어놓지 않습니다. 브라우저를 사용할 수 있으면 화면을 확인하고 렌더링 미검증은 명시합니다. 비밀정보를 제외하고 코드·경로·사용자 문자열을 HTML에 넣을 때 이스케이프합니다.
6. `spec.md`와 `tasks.md` 또는 `decisions.md`에서 보고서에 상대경로로 연결합니다. 기존 Spec 승인 요청에 클릭 가능한 보고서 링크를 함께 제시하며 별도 보고서 승인 토큰은 만들지 않습니다. 범위나 목표 동작이 바뀌면 보고서를 갱신해 Spec과 함께 다시 검토합니다. 구현 후에는 원래 As-Is를 유지하고 실제 근거로 확인한 결과를 제안과 구분합니다. 주 에이전트가 보고서를 소유하며 구현 worker는 기존 쓰기 계약에 따라 근거를 전달합니다.

기존 승인·완료 Feature를 단순히 이어가기 위해 보고서를 소급 작성하지 않습니다. 새 범위나 동작 변경으로 Spec을 작성·수정할 때 적용합니다. UI뿐 아니라 백엔드·CLI·정책·문서 변경도 대상이며, 보고서 작성 자체가 선택적 UI/UX 디자인 시스템 정책을 활성화하지는 않습니다.

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
