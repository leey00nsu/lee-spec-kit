# OpenWiki Knowledge CI 설정

`experimental.openwiki`는 lee-spec-kit 프로젝트에서 Knowledge CI 설정을 허용하는 스위치입니다. 이를 켜도 문서 생성이나 CI 설치가 자동으로 시작되지는 않습니다. `knowledge ci`가 프로젝트 저장소에 GitHub Actions 워크플로우를 만든 뒤, 프로젝트가 모델과 인증정보를 설정하고 워크플로우를 커밋해야 합니다. OpenWiki가 문서 생성·증분 갱신·검증을 맡고, GitHub Actions가 실행 결과를 PR로 게시합니다. 예약 시각을 정하는 주체는 GitHub Actions, Coolify 또는 다른 스케줄러 중에서 선택할 수 있습니다.

## 1. 워크플로우 만들기

프로젝트에서 다음 명령을 실행합니다.

```bash
npx lee-spec-kit config --openwiki true
npx lee-spec-kit knowledge ci --json
```

`standalone`에서 프로젝트가 여러 개라면 `knowledge ci --component <component> --json`으로 대상 프로젝트를 지정합니다. 이 경우 워크플로우는 선택한 코드 저장소에 생성되며, 별도 문서 저장소의 내용은 OpenWiki의 생성 입력에 포함되지 않습니다. 자동 병합을 원하면 처음 만들 때 `knowledge ci --auto-merge --json`을 사용합니다. 이 옵션은 저장소의 **Allow auto-merge** 설정과 필요한 브랜치 검사·리뷰 정책을 대신 설정하지 않습니다.

생성된 `.github/workflows/lee-spec-kit-knowledge.yml`, `openwiki/INSTRUCTIONS.md`, `.openwikiignore`를 확인하고 커밋합니다. 워크플로우는 OpenWiki `0.7.2`와 lee-spec-kit 글쓰기 정책 버전을 고정하고, `openwiki code --update --print`에 프로젝트 언어(`--language ko` 또는 `--language en`)를 지정해 실행합니다. Feature 완료와 Knowledge 게시 성공 여부는 독립적입니다.

기존 워크플로우가 새 템플릿과 다르면 `knowledge ci`는 `OPENWIKI_CI_EXISTS`를 반환하고 파일을 보존합니다. 구형 실행 어댑터를 호출하던 생성 워크플로우도 자동 교체하지 않습니다. 0.5.2에서 올릴 때는 기존 파일의 OpenWiki 설치 버전을 `0.7.2`로 직접 바꾸고 Node.js가 `22.22.0` 이상인지 확인합니다. 최신 scaffold의 출력 범위 검사도 반영합니다. working tree·index·PR 변경 경로를 구하는 `git diff`에 `--no-renames`를 포함해야 파일 이동의 원래 경로 삭제까지 검사됩니다. 기존 제공자·모델·시크릿 참조·예약·자동 병합 설정과 `openwiki/`의 Wiki·Claims를 유지한 채 `--update`를 사용합니다.

### 기존 지침 진단과 마이그레이션 미리보기

```bash
npx lee-spec-kit knowledge ci --dry-run --json
# standalone 다중 프로젝트: --component <component>
# 기본 자동 병합 템플릿도 비교하려면: --auto-merge
```

이 명령은 파일·디렉터리·Git index를 수정하지 않으며 OpenWiki를 실행하지 않습니다. OpenWiki 설정이 꺼져 있어도 초기 점검에 사용할 수 있습니다. `workflow.state`는 현재 기본 템플릿과의 일치 여부와 구형 어댑터 사용 여부를, `instructions.state`는 `current`, `known_legacy`, `customized`, `missing`, `manual_review`를 표시합니다. 심볼릭 링크나 검사할 수 없는 파일은 직접 검토 대상으로 둡니다. 출력에는 기존 프로젝트 지침·워크플로우 본문을 싣지 않고 해시와 공개된 기본 템플릿만 제공합니다.

`instructions.proposedAdditions`는 현재 파일에 정확히 일치하는 줄이 없는 기본 지침이며, `proposedDeletions`는 비어 있습니다. 표현이 다른 사용자 지침을 의미상 분석한 결과는 아니므로, 동등한 기존 문구를 확인한 뒤 필요한 내용만 직접 합칩니다. 특히 구형 기본 지침에는 페이지 작업자에게 글쓰기 skill을 전달하는 규칙, 루트 quickstart의 상대 링크 예시, 변경되지 않은 페이지를 보존하는 규칙이 없었습니다. 패키지만 업데이트해도 기존 `INSTRUCTIONS.md`는 바뀌지 않습니다. 지침 갱신 자체를 전체 Wiki 재작성 요청으로 해석하지 않습니다.

`workflow.defaultPreview`는 최신 기본 구성의 참고 자료입니다. 기존 YAML의 제공자·모델·시크릿 참조, cron 또는 외부 dispatch 입력, 동시성·자동 병합 정책을 유지하면서 관측·artifact·취소 후 처리 단계와 필요한 환경 변수만 통합합니다. 현재 버전의 lee-spec-kit 설치 pin에 `resources/openwiki/ci-observe.cjs`가 포함되어 있어야 합니다. 기존 파일을 기본 미리보기로 통째로 대체하지 않습니다.

첫 0.7.2 CI 실행 전에는 루트 `AGENTS.md`와 기존 `CLAUDE.md`의 표식 없는 `## OpenWiki` 절을 확인합니다. OpenWiki는 제목 다음의 첫 빈 줄이 아닌 줄이 `This repository has documentation located in the /openwiki directory.`와 정확히 일치할 때만 구버전 템플릿으로 인식하며, 알려진 템플릿 줄만 제거합니다. lee-spec-kit의 출력 범위 검사는 `<!-- OPENWIKI:START -->` / `<!-- OPENWIKI:END -->` 밖의 변경을 거부하므로, 해당 생성 문구만 단일 관리 블록 안으로 이관하는 변경을 미리 별도 검토·커밋합니다. 이미 블록이 있으면 그 안으로 합치고, 프로젝트 고유 문구와 기존 검사는 유지합니다. OpenWiki 0.7.2는 없던 `CLAUDE.md`를 생성하지 않으며, 기존 파일의 관리 지침은 갱신합니다. `@AGENTS.md` 가져오기만 있는 파일은 그대로 둡니다.

## 2. 모델과 GitHub 인증정보 설정

생성된 워크플로우는 `OPENWIKI_PROVIDER: openai`와 GitHub Actions 시크릿 `OPENAI_API_KEY`를 기본으로 사용합니다. 모델 ID는 지정하지 않으므로 OpenWiki의 기본값에 맡겨집니다. 운영 전에는 사용할 제공자와 **그 제공자가 실제로 노출하는 모델 ID**를 선택하고, 워크플로우의 `Generate Knowledge with OpenWiki` 단계에 `OPENWIKI_MODEL_ID`를 명시하는 편이 설정을 검토하기 쉽습니다. 특정 모델을 lee-spec-kit이 강제하지는 않습니다. [OpenWiki 0.7.2의 제공자 설명](https://github.com/langchain-ai/openwiki/blob/v0.7.2/README.md#model-providers)과 [공식 CI 예제](https://github.com/langchain-ai/openwiki/blob/v0.7.2/examples/openwiki-update.yml)를 기준으로 제공자별 변수와 모델 ID를 확인하세요.

`OPENWIKI_PROVIDER`와 `OPENWIKI_MODEL_ID`는 워크플로우에 적는 비밀이 아닌 설정값입니다. API 키와 토큰은 GitHub Actions 시크릿에 보관합니다.

네이티브 페이지 작업자 동시성은 기본 `1`이며, 필요하면 생성 단계의 `OPENWIKI_PAGE_CONCURRENCY`를 `1`~`8` 범위의 정수로 설정합니다. 이는 GitHub Actions 실행 간 동시성 설정과 별개입니다.

기본 OpenAI 구성의 생성 단계는 다음 형태입니다. `MODEL_ID_FROM_PROVIDER`를 실제 사용할 모델 ID로 바꿉니다.

```yaml
env:
  OPENWIKI_PROVIDER: openai
  OPENWIKI_MODEL_ID: MODEL_ID_FROM_PROVIDER
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

OpenAI 호환 API를 쓰는 프로젝트는 제공자, 모델, 키, 기본 URL을 함께 바꿉니다. 모델 ID는 해당 API가 받는 정확한 값을 사용합니다. 아래 URL은 GitHub 시크릿으로 관리하는 예시이며, 민감정보가 없는 URL이라면 프로젝트 정책에 따라 변수로 관리해도 됩니다.

```yaml
env:
  OPENWIKI_PROVIDER: openai-compatible
  OPENWIKI_MODEL_ID: MODEL_ID_FROM_PROVIDER
  OPENAI_COMPATIBLE_API_KEY: ${{ secrets.OPENAI_COMPATIBLE_API_KEY }}
  OPENAI_COMPATIBLE_BASE_URL: ${{ secrets.OPENAI_COMPATIBLE_BASE_URL }}
```

GitHub 저장소의 **Settings → Secrets and variables → Actions → New repository secret**에서 필요한 값을 등록합니다. 인증정보를 워크플로우 파일이나 `openwiki/INSTRUCTIONS.md`에 적지 마세요. [GitHub의 Actions 시크릿 등록 절차](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)를 참고할 수 있습니다.

| 이름                                         | 등록 위치                       | 용도와 권한                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY` 또는 선택한 제공자의 API 키 | GitHub Actions 시크릿           | OpenWiki의 모델 호출. 실제 워크플로우가 참조하는 제공자의 키만 등록합니다.                                                                                                       |
| `OPENAI_COMPATIBLE_BASE_URL`                 | GitHub Actions 시크릿 또는 변수 | OpenAI 호환 API의 기본 URL. 호환 제공자를 선택했을 때 필요합니다.                                                                                                                |
| `OPENWIKI_PR_TOKEN`                          | GitHub Actions 시크릿           | Knowledge 브랜치 push와 PR 생성·수정. 대상 저장소에 한정된 fine-grained token 또는 GitHub App token에 **Contents: read/write**, **Pull requests: read/write** 권한을 부여합니다. |
| `GH_ACTIONS_DISPATCH_TOKEN`                  | 외부 스케줄러의 런타임 시크릿   | Coolify 등에서 GitHub 워크플로우를 시작할 때만 필요합니다. 대상 저장소의 **Actions: write** 권한을 부여하며, GitHub Actions 시크릿으로 복사할 필요는 없습니다.                   |

`OPENWIKI_PR_TOKEN`과 `GH_ACTIONS_DISPATCH_TOKEN`은 용도가 다릅니다. 전자는 워크플로우 **안에서** 게시할 때, 후자는 워크플로우 **밖에서** 실행을 요청할 때 사용합니다. 둘 다 저장소를 대상 범위로 제한하세요. 별도 PR 토큰을 쓰는 이유는 기본 `GITHUB_TOKEN`으로 만든 PR이 필요한 `pull_request` 검사를 시작하지 못할 수 있기 때문입니다. 이는 [OpenWiki의 자동 병합 안내](https://github.com/langchain-ai/openwiki/blob/v0.7.2/README.md)에도 설명돼 있습니다.

모델 ID와 키를 바꾼 뒤에는 수동 실행 한 번으로 인증·응답·생성 문서의 품질을 확인합니다. 제공자 설정이 맞다는 사실만으로 생성된 설명과 코드 근거의 품질까지 보장되지는 않습니다.

## 3-A. 기본 방식: GitHub Actions가 예약 실행

`knowledge ci`가 만든 워크플로우에는 `schedule`과 `workflow_dispatch`가 있습니다. 기본 cron은 `17 3 * * *`이며 GitHub의 UTC 기준으로 매일 03:17입니다. 원하는 시각에 맞게 프로젝트가 cron을 수정할 수 있습니다. `schedule`은 기본 브랜치의 워크플로우를 실행하며, GitHub 부하에 따라 늦어지거나 드물게 누락될 수 있습니다. 정확한 시각이나 별도 재호출 정책이 필요하면 아래 외부 스케줄러 방식을 선택합니다. [GitHub의 `schedule` 설명](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)을 참고하세요.

처음 설정한 뒤 저장소의 **Actions → Scheduled OpenWiki Knowledge → Run workflow**에서 수동으로 실행하고, 생성 단계·완료 상태·PR을 확인합니다. OpenWiki가 정상 종료하고 소스 입력과 문서에 게시할 변경이 없으면 새 PR을 만들지 않습니다. 실패하면 성공한 페이지를 draft Knowledge PR에 보존할 수 있으며, 다음 예약 실행에서 그 브랜치를 다시 입력으로 사용합니다.

### 진행 관측과 실패·취소 후 보존

OpenWiki 0.7.2의 `--print`는 진행 이벤트를 종료할 때까지 버퍼링합니다. `ci-observe.cjs`는 OpenWiki 명령을 한 번 실행하면서 30초마다 공식 `.run.json`의 `phase`, `plan.pages[*].status`와 `.page-manifest.json`의 보존 페이지 수를 읽습니다. 로그에는 경과 시간과 단계·완료·대기·건너뜀 수만 표시합니다. 대기 페이지에는 실행 중인 작업자도 포함되며, 이 상태만으로 모델 호출의 생존 여부나 정체를 판정하지 않습니다. timeout·별도 재시도·복구 프롬프트를 추가하지 않습니다.

진단에는 공식 `--telemetry-file`의 결과·오류 분류·단계·담당 범주·HTTP 상태 중 허용된 값만 남깁니다. 원시 CLI stdout/stderr는 제공자가 인증정보나 요청 내용을 되돌려줄 수 있어 로그·파일에 남기지 않습니다. 원시 telemetry, 환경 파일, 사용자 지침, `.run.json`의 `planningContext`·`wikiGoal`·페이지 지침·전체 snapshot도 업로드하지 않습니다. OpenWiki의 telemetry 수집 해제를 존중하며, 이 경우 오류 분류가 제공되지 않을 수 있습니다. 제공자·모델 환경 변수와 기존 자격증명 설정은 관측 도구가 변경하지 않습니다.

각 관측 시점에는 OpenWiki manifest에 기록되고 Markdown hash와 verified Claims가 일치하는 페이지를 `RUNNER_TEMP/openwiki-ci/checkpoint/`에 보존합니다. symlink·숨김 경로·알려진 인증정보 값이 들어 있는 파일·불완전 페이지는 제외하며, 이전 관측에서 안전하게 보존한 완료 페이지는 이후 파일이 쓰이는 중이어도 유지합니다. 파일당 16 MiB, 한 번의 관측에서 새로 복사하는 Markdown·Claims는 직렬화 후 64 MiB까지 보존합니다. 새 Markdown·Claims·manifest를 모두 별도 임시 경로에 쓴 뒤 교체하고, 복구 가능한 교체 오류는 이전 세트로 되돌립니다. index·로그·실행 설정은 포함하지 않습니다. 이 수출본은 완료 상태를 뜻하지 않고, `.run.json`을 가진 원본 실행의 완전한 재개본도 아닙니다. 이후 단계는 제공자 시크릿을 받지 않으므로 새 문서 내용을 추가 수집하지 않고 이미 필터링한 수출본만 업로드합니다.

생성 실패와 일반 취소 후에도 `always()` 조건으로 진단·완료 페이지 수출본 업로드, 임시 run context 제거, 출력 범위 검사, 소스 확인과 draft PR 게시를 시도합니다. artifact 이름은 `openwiki-observation-<run_id>-<run_attempt>`이며 보존 기간은 7일입니다. `include-hidden-files`는 별도 수출 경로의 `.claims`와 manifest를 포함하기 위한 설정이며 저장소 전체나 OpenWiki 설정 디렉터리를 업로드하지 않습니다. 출력 범위 검사 또는 정리 실패 시 PR push를 막고, 취소된 결과는 ready·자동 병합 대상이 되지 않습니다.

기존 완료 조건은 그대로입니다. CLI 정상 종료에 더해 `.last-update.json`의 `status=complete`, 실행 시작 시 source SHA와 같은 `gitHead`, `.run.json` 부재가 필요하고, 게시 전후에도 기본 브랜치의 SHA를 재확인합니다. 체크포인트 게시 단계는 draft를 유지하며, 성공·취소 여부를 새로 평가하는 별도 단계에서만 PR을 ready로 바꿉니다. 자동 병합도 이 단계의 성공을 확인합니다. 페이지가 건너뛰어져 CLI가 0으로 끝나더라도 metadata가 불완료면 draft와 실패 상태를 유지합니다. PR API 실패 시 기존 lease 기반 rollback도 유지하되, ready 전환 실패 후에는 PR이 draft라는 사실을 확인한 뒤 브랜치를 되돌립니다. draft를 확인할 수 없으면 브랜치는 그대로 두고 실패를 보고하므로 실행 로그와 PR을 직접 확인해야 합니다. 게시 결과·완료 여부·소스 최신성은 Actions summary에서 확인합니다.

GitHub의 일반 취소는 신호 전달 뒤 짧은 유예 시간을 주지만, 강제 취소·`SIGKILL`·러너 소실·네트워크 장애·취소 제한 시간 만료는 마지막 관측, artifact 업로드 또는 PR 게시를 막을 수 있습니다. 주기적으로 저장한 파일도 업로드 전에 러너가 사라지면 복구할 수 없습니다. 안전하게 남은 artifact나 draft PR까지만 보존이 확인된 것으로 취급합니다. [GitHub의 취소 절차](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-cancellation)를 참고하세요.

복구 시에는 먼저 draft PR과 artifact의 안전한 상태 수치를 확인하고, 마지막 정상 완료한 Wiki 기준선과 비교합니다. artifact에 전체 Wiki나 완료 metadata가 있다고 가정하지 말고, 별도 복구용 체크아웃에서 보존된 Markdown·Claims·manifest를 검토합니다. 현재 `INSTRUCTIONS.md`는 유지하고 OpenWiki `--update`로 다시 검증한 뒤 게시합니다. 자동 artifact 재주입이나 SDK 수정은 수행하지 않습니다.

소스 변경 없이 강제 갱신한 페이지가 실패하면 다음 실행이 `Cannot advance page coverage ... Markdown and verified Claims are not durable.`로 중단되는 기존 문제가 0.5.2와 0.7.2 모두에서 재현됩니다. 이 경우 반복 예약만으로 복구된다고 가정하지 않습니다. 마지막 정상 완료 revision의 `openwiki/`를 복구용 체크아웃에서 복원하되 현재 `INSTRUCTIONS.md`를 보존하고, 그 기준선에서 `--update`를 실행해 완료 상태를 확인한 뒤 복구 결과를 검토·게시합니다. Claims·manifest 삭제나 강제 초기화를 자동 복구에 추가하지 않습니다.

## 3-B. Coolify 방식: 예약은 Coolify, 생성은 GitHub Actions

Coolify가 OpenWiki를 직접 실행하는 구성이 아닙니다. Coolify의 짧은 예약 작업이 GitHub `workflow_dispatch` API를 호출하고, **같은 GitHub Actions 워크플로우**가 모델 호출·검증·PR 게시를 수행합니다. 따라서 2절의 GitHub Actions 시크릿은 그대로 필요합니다.

1. 생성된 워크플로우에서 `workflow_dispatch`는 유지하고 `schedule`만 제거합니다. 두 예약 방식을 동시에 켜 두면 중복 실행 요청이 생길 수 있습니다. 워크플로우 파일을 기본 브랜치에 커밋합니다.
2. 대상 저장소에만 접근할 수 있고 **Actions: write** 권한이 있는 fine-grained token 또는 GitHub App token을 발급합니다. Coolify에서 실행할 앱의 런타임 환경 변수 `GH_ACTIONS_DISPATCH_TOKEN`으로 등록합니다. 이 토큰을 GitHub Actions 워크플로우에 넣지 않습니다. [GitHub의 workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)가 필요한 권한과 요청 형식을 설명합니다.
3. 실행 중인 Coolify 앱의 **Configuration → Scheduled Tasks**에 dispatch 명령과 cron을 등록합니다. 작업은 실행 중인 컨테이너 안에서 수행됩니다. cron은 **그 앱이 배포된 서버의 시간대**를 따르므로 시각을 먼저 확인합니다. [Coolify Scheduled Tasks](https://coolify.io/docs/applications/operations/scheduled-tasks)를 참고하세요.
4. 작업을 **Execute Now**로 실행한 뒤 Coolify의 Recent executions와 GitHub Actions 실행 목록을 모두 확인합니다. Coolify에서 요청이 성공해도 뒤따르는 OpenWiki 생성이나 PR 게시가 성공했다는 뜻은 아닙니다.

Copysinger는 Coolify에서 매시 정각(`0 * * * *`)에 `node /app/dispatch.mjs --dispatch`를 실행합니다. 이 프로젝트 소유의 dispatcher가 `Asia/Seoul` 기준 새벽 1시 이후인지 확인하고, 그 날짜의 실행 또는 현재 실행 중인 작업이 있으면 건너뛰며, 없을 때 `main`의 워크플로우를 한 번 요청합니다. 새벽 1시 작업을 놓쳐도 다음 시간에 다시 확인하기 위한 구성입니다. 다른 프로젝트가 이 주기를 그대로 따라야 하는 것은 아닙니다.

이 날짜별 중복 검사를 구현하려면 생성된 워크플로우의 `workflow_dispatch`에 `cycle` 입력과 날짜가 드러나는 `run-name`을 추가하고, dispatcher가 그 날짜를 입력으로 전송해야 합니다. Copysinger는 `OpenWiki Knowledge YYYY-MM-DD` 형식의 실행 이름을 조회해 같은 날짜의 실행을 찾습니다. [Copysinger의 워크플로우](https://github.com/leey00nsu/copy-singer/blob/e45845b23b83898042761eab37885f0d68d05f2e/.github/workflows/lee-spec-kit-knowledge.yml)와 [dispatcher](https://github.com/leey00nsu/copy-singer/blob/e45845b23b83898042761eab37885f0d68d05f2e/ops/knowledge-dispatcher/dispatch.mjs)가 함께 쓰이는 예시입니다. lee-spec-kit은 이 dispatcher를 자동 생성하지 않습니다.

dispatcher가 보내는 핵심 요청은 다음과 같습니다. `OWNER`, `REPO`, `main`을 대상 저장소·브랜치에 맞게 바꾸고, 인증 토큰은 Coolify 환경 변수에서만 읽습니다. GitHub가 빈 본문과 HTTP `204`를 반환하면 dispatch 요청이 접수된 것입니다.

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Accept: application/vnd.github+json" \
  --header "Authorization: Bearer ${GH_ACTIONS_DISPATCH_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{"ref":"main"}' \
  "https://api.github.com/repos/OWNER/REPO/actions/workflows/lee-spec-kit-knowledge.yml/dispatches"
```

이 요청만 예약 작업에 직접 넣을 수도 있습니다. 이 단순 요청에는 `cycle` 입력이나 날짜별 중복 검사가 없으므로, 매시 실행하는 대신 하루 한 번의 cron을 설정하거나 별도 중복 방지를 구현해야 합니다. 놓친 시각의 재확인도 직접 설계해야 합니다. Coolify 작업의 timeout은 **dispatch 명령**에만 적용되며, GitHub Actions에서 별도로 진행하는 OpenWiki 생성 시간을 제한하지 않습니다.

## 다른 스케줄러와 운영 확인

GitHub Actions의 예약 기능이나 Coolify가 필수는 아닙니다. 인증된 다른 스케줄러가 기본 브랜치의 `workflow_dispatch`를 호출해도 같은 워크플로우가 실행됩니다. 실행 요청의 중복 방지, 실패 시 재시도, 시간대 해석은 선택한 스케줄러의 책임입니다. 생성 완료와 PR 상태는 항상 GitHub Actions와 저장소에서 확인합니다.

자동 병합을 켠 경우에는 저장소의 **Allow auto-merge**, 필수 `Knowledge PR safety` 검사, 최신 브랜치 요구 사항 및 사람 리뷰 정책을 별도로 설정합니다. 실패하거나 소스가 실행 중 변경된 결과는 자동 병합 대상이 아닙니다. [OpenWiki의 CI·자동 병합 안내](https://github.com/langchain-ai/openwiki/blob/v0.7.2/README.md)와 [lee-spec-kit CLI 참조](./public-cli.md#knowledge)를 함께 확인하세요.
