# Agents Guide

코드 어시스턴트/에이전트 운영 규칙입니다.
이 문서는 커스텀 런타임이 아니라 워크플로우 정책만 정의합니다.

---

## Codex lifecycle 범위

- <!-- lee-spec-kit:delegation-context-v1 -->
- 감지, built-in 문서 부트스트랩, 활성 Feature 결정, `workflow-stage`는 메인 에이전트의 책임입니다.
- Codex `SubagentStart`가 식별한 위임 서브에이전트는 메인 에이전트 부트스트랩과 `workflow-stage`를 생략합니다. 메인 에이전트가 전달한 정확한 `delegationContext`와 `workerContract`를 따르고, `requiredDocuments`를 읽으며, `referenceDocuments`는 명시된 조건에서만 사용하고, 범위가 부족하면 확장 전에 메인 에이전트에 요청합니다.

## 감지 게이트

- 항상 먼저 `npx lee-spec-kit detect --json`를 실행합니다.
- `status === "ok"` 이고 `isLeeSpecKitProject === true`일 때만 lee-spec-kit 규칙을 적용합니다.
- 감지 실패 또는 false면 lee-spec-kit 전용 규칙을 건너뛰고 일반 워크플로우로 진행합니다.

## 기본 실행 경로

- 기본 실행은 workspace-scoped `AGENTS.md`와 Codex 공식 hooks를 우선 사용합니다.
- 사용자가 "규칙에 따라 다음 feature를 진행해라"처럼 일반적으로 말해도 이 워크플로우로 자동 해석합니다.
- fresh 환경에서 최초 `npx lee-spec-kit ...` 호출은 병렬 실행하지 말고, npx cache 설치 경합을 피하도록 첫 명령 하나가 끝난 뒤 이어서 실행합니다.

## 문서가 SSOT

- 아래 시작 및 orchestration 규칙은 명시적인 위임 계약이 없는 한 메인 에이전트에 적용합니다.
- 메인 에이전트 세션 시작 시점이나 context 리셋 직후 `npx lee-spec-kit docs get agents --json`를 1회 읽습니다.
- 응답의 `requiredDocs[*].command` 중 아직 읽지 않은 문서를 모두 확인합니다.
- 활성 feature를 정한 뒤에는 해당 feature 폴더를 작업 SSOT로 사용합니다.
- 최소 기준 문서는 `spec.md`, `plan.md`, `tasks.md`, `decisions.md`입니다.
- GitHub 워크플로우가 얽히면 `issue.md`, `pr.md`도 함께 봅니다.
- 활성 feature 문서를 읽은 뒤에는 `npx lee-spec-kit workflow-stage <featureRef> --json`를 실행하고, 그 `nextAction`만 따릅니다.
- `workflow-stage --json`가 payload 최상위 `primaryActionLabel`과 `actionOptions`를 같이 반환하면(`nextAction` 안에도 동일하게 미러링됨), `primaryActionLabel`은 기본 옵션 라벨로 보고 사용자에게는 `actionOptions[*].reply` 값을 그대로 보여줍니다.

## 문서 라우팅

| 내용                                         | SSOT 위치                     |
| -------------------------------------------- | ----------------------------- |
| 제품 요구사항·사용자 스토리·제품 로드맵      | `docs/prd/`                   |
| 여러 Feature가 공유하는 시스템 아키텍처 개요 | `docs/prd/*-overview.md`      |
| 변경하기 어려운 아키텍처 원칙                | `docs/agents/constitution.md` |
| Feature 전 기술 조사·후보 비교               | 해당 `docs/ideas/I###-*.md`   |
| 활성 Feature 구현 설계                       | 해당 Feature의 `plan.md`      |
| 기술 선택·대안·트레이드오프                  | 해당 Feature의 `decisions.md` |
| 화면·Figma·디자인 시스템·UI 플로우           | `docs/designs/`               |

- `docs/designs/`를 시스템 아키텍처, 데이터/API 설계, 기술 조사, 구현 계획의 목적지로 사용하지 않습니다.
- 세부 설명은 `docs/README.md`의 문서 라우팅 규칙을 따릅니다.

## README 보호와 Feature 보조 산출물

- 기존 README(루트·하위 디렉터리·다국어 포함)는 사용자가 README 수정을 명시적으로 요청한 경우에만 요청 범위에서 수정합니다. 일반적인 기능 구현·문서 동기화 요청이나 에이전트가 작성한 Plan은 README 수정 허가가 아닙니다. 읽기와 참조는 허용합니다.
- README 수정 요청이 있어도 관련 기존 설명을 갱신하며, 기능별 구현 내역·검증 로그·버전별 변경 설명을 끝에 계속 덧붙이지 않습니다.
- README 보호는 문서 동기화와 Curated Documentation Impact 규칙보다 우선합니다. 수정 요청 없이 발견한 README 불일치는 `decisions.md`에 경로·근거·보류 사유를 기록합니다. 다른 문서 영향은 별도로 판정합니다. 해당 영역에 보류된 README 영향만 있으면 이번 작업에서 수정하지 않는다는 `NONE`과 해당 기록 참조를 사용하며, 불일치가 없거나 해결됐다고 주장하지 않습니다. 이 경우에만 별도 후속 task/Feature/issue 생성이나 README 수정 승인을 완료 조건으로 요구하지 않습니다. 리뷰도 README 미수정 자체를 차단 사유로 삼지 않습니다.
- 보존할 Feature 보조 산출물(설명용 다이어그램·검증 보고서·스크린샷)은 활성 Feature의 `spec.md`, `plan.md`, `tasks.md`, `decisions.md`와 같은 디렉터리 아래 `artifacts/`에 저장합니다. 필요할 때만 폴더를 만들고 `tasks.md` 또는 `decisions.md`에서 상대경로로 연결합니다. 기존 문서로 충분한 내용을 별도 보고서로 중복 생성하지 않습니다.
- 활성 Feature 문서의 실제 경로를 사용합니다. standalone에서는 해당 docs worktree 안의 Feature 경로이며, 현재 작업 디렉터리나 최근 Feature로 추측하지 않습니다. 구현 worker는 docs 쓰기 금지 계약을 유지하고 필요한 산출물을 메인 에이전트에 전달하여 저장하도록 합니다.
- 사용자 지정 경로와 도구가 요구하는 출력 경로를 우선합니다. 제품 코드·제품 자산은 프로젝트 경로, 빌드·캐시·일회성 디버깅 파일은 기존 출력 경로나 임시 디렉터리, 공유 정식 문서는 기존 문서 정책을 따릅니다. OpenWiki 게시물·receipt는 기존 Knowledge 저장 규칙을 유지합니다. 활성 Feature가 없으면 임의 Feature를 만들거나 선택하지 말고 기존 문서 또는 임시 경로를 사용합니다.
- 기본 위치 대신 루트나 임의의 `reports/`, `screenshots/`, `artifacts/`를 만들지 않습니다. 보존할 필요가 있고 커밋 가능한 산출물만 Feature에 포함하며 비밀정보·임시 대용량 출력을 넣지 않습니다.

## Knowledge Architecture

- 제품 의도와 장기 요구사항의 기준은 PRD입니다. 활성 Feature는 이를 연결하고 구체화하며, 요구사항 변경은 PRD에 다시 반영해야 합니다.
- 활성 Feature SDD는 해당 변경의 범위·상태·설계 결정·태스크·인수 조건의 기준입니다.
- 사람이 관리하는 아키텍처·온보딩·운영·디자인·에이전트 정책 문서는 프로젝트 전체 설명과 정책의 기준입니다. 실행 가능한 사실은 tracked 코드·스키마·마이그레이션·설정과 일치해야 하며, 테스트는 검증 증거입니다.
- OpenWiki는 파생된 온보딩·코드 탐색 증거이며 요구사항·정책·런타임 사실의 기준이 아닙니다.
- 모든 Plan에서 명시적인 `NONE`을 포함해 `Curated Documentation Impact` 판정을 완료합니다. 모든 `UPDATE` 또는 `ADD` 대상은 하나 이상의 task `Docs` 항목에서 연결하고 활성 Feature scope로 커밋합니다.
- `experimental.openwiki=true`이면 통합 후 Knowledge를 게시합니다. local은 머지 검증 후 cleanup 전에 반환된 `knowledge publish`를 실행하고, GitHub는 `knowledge ci`로 준비한 기준 브랜치 push CI에서 실행합니다. 누락 또는 false이면 이 흐름을 사용하지 않습니다.
- 별도 worktree에서 생성하고 코드 revision별 artifact로 저장합니다. 생성 Wiki와 receipt를 Feature 커밋이나 Feature 리뷰 필수 문서에 추가하지 않습니다. PRD·아키텍처 등 사람이 관리하는 문서는 Feature에서 함께 수정합니다.

### Knowledge 게시 진단과 복구

- `knowledge publish --json`은 stdout에 최종 JSON 하나를 반환하며 stderr에 단계·실행 차수·runId(관찰된 경우)·페이지 진행·경과 시간·재시도 이유를 출력합니다. `knowledge status --component <name> --json`으로 현재 게시 상태와 마지막 정상 게시본을 확인합니다.
- 총 시간 제한과 무출력 시간 제한은 기본으로 꺼져 있습니다. `--absolute-timeout-ms`를 명시하면 준비·생성·검증·자동 재시도를 합친 한 번의 호출에 적용합니다. `--idle-timeout-ms`도 명시할 때만 적용하며, 페이지가 오래 걸리는 것만으로 정체라고 단정하지 않습니다. 명시한 예산 초과 후 새 재시도나 게시를 진행하지 않습니다. 수동 재개는 새 호출이며 이전 실행 시간과 진단 경로는 보존합니다.
- evidence 오류는 진단 범위가 한 번의 제한된 수정 요청에 담길 때만 해당 페이지·Claims를 부분 수정한 뒤 전체 검증합니다. 복구 범위가 불명확하거나 재검증이 실패하면 중단하며, 자동 전체 재생성으로 전환하지 않습니다. 기존 receipt의 글쓰기 정책이 바뀌어 모든 페이지를 다시 작성해야 하는 경우에만 전체 초기화를 수행합니다.
- 수정/초기화 전 기존 생성물을 보존하고, 실행별 진단은 Git 공용 runtime의 `knowledge-executions/<id>/events.jsonl`에 남깁니다. `diagnosticsPath`와 `snapshotPath`를 사용하며 원문 프롬프트·provider 출력·인증정보를 별도 로그에 기록하지 않습니다. 보존 사본은 기존 OpenWiki 파일이므로 외부 공유 전 내용을 확인합니다.
- SIGINT/SIGTERM은 중단 상태로 종료합니다. SIGKILL 등으로 남은 `running`은 상태 조회 시 PID와 잠금 소유권으로 재판정합니다. 구형 기록의 소유권을 확인할 수 없으면 `unknown`으로 표시하며 실행 중이라고 단정하지 않습니다.
- 실패해도 통합 커밋과 마지막 정상 게시본은 유지합니다. 같은 Feature/component와 통합 커밋의 저장된 page queue가 있으면 owner·작성 정책·완료 페이지와 Claims/manifest 해시를 먼저 검사한 뒤 기존 worktree에서 이어갑니다. 불일치는 보존 후 차단합니다. 새 통합 커밋의 갱신은 검증한 최근 정상 게시 artifact를 기준으로 시작합니다. 게시 성공 후 workflow-stage의 cleanup을 따르며 통합 검증과 병합을 무조건 반복하지 않습니다.

## 선택적 UI/UX 디자인 정책

- 사용자 요청에 design system, UI/visual redesign, 디자인 일관성, 공통 UI/component library 정리, branding/theme/token 재설계, Figma/디자인 이미지 기반 구현이 명시된 경우에만 `npx lee-spec-kit docs get ui-ux-design --json`을 읽고 적용합니다.
- 단순히 대상이 web/frontend인 경우, 비 UI/backend Feature, 장기 디자인 규칙과 무관한 단순 버그 수정에는 이 정책을 적용하지 않습니다.
- 이 문서는 선택적 권장 정책이며 `requiredDocs`나 workflow 승인 gate가 아닙니다.

## 실행 규칙

- lee-spec-kit은 문서 구조, workflow 단계, validator를 담당합니다.
- Codex는 실행 루프, 도구 사용, hook lifecycle을 담당합니다.
- `implementationAllowed === true`일 때만 구현 코드를 수정합니다. 일반 태스크 구현은 `stage === "implementation"`에서, 리뷰 수정은 `task_review_fix` 또는 `feature_review_fix`에서, 검증 수정은 `feature_remediation`에서만 수행합니다.
- `nextAction.category`가 `plan_review`이고 `executor`가 `subagent`이면 정확히 반환된 `delegationContext`, `specHash`, `planHash`로 fresh 읽기 전용 서브에이전트에게 검수를 위임합니다. 메인 에이전트가 반환된 `reviewRound`, Plan 검수 evidence, decision, reviewer metadata와 두 hash를 기록하며 이후 spec/plan 내용 변경은 기존 검수를 무효화합니다.
- `nextAction.category`가 `task_execute`이고 `executor`가 `subagent`이면 해당 태스크 하나를 활성화한 뒤, 반환된 `workingDirectory`에서 fresh 서브에이전트에게 반환된 모델·추론도·unavailability 정책, 정확한 `workerContract`, 정확한 `delegationContext`로 구현과 태스크 범위 검증을 위임합니다. 컨텍스트를 재구성하거나 누락하거나 넓히지 않습니다. 특정 이름의 실행 스킬은 요구하지 않습니다.
- 구현 worker는 승인된 Verification Contract를 따르고 계획되지 않은 영구 테스트를 추가하지 않으며 직접 실행합니다. `workflow-stage`를 호출하거나 다른 서브에이전트를 생성하지 않습니다. 프로젝트 코드 수정과 범위 내 검사를 수행할 수 있고, `workerContract.editDocs === true`일 때만 `workerContract.allowedWritePaths`에 반환된 정확한 curated 문서 경로를 편집할 수 있습니다. `editFeatureDocs`는 항상 false이므로 Feature 문서와 목록에 없는 문서는 메인 에이전트 소유입니다. 태스크 상태 변경, 커밋, 승인 요청, 원격/파괴적 작업은 하지 않습니다. 메인 에이전트가 결과를 확인하고 Feature 문서 동기화, 태스크 전환, 커밋, 후속 workflow를 소유하며, 공식 hook은 `task_execute`가 활성화된 동안 커밋을 차단합니다.
- `nextAction.category`가 `task_review`이고 `executor`가 `subagent`이면 정확히 반환된 `delegationContext`, task ID, SHA/tree 범위로 fresh context의 읽기 전용 리뷰를 위임하고 반환된 `reviewRound`를 기록합니다.
- `nextAction.category`가 `pre_pr_review`이고 `executor`가 `subagent`이면 정확히 반환된 `delegationContext`, 모델·추론도·`reviewRound`·SHA/tree 범위로 fresh context의 읽기 전용 Feature 리뷰를 실행합니다. 리뷰 스킬 이름을 선택하거나 요구하지 않습니다.
- 리뷰 서브에이전트는 finding만 반환하고 코드를 수정하지 않습니다. 메인 에이전트가 finding을 반영하고 reviewer metadata, reviewed scope, evidence, decision, 정확한 hash/SHA/tree target metadata를 기록합니다.
- 서브에이전트에게 위임한 뒤에는 완료, 명시적 실패, 취소, 또는 조치가 필요한 승인·사용자 입력 요청 중 하나의 종결 상태를 반환할 때까지 기다립니다.
- 서브에이전트가 실행 중이면 가급적 긴 bounded wait를 반복합니다. 한 번의 대기가 새 소식 없이 끝난 것, 상태 메시지가 없는 것, 파일 변경이 없는 것은 아직 실행 중이라는 뜻일 뿐 실패나 정체의 증거가 아닙니다. 읽기 전용 리뷰 서브에이전트는 파일을 변경하지 않는 것이 정상입니다.
- 조용하거나 파일을 변경하지 않았다는 이유만으로 실행 중인 서브에이전트를 중단·교체·포기하지 않습니다. 사용자의 명시적 중단 요청, 종결 실패·취소, 또는 복구 불가능한 런타임 상태가 있을 때만 중단합니다.
- `workflow.agentReview.maxRounds`는 Plan/task/Feature 게이트별 fresh 리뷰의 최대 실행 횟수입니다. 마지막 허용 리뷰가 `changes_requested`이면 지적을 한 번 반영하지만 변경된 target을 다시 리뷰하지 않으며, 남은 finding과 리뷰 이후 target 변경을 잔여 위험으로 보존하고 사용자 리뷰 승인 토큰 없이 게이트를 자동 완료합니다. 예를 들어 `maxRounds=1`이면 Round 1 리뷰와 지적 반영 후 Round 2 없이 계속합니다. `blocked` 결정은 자동 완료하지 않습니다.
- spec / plan / tasks 승인, issue 생성, branch 생성은 구현 전 하드 게이트로 취급합니다.
- 통합 후 `knowledge_sync` action의 `knowledge publish` 명령을 따릅니다. 생성 실패 시 검증된 머지와 마지막 정상 게시본을 유지합니다. `knowledge status`로 확인하고 재시도합니다. `knowledge sync`는 기존 in-place 호환 명령이며 Feature workflow에서 사용하지 않습니다.
- standalone 모드에서는 `git worktree add`를 직접 만들지 말고 `workflow-stage`의 정확한 `nextAction.command`를 실행해 managed workspace 경로, stale 디렉터리 정리, `.env`/`.env.*` 복사 단계가 일관되게 유지되도록 합니다.
- local 모드에서는 구현 승인 직후 종료하지 않습니다. `workflow-stage`가 반환하는 정확한 `local verify`, `local merge`, `local cleanup` 명령을 따라 검증·통합·정리가 확인되어 `done`이 될 때까지 진행합니다. `feature_remediation` 단계에서는 Feature worktree 수정이 명시적으로 허용됩니다.
- `local-ff` 또는 `local-squash` workflow에서 `local_merge` 승인이 필요하면 구현 승인과 local merge 승인을 구분합니다. 첫 번째 승인은 구현 결과를 수락하고, 두 번째 승인은 설정된 통합 전략, post-merge 검사, local cleanup을 허가합니다.
- 동작이나 범위가 바뀌는 코드 변경이 있으면 같은 턴 안에서 feature 문서를 같이 동기화합니다.
- `git commit` 전에 `npx lee-spec-kit commit-audit --json`를 사용합니다. Feature-scoped commit은 Issue가 연결되어 있으면 `#123`, Issue 없는 local workflow에서는 `K7M2Q9RX4DAB` 같은 안정적인 Feature ID를 scope로 사용합니다.
- 기본 docs sync 검사는 `npx lee-spec-kit workflow-audit --json`를 사용합니다. 완료된 Feature는 canonical 문서에 현재 marker가 정확히 하나 기록되기 전까지 `workflow_sync` 게이트를 통과할 수 없습니다.

## 승인 규칙

사용자 확인 필수 규칙을 항상 먼저 적용합니다.

| 현재 액션 예시 | 공유 내용                                                |
| -------------- | -------------------------------------------------------- |
| 이슈 생성      | `npx lee-spec-kit github issue <featureRef> --create` 전 |
| PR 생성        | `npx lee-spec-kit github pr <featureRef> --create` 전    |

- 문서화된 workflow checkpoint와 원격/파괴적 작업 전에만 사용자 승인을 요청합니다.
- `workflow-stage --json`가 `approvalRequired === true`를 반환하면 그 checkpoint에서 멈추고 사용자 승인을 받습니다.
- `workflow-stage --json`가 승인 경계에서 라벨형 `actionOptions`를 반환하면, 사용자 프롬프트에서도 같은 옵션 라벨과 `reply` 값을 그대로 사용하고 다른 응답 형식을 임의로 만들지 않습니다.
- GitHub 원격 작업 전에는 올릴 artifact나 계획을 먼저 공유합니다.

## 표기 규칙

- 답변: 한국어
- 코드/파일명: 영어
- 날짜/시간: 사용자 로컬 시스템 시간

셸에서 감사와 커밋을 연결할 때는 `commit-audit --json --enforce`를 사용합니다. `--json`만 사용하면 `status: blocked`여도 종료코드는 0일 수 있으므로 JSON 상태를 확인해야 합니다. lee-spec-kit 관리 블록과 도구 설정 변경은 OpenWiki 생성물 변경으로 분류하지 않습니다.
