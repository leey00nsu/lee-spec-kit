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
5. Do not start implementation unless \`stage === "implementation"\` and \`implementationAllowed === true\`
6. Treat stages before implementation as hard gates:
   - spec / plan / tasks approvals
   - issue preparation / issue creation
   - branch creation
7. Keep docs and code synchronized; if code changes materially, update the active feature docs in the same turn before stopping
8. When docs are synced to code, refresh an explicit marker like \`<!-- lee-spec-kit:workflow-sync 2026-04-16T12:34:56.789Z -->\` in the active feature docs (prefer \`tasks.md\` or \`decisions.md\`) so \`workflow-audit\` can prove the sync happened after the latest code change

Approval and remote actions:

- Ask the user for approval only at documented workflow approval boundaries or before remote/destructive actions
- If \`workflow-stage --json\` reports \`approvalRequired === true\`, stop at that boundary and ask the user before proceeding
- Before \`git commit\`, prefer \`npx lee-spec-kit commit-audit --json\` when hooks or manual checks need commit-time docs path enforcement
- Before remote GitHub actions, share the plan or artifact being sent
- Respect repo policy from docs and config first; hooks only enforce guardrails and continuation checks

Validation:

- Prefer \`npx lee-spec-kit commit-audit --json\` for commit-time staged docs path validation
- Prefer \`npx lee-spec-kit workflow-audit --json\` as the default docs-sync validator for Codex hooks and end-of-turn checks; it expects the active feature docs to carry a fresh \`lee-spec-kit:workflow-sync\` marker after meaningful code/doc sync
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
