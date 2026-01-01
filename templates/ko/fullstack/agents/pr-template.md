# GitHub PR 템플릿 가이드

에이전트가 Pull Request를 생성할 때 참조하는 템플릿입니다.

---

## PR 생성 규칙

### 제목 형식

```text
feat(#{이슈번호}): {기능명}
```

예: `feat(#1): 사용자 인증 구현`

### 링크 형식 (중요!)

PR 본문에서 레포 내 파일 링크는 **반드시 현재 브랜치명을 사용**:

```markdown
[파일명](https://github.com/{owner}/{repo}/blob/{브랜치명}/docs/path/to/file.md)
```

> ⚠️ `main` 브랜치 링크는 머지 전까지 404가 발생합니다!
> 반드시 **현재 피처 브랜치명** (예: `feat/5-feature-name`)을 사용하세요.

## PR 본문 템플릿

```markdown
## 개요

{변경 사항에 대한 간략한 설명}

## 변경 사항

- {변경 1}
- {변경 2}
- {변경 3}

## 테스트

- [ ] 유닛 테스트 통과
- [ ] 통합 테스트 완료

## 스크린샷 (UI 변경 시)

{있으면 첨부}

## 관련 문서

- Spec: `docs/features/{be|fe}/F{번호}-{기능명}/spec.md`
- Tasks: `docs/features/{be|fe}/F{번호}-{기능명}/tasks.md`

Closes #{이슈번호}
```

---

## PR 생성 명령어

```bash
# 현재 브랜치명 확인
BRANCH=$(git branch --show-current)

gh pr create \
  --title "feat(#{issue}): {기능명}" \
  --body-file /tmp/pr-body.md \
  --base main
```

---

## 머지 규칙

| 상황         | 머지 방식         |
| ------------ | ----------------- |
| 일반 Feature | Squash and Merge  |
| 긴급 Hotfix  | Merge 또는 Rebase |
| 문서 수정    | Squash and Merge  |

---

## 라벨 규칙

- PR 생성 시 적절한 라벨 지정 (`--label`)
- 라벨이 존재하지 않으면 먼저 생성:
  ```bash
  gh label create "라벨명" --description "설명" --color "색상코드"
  ```

---

## Assignee 규칙

- 기본값: 본인 할당 (`--assignee @me`)
- 리뷰어 지정 시 `--reviewer` 옵션 사용
- 예시:
  ```bash
  gh pr create --assignee @me --reviewer reviewer-username ...
  ```

---

## 본문 입력 규칙 (셸 실행 방지)

- PR 본문은 **`--body-file` 사용을 기본**으로 한다.
- 백틱(`)이나 `$()`가 포함된 본문을 `"..."`에 직접 넣으면 **셸에서 명령치환**될 수 있다.
- 여러 줄 본문은 `cat <<'EOF'` 형식의 **싱글 쿼트 heredoc**을 사용하고,
  필요한 변수는 **플레이스홀더 → sed 치환**으로 처리한다.
