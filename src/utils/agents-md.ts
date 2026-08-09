import fs from 'fs-extra';

export const LEE_SPEC_KIT_AGENTS_BEGIN = '<!-- lee-spec-kit:begin -->';
export const LEE_SPEC_KIT_AGENTS_END = '<!-- lee-spec-kit:end -->';

type DocsRepoMode = 'embedded' | 'standalone';

// Canonical lee-spec-kit project-scoped agent workflow instructions.
const CANONICAL_LEE_SPEC_KIT_AGENTS_TEXT = `Use lee-spec-kit docs and workflow policy only when explicitly detected.

Detection gate:

1. Run \`npx lee-spec-kit detect --json\`
2. Apply lee-spec-kit rules only when \`status === "ok"\` and \`isLeeSpecKitProject === true\`
3. If detection fails or returns false, skip these instructions and continue with the normal non-lee-spec-kit workflow

Default runtime path:

- Prefer Codex native execution with workspace-scoped AGENTS.md plus official hooks for the default runtime path.
- Treat lee-spec-kit as the docs schema, workflow policy, and validation toolkit.
- If the user gives a generic request such as continuing the next feature according to the rules, interpret it through this workflow automatically.
- Infer the workflow automatically even for generic rule-following requests.
- Avoid launching the first \`npx lee-spec-kit ...\` calls in parallel in a fresh environment; let one initial command finish so the npx cache install does not race.

On session start or after context compression/reset:

1. Run \`npx lee-spec-kit detect --json\`
2. If detected, run \`npx lee-spec-kit docs get agents --json\` once
3. Read any unread \`requiredDocs[*].command\` from that output
4. Cache built-in docs per session and only re-read them when the user explicitly asks for a policy refresh, \`npx lee-spec-kit update\` changed the policy, or the session restarted

Before taking the next workflow step:

1. Confirm the active feature from the request, docs tree, issue/PR context, or the most recently active feature folder
2. Read the active feature docs as the SSOT: \`spec.md\`, \`plan.md\`, \`tasks.md\`, and \`decisions.md\`
3. When relevant, also read \`issue.md\` and \`pr.md\`
4. Run \`npx lee-spec-kit workflow-stage <feature-ref> --json\` and follow only the returned \`nextAction\`
5. If \`workflow-stage --json\` returns \`primaryActionLabel\` and \`actionOptions\`, treat \`primaryActionLabel\` as the default option label and present the exact \`actionOptions[*].reply\` tokens to the user before continuing
6. Do not start implementation unless \`stage === "implementation"\` and \`implementationAllowed === true\`
7. Treat stages before implementation as hard gates:
   - spec approval plus plan / tasks readiness
   - issue preparation / issue creation
   - branch creation
   - task commit checkpoints after each completed task
8. In standalone mode, keep the docs repo on its docs branch and do not create feature branches or worktrees there
9. In standalone mode, use the project repo through its managed feature worktree under the shared workspace \`.worktrees/\` root instead of checking the feature branch out in the main project repo
10. In standalone mode, do not hand-write \`git worktree add\`; run the exact \`nextAction.command\` from \`workflow-stage\` so the managed workspace path, stale directory cleanup, and \`.env\` / \`.env.*\` copy step stay consistent
11. Keep docs and code synchronized; if code changes materially, update the active feature docs in the same turn before stopping
12. When docs are synced to code, keep exactly one explicit marker like \`<!-- lee-spec-kit:workflow-sync 2026-04-16T12:34:56.789Z -->\` in a single active feature doc (prefer \`tasks.md\` or \`decisions.md\`): replace an existing marker timestamp or remove duplicates instead of appending another marker, so \`workflow-audit\` can prove the sync happened after the latest code change
13. When \`workflow-stage --json\` returns \`nextAction.category === "pre_pr_review"\` and \`nextAction.executor === "subagent"\`, delegate a fresh read-only review using the returned \`model\`, \`reasoningEffort\`, and \`onUnavailable\` policy; do not select or require a named review skill
14. The Pre-PR review subagent returns findings without modifying code; the main agent remediates findings and records the actual reviewer metadata, reviewed diff scope, evidence, and final decision
15. For a local workflow, do not report completion directly after implementation approval; follow the exact returned \`local merge\` / \`local cleanup\` commands until \`workflow-stage\` proves integration, verification, and cleanup and returns \`done\`
16. In a \`local-ff\` or \`local-squash\` workflow, keep implementation approval and local merge approval distinct when \`local_merge\` is required: the first accepts the implementation, and the second authorizes the configured integration strategy, post-merge checks, and local cleanup

Approval and remote actions:

- Ask the user for approval only at documented workflow approval boundaries or before remote/destructive actions
- If \`workflow-stage --json\` reports \`approvalRequired === true\`, stop at that boundary and ask the user before proceeding
- If \`workflow-stage --json\` returns labeled \`actionOptions\` at any approval boundary, keep the same option labels and exact \`reply\` tokens in the user prompt and do not improvise different reply formats
- If \`workflow-stage --json\` reports \`nextAction.category === "task_commit"\`, make the docs commit and project commit for the just-finished task before starting the next task or moving to the next stage
- Before \`git commit\`, prefer \`npx lee-spec-kit commit-audit --json\` when hooks or manual checks need commit-time docs path enforcement
- Before remote GitHub actions, share the plan or artifact being sent
- Respect repo policy from docs and config first; hooks only enforce guardrails and continuation checks

Validation:

- Prefer \`npx lee-spec-kit commit-audit --json\` for commit-time staged docs path validation
- Prefer \`npx lee-spec-kit workflow-audit --json\` as the default docs-sync validator for Codex hooks and end-of-turn checks; it expects the active feature docs to carry one fresh \`lee-spec-kit:workflow-sync\` marker after meaningful code/doc sync

Optional UI/UX design policy:

- Only when the user request explicitly mentions a design system, UI/visual redesign, design consistency, shared UI/component-library consolidation, branding/theme/token redesign, or implementation from Figma/design images, read and apply \`npx lee-spec-kit docs get ui-ux-design --json\`
- Do not apply that policy merely because the target is web/frontend, to a non-UI/backend Feature, or to a simple bug fix unrelated to durable design rules
- Treat it as optional guidance, not a \`requiredDocs\` entry or workflow approval gate
`;

function renderManagedSegment(
  lang: 'ko' | 'en',
  docsRepo: DocsRepoMode
): string {
  // Intentionally do not localize: this block must stay aligned with the
  // project-scoped canonical agent instructions to avoid behavioral drift.
  void lang;
  void docsRepo;
  return `${LEE_SPEC_KIT_AGENTS_BEGIN}\n${CANONICAL_LEE_SPEC_KIT_AGENTS_TEXT}\n${LEE_SPEC_KIT_AGENTS_END}`;
}

function renderManagedBlock(lang: 'ko' | 'en', docsRepo: DocsRepoMode): string {
  return `${renderManagedSegment(lang, docsRepo)}\n\n`;
}

export async function upsertLeeSpecKitAgentsMd(
  filePath: string,
  options: { lang: 'ko' | 'en'; docsRepo: DocsRepoMode }
): Promise<{
  changed: boolean;
  action: 'created' | 'appended' | 'updated' | 'noop';
}> {
  const block = renderManagedBlock(options.lang, options.docsRepo);
  const segment = renderManagedSegment(options.lang, options.docsRepo);

  const exists = await fs.pathExists(filePath);
  if (!exists) {
    await fs.writeFile(filePath, block, 'utf-8');
    return { changed: true, action: 'created' };
  }

  const current = await fs.readFile(filePath, 'utf-8');
  const beginIndex = current.indexOf(LEE_SPEC_KIT_AGENTS_BEGIN);
  const endIndex = current.indexOf(LEE_SPEC_KIT_AGENTS_END);

  if (beginIndex !== -1 && endIndex !== -1 && beginIndex <= endIndex) {
    const replaceEnd = endIndex + LEE_SPEC_KIT_AGENTS_END.length;
    const next = `${current.slice(0, beginIndex)}${segment}${current.slice(replaceEnd)}`;
    if (next === current) {
      return { changed: false, action: 'noop' };
    }
    await fs.writeFile(filePath, next, 'utf-8');
    return { changed: true, action: 'updated' };
  }

  let next = current;
  if (next.length > 0 && !next.endsWith('\n')) next += '\n';
  if (next.trim().length > 0 && !next.endsWith('\n\n')) next += '\n';
  next += block;

  await fs.writeFile(filePath, next, 'utf-8');
  return { changed: true, action: 'appended' };
}
