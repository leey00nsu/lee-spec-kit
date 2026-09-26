# OpenWiki Knowledge CI 설정

`experimental.openwiki`는 lee-spec-kit 프로젝트에서 Knowledge CI 설정을 허용하는 스위치입니다. 이를 켜도 문서 생성이나 CI 설치가 자동으로 시작되지는 않습니다. `knowledge ci`가 프로젝트 저장소에 GitHub Actions 워크플로우를 만든 뒤, 프로젝트가 모델과 인증정보를 설정하고 워크플로우를 커밋해야 합니다. OpenWiki가 문서 생성·증분 갱신·검증을 맡고, GitHub Actions가 실행 결과를 PR로 게시합니다. 예약 시각을 정하는 주체는 GitHub Actions, Coolify 또는 다른 스케줄러 중에서 선택할 수 있습니다.

## 1. 워크플로우 만들기

프로젝트에서 다음 명령을 실행합니다.

```bash
npx lee-spec-kit config --openwiki true
npx lee-spec-kit knowledge ci --json
```

`standalone`에서 프로젝트가 여러 개라면 `knowledge ci --component <component> --json`으로 대상 프로젝트를 지정합니다. 이 경우 워크플로우는 선택한 코드 저장소에 생성되며, 별도 문서 저장소의 내용은 OpenWiki의 생성 입력에 포함되지 않습니다. 자동 병합을 원하면 처음 만들 때 `knowledge ci --auto-merge --json`을 사용합니다. 이 옵션은 저장소의 **Allow auto-merge** 설정과 필요한 브랜치 검사·리뷰 정책을 대신 설정하지 않습니다.

생성된 `.github/workflows/lee-spec-kit-knowledge.yml`, `openwiki/INSTRUCTIONS.md`, `.openwikiignore`를 확인하고 커밋합니다. 기존 워크플로우에 프로젝트별 수정이 있으면 `knowledge ci`는 이를 덮어쓰지 않으므로 직접 조정합니다. 워크플로우는 OpenWiki 버전과 lee-spec-kit 글쓰기 정책 버전을 고정하고, `openwiki code --update --print`를 실행합니다. Feature 완료와 Knowledge 게시 성공 여부는 독립적입니다.

## 2. 모델과 GitHub 인증정보 설정

생성된 워크플로우는 `OPENWIKI_PROVIDER: openai`와 GitHub Actions 시크릿 `OPENAI_API_KEY`를 기본으로 사용합니다. 모델 ID는 지정하지 않으므로 OpenWiki의 기본값에 맡겨집니다. 운영 전에는 사용할 제공자와 **그 제공자가 실제로 노출하는 모델 ID**를 선택하고, 워크플로우의 `Generate Knowledge with OpenWiki` 단계에 `OPENWIKI_MODEL_ID`를 명시하는 편이 설정을 검토하기 쉽습니다. 특정 모델을 lee-spec-kit이 강제하지는 않습니다. [OpenWiki 0.5.2의 제공자 설명](https://github.com/langchain-ai/openwiki/blob/v0.5.2/README.md#model-providers)과 [공식 CI 예제](https://github.com/langchain-ai/openwiki/blob/v0.5.2/examples/openwiki-update.yml)를 기준으로 제공자별 변수와 모델 ID를 확인하세요.

`OPENWIKI_PROVIDER`와 `OPENWIKI_MODEL_ID`는 워크플로우에 적는 비밀이 아닌 설정값입니다. API 키와 토큰은 GitHub Actions 시크릿에 보관합니다.

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

`OPENWIKI_PR_TOKEN`과 `GH_ACTIONS_DISPATCH_TOKEN`은 용도가 다릅니다. 전자는 워크플로우 **안에서** 게시할 때, 후자는 워크플로우 **밖에서** 실행을 요청할 때 사용합니다. 둘 다 저장소를 대상 범위로 제한하세요. 별도 PR 토큰을 쓰는 이유는 기본 `GITHUB_TOKEN`으로 만든 PR이 필요한 `pull_request` 검사를 시작하지 못할 수 있기 때문입니다. 이는 [OpenWiki의 자동 병합 안내](https://github.com/langchain-ai/openwiki/blob/v0.5.2/README.md)에도 설명돼 있습니다.

모델 ID와 키를 바꾼 뒤에는 수동 실행 한 번으로 인증·응답·생성 문서의 품질을 확인합니다. 제공자 설정이 맞다는 사실만으로 생성된 설명과 코드 근거의 품질까지 보장되지는 않습니다.

## 3-A. 기본 방식: GitHub Actions가 예약 실행

`knowledge ci`가 만든 워크플로우에는 `schedule`과 `workflow_dispatch`가 있습니다. 기본 cron은 `17 3 * * *`이며 GitHub의 UTC 기준으로 매일 03:17입니다. 원하는 시각에 맞게 프로젝트가 cron을 수정할 수 있습니다. `schedule`은 기본 브랜치의 워크플로우를 실행하며, GitHub 부하에 따라 늦어지거나 드물게 누락될 수 있습니다. 정확한 시각이나 별도 재호출 정책이 필요하면 아래 외부 스케줄러 방식을 선택합니다. [GitHub의 `schedule` 설명](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)을 참고하세요.

처음 설정한 뒤 저장소의 **Actions → Scheduled OpenWiki Knowledge → Run workflow**에서 수동으로 실행하고, 생성 단계·완료 상태·PR을 확인합니다. OpenWiki가 정상 종료하고 소스 입력과 문서에 게시할 변경이 없으면 새 PR을 만들지 않습니다. 실패하면 성공한 페이지를 draft Knowledge PR에 보존할 수 있으며, 다음 예약 실행에서 그 브랜치를 다시 입력으로 사용합니다. 수동 취소나 러너 종료 시에는 아직 push되지 않은 러너 내부 진행분이 남지 않을 수 있습니다.

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

자동 병합을 켠 경우에는 저장소의 **Allow auto-merge**, 필수 `Knowledge PR safety` 검사, 최신 브랜치 요구 사항 및 사람 리뷰 정책을 별도로 설정합니다. 실패하거나 소스가 실행 중 변경된 결과는 자동 병합 대상이 아닙니다. [OpenWiki의 CI·자동 병합 안내](https://github.com/langchain-ai/openwiki/blob/v0.5.2/README.md)와 [lee-spec-kit CLI 참조](./public-cli.md#knowledge)를 함께 확인하세요.
