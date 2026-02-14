# Pull Request Creation Process

Guide for creating Pull Requests.
Execution-state SSOT is the feature-local `pr.md`.

---

## Prerequisites

- [ ] All tasks in `[DONE]` state
- [ ] All checkboxes in `tasks.md` "Completion Criteria" are checked
- [ ] Changes committed
- [ ] Branch pushed

---

## Steps

### 1. Prepare `pr.md` Draft

> 📖 **If not read in this session, read procedure/template via `docs get`; do not re-read the same doc in the same session, then generate a body template and treat it as the source of truth.**

```bash
# 1) Read procedure + template policy (only docs not read in this session)
npx lee-spec-kit docs get create-pr --json
npx lee-spec-kit docs get pr-doc --json

# 2) Generate body template (no remote action)
npx lee-spec-kit github pr F001 --json
# - Force screenshots section: --screenshots on
# - Force Mermaid section: --mermaid on
# - Auto policy (default): --screenshots auto --mermaid auto
```

Use `docs get pr-doc --json` output as document-structure policy,
then refine the feature `pr.md` draft from `github pr --json` `body`.
Use `pr.md` status (`Draft | Ready | Opened | Merged`) as the actual workflow state.

| Item     | Format                             |
| -------- | ---------------------------------- |
| Title    | `feat(#{issue-number}): {feature} ({short description})` |
| Body     | Overview, Changes, Tests, Docs     |
| Labels   | **At least 1 required** (cannot be empty) |
| Assignee | `@me` (default)                    |

> ⚠️ Labels cannot be empty. If you’re unsure which label to use, ask/confirm with the user before creating the PR.

### 2. Test Verification

> 🚨 **PR cannot be created if tests fail**

1. Run relevant test commands (e.g., `npm test`, `pnpm test`); if no tests exist, request them from the user
2. Check results (PASS/FAIL)
3. In the PR body "Tests" section, keep only what you actually ran in the generated body template
4. If you didn’t run any tests, request/confirm with the user before creating the PR

### 3. Prepare Screenshots / Diagrams (Include in PR Body)

Include the artifacts in the PR body.

> - If this includes UI changes, include **screenshots**.
> - If this includes logic/structure changes, include a **diagram**.

#### UI changes (Frontend PR)

- Default is `pr.screenshots.upload: false`. If you need upload/URL inclusion, enable it in `.lee-spec-kit.json`.
- If `.lee-spec-kit.json` has `pr.screenshots.upload: false`, **do not upload/include URLs**, and **do not include a "Screenshots" section** in the PR body.
- Use `agent-browser` to generate screenshots.
- Save files under a local temp folder (`/tmp/lee-spec-kit/pr-assets/`).
- Upload them as Release assets, then put the image URLs into the "Screenshots" section of the PR body.
- Before uploading, **open the image file** and verify, then ask the user to validate before PR creation:
  - It is not a login/permission/error/blank page
  - The PR-relevant change is actually visible
  - No sensitive info is exposed (prod tokens/PII/internal URLs)

> If the page requires auth, request one of the following from the user before taking screenshots:
> - A preview URL that is accessible **without login** (dev-only bypass is OK)
> - A **test account** (no real accounts / no production tokens) + login instructions
> - A reproducible route with seeded/dummy data

```bash
# (one-time) install agent-browser
npm i -g agent-browser
agent-browser install  # install Playwright browsers

# Start a dev server: ports are often already taken, so prefer a free port.
# - If you already have a running dev server, you can just set PREVIEW_URL to that URL.
PORT=$(node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});")
# (example) Vite
pnpm dev --host 127.0.0.1 --port \"$PORT\" >/tmp/lee-spec-kit-dev.log 2>&1 &
DEV_PID=$!
PREVIEW_URL=\"http://127.0.0.1:${PORT}\"

# (example) capture from a preview URL
mkdir -p /tmp/lee-spec-kit/pr-assets
agent-browser open "$PREVIEW_URL"
agent-browser screenshot /tmp/lee-spec-kit/pr-assets/ui-1.png --full
agent-browser close

# (required) open and validate the screenshot (re-capture if login/error/blank)
ls -lh /tmp/lee-spec-kit/pr-assets/ui-1.png
# macOS: open /tmp/lee-spec-kit/pr-assets/ui-1.png
# Linux: xdg-open /tmp/lee-spec-kit/pr-assets/ui-1.png

# (recommended) stop the dev server you started for screenshots
kill \"$DEV_PID\" >/dev/null 2>&1 || true
```

```bash
# Upload to Release assets and generate the URL to paste into the PR body
# - If `.lee-spec-kit.json` has `pr.screenshots.upload: false`, skip this section.
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
SAFE_BRANCH=$(git branch --show-current | tr '/' '-')
TAG="pr-assets/${SAFE_BRANCH}"

gh release view "$TAG" >/dev/null 2>&1 || \
  gh release create "$TAG" --prerelease --title "pr-assets: ${SAFE_BRANCH}" --notes ""

gh release upload "$TAG" /tmp/lee-spec-kit/pr-assets/* --clobber

echo \"![](https://github.com/${REPO}/releases/download/${TAG}/ui-1.png)\"
```

#### Logic/structure changes (Backend PR)

- Write a Mermaid **`sequenceDiagram`** in the PR body and keep it aligned with the generated body template format.

### 4. Request User Approval + Move to `Ready`

> 🚨 **User Approval Required**

Before creating PR, share the following **in a code block** and wait for **explicit approval (OK)**:

- Title
- Full body template (from `pr.md`)
- Labels (at least 1; cannot be empty)

Before approval/create, refine `pr.md` Changes/Tests sections based on actual work.
After approval, set `pr.md` status to `Ready`.

### 5. Create PR (when `pr.md` is `Ready`)

```bash
gh pr create \
  --title "feat(#{issue-number}): {feature} ({short description})" \
  --body-file /tmp/pr-body.md \
  --label "{label1,label2}" \
  --assignee @me \
  --base main

# Or via lee-spec-kit helper (requires explicit confirmation)
npx lee-spec-kit github pr F001 --create --confirm OK --labels enhancement
```

After creation:
- record created PR link into `pr.md` and `tasks.md`
- record/keep PR status as `Review`
- set `pr.md` status to `Opened`

---

## Important Notes

### Link Format

Use **current branch name** for file links in PR body:

```markdown
[filename](https://github.com/{owner}/{repo}/blob/{branch-name}/path/to/file)
```

> ⚠️ `main` branch links will return 404 until merged!

---

## Code Review Modification Guidelines

> 📋 **Criteria for deciding whether to add a task when modifications are needed from review feedback**

### No task needed (Minor changes)

- Typo/code style fixes
- Variable/function name changes
- Comment additions/modifications
- Lint error fixes

### Task needed (Major changes)

- Logic/algorithm changes
- New file/function additions
- API signature changes
- Test case additions
- Requires changes to spec.md or plan.md

---

## Reference Documents

- **Body template generator**: `npx lee-spec-kit github pr <feature-name>`
- **Approval rule**: share title/body/labels first, then run `--create --confirm OK`
- **Execution-state SSOT**: `docs/features/.../<feature>/pr.md`
