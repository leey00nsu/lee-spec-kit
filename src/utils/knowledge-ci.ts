import { OPENWIKI_VERSION } from './openwiki-policy.js';

const CHECKOUT_ACTION =
  'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5';
const SETUP_NODE_ACTION =
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';

/**
 * Return a portable guard that rejects generator writes outside its documented
 * surface. NUL-delimited Git output keeps spaces, non-ASCII names, and renames
 * unambiguous.
 */
export function buildKnowledgeScopeGuardScript(): string {
  return `node <<'NODE'
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const read = (args) => execFileSync('git', args, { encoding: 'buffer' })
  .toString('utf8')
  .split('\\0')
  .filter(Boolean);
const paths = new Set([
  ...read(['diff', '--name-only', '-z']),
  ...read(['diff', '--cached', '--name-only', '-z']),
  ...read(['ls-files', '--others', '--exclude-standard', '-z']),
]);
const allowed = (file) => file === 'openwiki' || file.startsWith('openwiki/') || file === 'AGENTS.md' || file === 'CLAUDE.md';
const unexpected = [...paths].filter((file) => !allowed(file));
const withoutManagedBlock = (value) => value.replace(/<!-- OPENWIKI:START -->[\\s\\S]*?<!-- OPENWIKI:END -->/gu, '').trimEnd();
for (const file of ['AGENTS.md', 'CLAUDE.md']) {
  if (!paths.has(file)) continue;
  let baseline = '';
  try { baseline = execFileSync('git', ['show', 'HEAD:' + file], { encoding: 'utf8' }); }
  catch { /* A newly created managed file is allowed. */ }
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (withoutManagedBlock(baseline) !== withoutManagedBlock(current)) unexpected.push(file);
}
if (unexpected.length > 0) {
  console.error('OpenWiki changed paths outside its documented output surface or outside a managed agent block:');
  for (const file of unexpected) console.error(file);
  process.exit(1);
}
NODE`;
}

/** Validate the complete pull-request diff of an existing Knowledge branch. */
export function buildKnowledgeBranchScopeGuardScript(): string {
  return `node <<'NODE'
const { execFileSync } = require('node:child_process');
const spec = process.env.KNOWLEDGE_DIFF_SPEC;
if (!spec) throw new Error('KNOWLEDGE_DIFF_SPEC is required');
const paths = execFileSync('git', ['diff', '--name-only', '-z', spec], { encoding: 'buffer' })
  .toString('utf8')
  .split('\\0')
  .filter(Boolean);
const allowed = (file) => file === 'openwiki' || file.startsWith('openwiki/') || file === 'AGENTS.md' || file === 'CLAUDE.md';
const unexpected = paths.filter((file) => !allowed(file));
const withoutManagedBlock = (value) => value.replace(/<!-- OPENWIKI:START -->[\\s\\S]*?<!-- OPENWIKI:END -->/gu, '').trimEnd();
const [base, head] = spec.split('...');
if (!base || !head) throw new Error('KNOWLEDGE_DIFF_SPEC must be a three-dot range');
const mergeBase = execFileSync('git', ['merge-base', base, head], { encoding: 'utf8' }).trim();
const show = (revision, file) => {
  try { return execFileSync('git', ['show', revision + ':' + file], { encoding: 'utf8' }); }
  catch { return ''; }
};
for (const file of ['AGENTS.md', 'CLAUDE.md']) {
  if (!paths.includes(file)) continue;
  if (withoutManagedBlock(show(mergeBase, file)) !== withoutManagedBlock(show(head, file))) unexpected.push(file);
}
if (unexpected.length > 0) {
  console.error('The existing Knowledge branch contains changes outside the allowed documentation surface or a managed agent block:');
  for (const file of unexpected) console.error(file);
  process.exit(1);
}
NODE`;
}

/**
 * A clean OpenWiki check refreshes bookkeeping even when it changes no wiki
 * knowledge. Keep that check, but avoid publishing its timestamp as a PR.
 * Unknown or invalid history is deliberately treated as publishable work.
 */
export function buildKnowledgeNoopPublicationScript(): string {
  return `node <<'NODE'
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const source = process.env.SOURCE_SHA;
const completed = process.env.OPENWIKI_OUTCOME === 'success' &&
  process.env.OPENWIKI_COMPLETE === 'true' &&
  process.env.SOURCE_CURRENT === 'true';
const git = (args) => execFileSync('git', args, { encoding: 'buffer' });
const paths = (args) => git(args).toString('utf8').split('\\0').filter(Boolean);
const managedBlock = /<!-- OPENWIKI:START -->[\\s\\S]*?<!-- OPENWIKI:END -->/gu;
const withoutManagedBlock = (value) => value.replace(managedBlock, '').trimEnd();
const show = (revision, file) => {
  try { return git(['show', revision + ':' + file]).toString('utf8'); }
  catch { return undefined; }
};
let skip = false;
try {
  if (completed && /^[0-9a-f]{40,64}$/u.test(source) &&
      !fs.existsSync('openwiki/.run.json')) {
    const previous = JSON.parse(show('HEAD', 'openwiki/.last-update.json'));
    const previousHead = previous.gitHead;
    const current = JSON.parse(fs.readFileSync('openwiki/.last-update.json', 'utf8'));
    if (previous.status === 'complete' &&
        /^[0-9a-f]{40,64}$/u.test(previousHead) &&
        current.status === 'complete' && current.gitHead === source) {
      git(['merge-base', '--is-ancestor', previousHead, source]);
      const outputChanged = paths(['diff', '--cached', '--name-only', '-z', '--'])
        .some((file) => file !== 'openwiki/.last-update.json' &&
          file !== 'openwiki/.page-manifest.json');
      const sourceChanged = paths(['diff', '--name-only', '-z',
        previousHead + '..' + source, '--']).some((file) => {
        if (file === 'openwiki/INSTRUCTIONS.md' ||
            file === 'openwiki/.langsmith.json') return true;
        if (file === 'openwiki' || file.startsWith('openwiki/')) return false;
        if (file === 'AGENTS.md' || file === 'CLAUDE.md') {
          return withoutManagedBlock(show(previousHead, file)) !==
            withoutManagedBlock(show(source, file));
        }
        return true;
      });
      skip = !outputChanged && !sourceChanged;
    }
  }
} catch (error) {
  console.error('Could not prove an OpenWiki publication no-op:', error.message);
}
process.stdout.write(skip ? 'true' : 'false');
NODE`;
}

/**
 * Scaffold repository-owned OpenWiki CI.
 *
 * lee-spec-kit installs pinned tools and writing guidance. OpenWiki owns the
 * generation command, durable page queue, retries, validation, and status.
 * GitHub Actions checks the completion checkpoint before marking a PR ready.
 */
export function buildKnowledgeWorkflow(
  baseBranch: string,
  lang: string,
  version: string,
  options: { autoMerge?: boolean } = {}
): string {
  if (
    !/^[a-zA-Z0-9._/-]+$/u.test(baseBranch) ||
    !['ko', 'en'].includes(lang) ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u.test(version)
  ) {
    throw new Error(
      'Unsupported workflow branch, language, or toolkit version.'
    );
  }

  const knowledgeBranch = `lee-spec-kit/knowledge-${baseBranch.replaceAll('/', '-')}`;
  const scopeGuard = buildKnowledgeScopeGuardScript()
    .split('\n')
    .map((line) => `          ${line}`)
    .join('\n');
  const branchScopeGuard = buildKnowledgeBranchScopeGuardScript()
    .split('\n')
    .map((line) => `          ${line}`)
    .join('\n');
  const noopPublication = buildKnowledgeNoopPublicationScript()
    .split('\n')
    .map((line) => `          ${line}`)
    .join('\n');
  const autoMergeStep = options.autoMerge
    ? `      - name: Enable auto-merge for a complete Knowledge PR
        if: \${{ !cancelled() && steps.publish.outputs.healthy == 'true' && steps.publish.outputs.pr_number != '' }}
        env:
          GH_TOKEN: \${{ secrets.OPENWIKI_PR_TOKEN }}
          PR_NUMBER: \${{ steps.publish.outputs.pr_number }}
          PR_HEAD_SHA: \${{ steps.publish.outputs.head_sha }}
        run: gh pr merge --auto --squash --match-head-commit "$PR_HEAD_SHA" "$PR_NUMBER"
`
    : '';
  const autoMergeTrigger = options.autoMerge
    ? `  pull_request:
    branches:
      - '${baseBranch}'
`
    : '';
  const autoMergeVerifyJob = options.autoMerge
    ? `  verify-knowledge-pr:
    name: Knowledge PR safety
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Accept unrelated pull requests
        run: echo 'Knowledge-specific checks run only for the managed Knowledge branch.'
      - name: Require a repository-owned Knowledge branch
        if: \${{ github.event.pull_request.head.ref == '${knowledgeBranch}' }}
        env:
          PR_HEAD_REPO: \${{ github.event.pull_request.head.repo.full_name }}
        run: test "$PR_HEAD_REPO" = "$GITHUB_REPOSITORY"
      - uses: ${CHECKOUT_ACTION} # v4
        if: \${{ github.event.pull_request.head.ref == '${knowledgeBranch}' }}
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
          persist-credentials: false
      - name: Validate the completed Knowledge pull request
        if: \${{ github.event.pull_request.head.ref == '${knowledgeBranch}' }}
        env:
          PR_BASE_SHA: \${{ github.event.pull_request.base.sha }}
          PR_HEAD_SHA: \${{ github.event.pull_request.head.sha }}
        run: |
          git merge-base --is-ancestor "$PR_BASE_SHA" "$PR_HEAD_SHA"
          export KNOWLEDGE_DIFF_SPEC="$PR_BASE_SHA...$PR_HEAD_SHA"
${branchScopeGuard}
          node <<'NODE'
          const fs = require('node:fs');
          const state = JSON.parse(fs.readFileSync('openwiki/.last-update.json', 'utf8'));
          if (state.status !== 'complete' || state.gitHead !== process.env.PR_BASE_SHA ||
              fs.existsSync('openwiki/.run.json')) {
            console.error('Knowledge PR is incomplete or its source revision is stale.');
            process.exit(1);
          }
          NODE
`
    : '';
  const readyPrBody = options.autoMerge
    ? `OpenWiki completed against the current ${baseBranch} revision. Auto-merge waits for the required branch checks.`
    : `OpenWiki completed against the current ${baseBranch} revision. Review the generated documentation before merging.`;

  return `# Generated by lee-spec-kit from the OpenWiki CI usage pattern.
# OpenWiki owns generation and incremental update behavior. This workflow only
# schedules it, preserves completed pages, and opens a reviewable PR.
name: Scheduled OpenWiki Knowledge
on:
  schedule:
    - cron: '17 3 * * *'
  workflow_dispatch:
${autoMergeTrigger}permissions:
  contents: write
  pull-requests: write
concurrency:
  group: openwiki-knowledge-${baseBranch}
  cancel-in-progress: false
jobs:
  knowledge:
${options.autoMerge ? "    if: ${{ github.event_name != 'pull_request' }}\n" : ''}    runs-on: ubuntu-latest
    env:
      KNOWLEDGE_BRANCH: ${knowledgeBranch}
    steps:
      - uses: ${CHECKOUT_ACTION} # v4
        with:
          ref: '${baseBranch}'
          fetch-depth: 0
          persist-credentials: true
          token: \${{ secrets.OPENWIKI_PR_TOKEN }}
      - uses: ${SETUP_NODE_ACTION} # v4
        with:
          node-version: '22'
      - name: Record the source revision
        run: echo "SOURCE_SHA=$(git rev-parse HEAD)" >> "$GITHUB_ENV"
      - name: Set the OpenWiki configuration directory
        run: echo "OPENWIKI_CONFIG_DIR=$RUNNER_TEMP/openwiki-config" >> "$GITHUB_ENV"
      - name: Install OpenWiki and the optional writing-policy bundle
        run: npm install --global openwiki@${OPENWIKI_VERSION} lee-spec-kit@${version}
      - name: Restore the OpenWiki working checkpoint
        run: |
          if git ls-remote --exit-code --heads origin "refs/heads/$KNOWLEDGE_BRANCH" >/dev/null 2>&1; then
            instructions="$RUNNER_TEMP/INSTRUCTIONS.md"
            if [ -f openwiki/INSTRUCTIONS.md ]; then cp openwiki/INSTRUCTIONS.md "$instructions"; fi
            git fetch origin "refs/heads/$KNOWLEDGE_BRANCH:refs/remotes/origin/$KNOWLEDGE_BRANCH"
            if git cat-file -e "refs/remotes/origin/$KNOWLEDGE_BRANCH:openwiki" 2>/dev/null; then
              rm -rf openwiki
              git restore --source="refs/remotes/origin/$KNOWLEDGE_BRANCH" --worktree --staged -- openwiki
            fi
            if [ -f "$instructions" ]; then cp "$instructions" openwiki/INSTRUCTIONS.md; fi
          fi
      - name: Install the lee-spec-kit writing skill for OpenWiki
        run: |
          toolkit="$(npm root --global)/lee-spec-kit/resources/openwiki-skills/lee-spec-kit-technical-writing"
          target="$OPENWIKI_CONFIG_DIR/skills/lee-spec-kit-technical-writing"
          test -f "$toolkit/SKILL.md"
          mkdir -p "$(dirname "$target")"
          cp -R "$toolkit" "$target"
      - name: Generate Knowledge with OpenWiki
        id: openwiki
        continue-on-error: true
        env:
          OPENWIKI_PROVIDER: openai
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
        run: openwiki code --update --print --language ${lang}
      - name: Check OpenWiki completion metadata
        id: completion
        if: \${{ !cancelled() }}
        run: |
          completion="$(node -e '
            const fs = require("node:fs");
            try {
              const state = JSON.parse(fs.readFileSync("openwiki/.last-update.json", "utf8"));
              process.stdout.write(String(state.status === "complete" && state.gitHead === process.env.SOURCE_SHA && !fs.existsSync("openwiki/.run.json")));
            } catch {
              process.stdout.write("false");
            }
          ')"
          echo "complete=$completion" >> "$GITHUB_OUTPUT"
          if [ "$completion" != true ]; then
            echo '::warning::OpenWiki did not record a complete update for this source revision. Keeping the Knowledge checkpoint as a draft.'
          fi
      - name: Remove transient OpenWiki run context
        if: \${{ !cancelled() }}
        run: |
          if [ -e openwiki/.run.json ]; then rm -- openwiki/.run.json; fi
      - name: Ensure OpenWiki changed only its documented output surface
        if: \${{ !cancelled() }}
        run: |
${scopeGuard}
      - name: Check whether the source branch advanced
        id: source
        run: |
          git fetch origin '${baseBranch}:refs/remotes/origin/${baseBranch}'
          current="$(git rev-parse 'refs/remotes/origin/${baseBranch}')"
          if [ "$current" = "$SOURCE_SHA" ]; then
            echo 'current=true' >> "$GITHUB_OUTPUT"
          else
            echo 'current=false' >> "$GITHUB_OUTPUT"
            echo "::warning::${baseBranch} advanced from $SOURCE_SHA to $current while OpenWiki was running. The partial result will remain a draft checkpoint; the next run will reconcile it."
          fi
      - name: Publish the OpenWiki checkpoint pull request
        id: publish
        env:
          GH_TOKEN: \${{ secrets.OPENWIKI_PR_TOKEN }}
          OPENWIKI_OUTCOME: \${{ steps.openwiki.outcome }}
          OPENWIKI_COMPLETE: \${{ steps.completion.outputs.complete }}
          SOURCE_CURRENT: \${{ steps.source.outputs.current }}
        run: |
          git add -A -- openwiki
          for file in AGENTS.md CLAUDE.md; do
            if [ -e "$file" ] || git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
              git add -A -- "$file"
            fi
          done
          previous=""
          generated=""
          pushed=false
          baseline="refs/remotes/origin/$KNOWLEDGE_BRANCH"
          if git show-ref --verify --quiet "$baseline"; then
            previous="$(git rev-parse "$baseline")"
          fi

          changed=true
          branch_scope_valid=true
          if [ -n "$previous" ]; then
            export KNOWLEDGE_DIFF_SPEC="refs/remotes/origin/${baseBranch}...$baseline"
            if ! (
${branchScopeGuard}
            ); then
              branch_scope_valid=false
              echo '::warning::The existing Knowledge branch will be rebuilt from the current base to remove out-of-scope changes.'
            fi
          fi
          if [ -n "$previous" ] && [ "$branch_scope_valid" = true ]; then
            if git diff --cached --quiet "$baseline" -- openwiki AGENTS.md CLAUDE.md; then changed=false; fi
          elif [ -z "$previous" ] && git diff --cached --quiet; then
            changed=false
          fi

          healthy=false
          if [ "$OPENWIKI_OUTCOME" = success ] && [ "$OPENWIKI_COMPLETE" = true ] && [ "$SOURCE_CURRENT" = true ]; then healthy=true; fi

          # A complete, source-stable check may refresh only OpenWiki's run
          # metadata. Keep the validation result without creating a daily PR.
          publication_noop="$(
${noopPublication}
          )"

          was_ready=false
          pr_number=''
          restore_publication() {
            code="$1"
            set +e
            branch_restored=true
            if [ "$pushed" = true ] && [ -n "$previous" ]; then
              git push --force-with-lease="refs/heads/$KNOWLEDGE_BRANCH:$generated" origin "$previous:refs/heads/$KNOWLEDGE_BRANCH" || branch_restored=false
            elif [ "$pushed" = true ]; then
              git push --force-with-lease="refs/heads/$KNOWLEDGE_BRANCH:$generated" --delete origin "$KNOWLEDGE_BRANCH" || branch_restored=false
            fi
            if [ "$was_ready" = true ] && [ "$branch_restored" = true ] && [ -n "$pr_number" ]; then
              gh pr ready "$pr_number" >/dev/null || true
            fi
            exit "$code"
          }
          on_publication_error() {
            code="$?"
            echo 'Knowledge publication failed; restoring the previous branch and PR state.' >&2
            restore_publication "$code"
          }
          trap on_publication_error ERR

          # A branch is never updated while its PR is ready. This closes the
          # auto-merge race before any incomplete or stale commit is pushed.
          set +e
          api_code=0
          pr_json="$(gh pr list --head "$KNOWLEDGE_BRANCH" --base '${baseBranch}' --state open --json number,url,isDraft --jq '.[0] // empty')"
          api_code=$?
          if [ "$api_code" -eq 0 ] && [ -n "$pr_json" ]; then
            pr_number="$(printf '%s' "$pr_json" | jq -r '.number')"
            is_draft="$(printf '%s' "$pr_json" | jq -r '.isDraft')"
            if [ "$is_draft" != true ]; then
              gh pr ready --undo "$pr_number" >/dev/null
              api_code=$?
              if [ "$api_code" -eq 0 ]; then
                was_ready=true
                pr_json="$(gh pr view "$pr_number" --json number,url,isDraft)"
                api_code=$?
              fi
            fi
          fi
          set -e
          if [ "$api_code" -ne 0 ]; then
            echo 'Could not make the existing Knowledge pull request safe before publication; the branch was not changed.' >&2
            restore_publication "$api_code"
          fi

          if [ "$healthy" = true ] && [ "$publication_noop" = true ] &&
             [ -z "$pr_json" ] && [ "$branch_scope_valid" = true ] &&
             { [ -z "$previous" ] || git merge-base --is-ancestor "$previous" "$SOURCE_SHA"; }; then
            echo 'OpenWiki completed with no publishable source or documentation change.'
            echo 'changed=false' >> "$GITHUB_OUTPUT"
            echo 'healthy=true' >> "$GITHUB_OUTPUT"
            echo 'pr_number=' >> "$GITHUB_OUTPUT"
            echo 'head_sha=' >> "$GITHUB_OUTPUT"
            exit 0
          fi

          if [ "$changed" = true ]; then
            git config user.name 'OpenWiki'
            git config user.email 'openwiki@users.noreply.github.com'
            git switch -C "$KNOWLEDGE_BRANCH"
            if ! git diff --cached --quiet; then
              git commit -m 'docs: refresh OpenWiki Knowledge'
            fi
            generated="$(git rev-parse HEAD)"
            if [ -n "$previous" ]; then
              git push --force-with-lease="refs/heads/$KNOWLEDGE_BRANCH:$previous" origin "HEAD:refs/heads/$KNOWLEDGE_BRANCH"
            else
              git push --force-with-lease="refs/heads/$KNOWLEDGE_BRANCH:" origin "HEAD:refs/heads/$KNOWLEDGE_BRANCH"
            fi
            pushed=true
          elif [ -n "$previous" ]; then
            generated="$previous"
          fi

          # Recheck after the potentially slow commit and push before making a
          # PR review-ready. A moving base leaves the checkpoint as a draft.
          git fetch origin '${baseBranch}:refs/remotes/origin/${baseBranch}'
          if [ "$(git rev-parse 'refs/remotes/origin/${baseBranch}')" != "$SOURCE_SHA" ]; then healthy=false; fi
          if [ "$healthy" = true ]; then
            title='docs: refresh OpenWiki Knowledge'
            body='${readyPrBody}'
          else
            title='docs: checkpoint incomplete OpenWiki Knowledge'
            body='OpenWiki did not complete against the current ${baseBranch} revision. This draft preserves completed pages as input for the next scheduled execution. Transient run context is deliberately excluded. Do not merge it while it remains a draft.'
          fi

          set +e
          base_tip="$(git rev-parse 'refs/remotes/origin/${baseBranch}')"
          branch_has_diff=false
          if [ -n "$generated" ] && [ "$generated" != "$base_tip" ] && ! git merge-base --is-ancestor "$generated" "$base_tip"; then
            branch_has_diff=true
          fi
          if [ "$api_code" -eq 0 ] && [ "$branch_has_diff" != true ] && [ -n "$pr_json" ]; then
            pr_number="$(printf '%s' "$pr_json" | jq -r '.number')"
            gh pr close "$pr_number" >/dev/null
            api_code=$?
            if [ "$api_code" -eq 0 ]; then pr_json=''; pr_number=''; fi
          fi
          if [ "$api_code" -eq 0 ] && [ -z "$pr_json" ] && [ "$branch_has_diff" = true ]; then
              pr_url="$(gh pr create --head "$KNOWLEDGE_BRANCH" --base '${baseBranch}' --title "$title" --body "$body" --draft)"
              api_code=$?
              if [ "$api_code" -eq 0 ]; then
                pr_json="$(gh pr view "$pr_url" --json number,url,isDraft)"
                api_code=$?
              fi
          fi
          if [ "$api_code" -eq 0 ] && [ -n "$pr_json" ]; then
            pr_number="$(printf '%s' "$pr_json" | jq -r '.number')"
            is_draft="$(printf '%s' "$pr_json" | jq -r '.isDraft')"
            gh api --method PATCH "repos/$GITHUB_REPOSITORY/pulls/$pr_number" -f title="$title" -f body="$body" >/dev/null
            api_code=$?
            if [ "$api_code" -eq 0 ] && [ "$healthy" = true ]; then
              git fetch origin '${baseBranch}:refs/remotes/origin/${baseBranch}'
              if [ "$(git rev-parse 'refs/remotes/origin/${baseBranch}')" = "$SOURCE_SHA" ]; then
                gh pr ready "$pr_number" >/dev/null
                api_code=$?
              else
                healthy=false
                title='docs: checkpoint incomplete OpenWiki Knowledge'
                body='The source branch advanced before publication completed. This draft preserves completed pages as input for the next scheduled execution. Transient run context is deliberately excluded. Do not merge it while it remains a draft.'
                gh api --method PATCH "repos/$GITHUB_REPOSITORY/pulls/$pr_number" -f title="$title" -f body="$body" >/dev/null
                api_code=$?
              fi
            fi
          fi
          set -e

          if [ "$api_code" -ne 0 ]; then
            echo 'Pull-request publication failed; restoring the previous Knowledge branch and PR state.' >&2
            restore_publication "$api_code"
          fi
          trap - ERR
          echo "changed=$changed" >> "$GITHUB_OUTPUT"
          echo "healthy=$healthy" >> "$GITHUB_OUTPUT"
          echo "pr_number=$pr_number" >> "$GITHUB_OUTPUT"
          echo "head_sha=$generated" >> "$GITHUB_OUTPUT"
${autoMergeStep}      - name: Propagate an incomplete OpenWiki result
        if: \${{ !cancelled() && steps.publish.outputs.healthy != 'true' }}
        run: |
          echo 'OpenWiki remains incomplete. Completed pages and diagnostics are preserved without publishing transient run context.' >&2
          exit 1
${autoMergeVerifyJob}
`;
}
