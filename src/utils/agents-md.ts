import fs from 'fs-extra';

export const LEE_SPEC_KIT_AGENTS_BEGIN = '<!-- lee-spec-kit:begin -->';
export const LEE_SPEC_KIT_AGENTS_END = '<!-- lee-spec-kit:end -->';

type DocsRepoMode = 'embedded' | 'standalone';

// Canonical lee-spec-kit project-scoped agent workflow instructions.
const CANONICAL_LEE_SPEC_KIT_AGENTS_TEXT = `Use lee-spec-kit workflow only when explicitly detected.

Detection gate (always first):

1. Run \`npx lee-spec-kit detect --json\`
2. Apply lee-spec-kit rules only if:
   - \`status === "ok"\` AND
   - \`isLeeSpecKitProject === true\`

If detection is false or unusable (\`status !== "ok"\` / parse fail / command fail):

- Skip all lee-spec-kit-specific instructions and commands for this workspace.
- Continue with normal non-lee-spec-kit workflow.

Session doc cache rule:

- Keep an in-session cache of read docs (key: doc \`id\` or exact \`requiredDocs[*].command\`).
- If a required doc is already read in this session, do not re-run the same doc command.
- Re-run only when refresh conditions are met.

On session start OR after context compression/reset:

1. Run \`npx lee-spec-kit detect --json\`
2. If detected, run \`npx lee-spec-kit docs get agents --json\` once
3. If work is already in progress, run \`npx lee-spec-kit context --json-compact\` immediately (use \`--json\` only when full-detail debugging fields are required)
4. From both outputs, follow \`requiredDocs[*].command\` only for docs not yet read in this session
5. Complete unread required docs before taking any action

Before doing any task:

1. Run \`npx lee-spec-kit detect --json\`
2. If detected, run \`npx lee-spec-kit context --json-compact\` first (use \`--json\` only when full-detail debugging fields are required)
3. Follow \`requiredDocs[*].command\` only for docs not yet read in this session
4. Do not re-run \`npx lee-spec-kit docs get agents --json\` by default
5. Re-run \`npx lee-spec-kit docs get agents --json\` only when:
   - session start/reset happened, or
   - user explicitly requested policy refresh, or
   - \`npx lee-spec-kit update\` was run, or
   - policy/config changed
6. Re-run a previously read \`requiredDocs[*].command\` only when:
   - session start/reset happened, or
   - user explicitly requested refresh, or
   - policy/config changed, or
   - \`context --json-compact\` (or \`context --json\`) returns a new required doc command not in the current session cache

Auto-run continuity (main/sub-agent orchestration):

- CLI is the state source (\`context\`/\`flow\`), not a sub-agent manager.
- Main agent may delegate execution to sub-agents, but main agent owns pause/resume and approval boundaries.
- After context compression/reset, do not ask the user to reconfirm the last command by default.
- Resume priority after compression/reset:
  1. If latest \`flow --json-compact\` (or \`flow --json\`) output includes \`autoRun.run.resumeCommand\`, run that first.
  2. Else if it includes \`autoRun.resume.flowCommand\`, run that.
  3. Else run \`npx lee-spec-kit context --json-compact\` (fallback: \`--json\`) and continue from current \`actionOptions\`/\`autoRun\`.
- Pause and report to user only when:
  - \`approvalRequest.required === true\`, or
  - \`autoRun.reasonCode\` is \`AUTO_GATE_REACHED\`, \`AUTO_DELEGATED_HANDOFF\`, or \`AUTO_MANUAL_REQUIRED\`, or
  - command execution fails (non-zero/error), or
  - user explicitly asks to pause.

User-facing output rule (state-aware):

- Treat approval as a separate state.
- Approval-waiting state means:
  - \`context --json-compact\` (or \`context --json\`) includes one or more \`actionOptions\`, and
  - you are explicitly waiting for user approval before execution.

In approval-waiting state:

1. Show \`actionOptions[*].approvalPrompt\` lines (at minimum, the primary label line like \`A: ...\`) exactly as provided.
2. End with \`approvalRequest.finalPrompt\` exactly as provided.
3. Do not paraphrase or omit these lines.
4. Prefer \`approvalRequest.userFacingLines\` as the source for user-facing approval text.
5. Prefer \`matchedFeature.currentSubstateOwner\` plus \`agentOrchestration.subAgentHandoff\` as the delegation SSOT.
6. When \`matchedFeature.currentSubstateOwner="subagent"\` and \`agentOrchestration.subAgentHandoff.required=true\` with \`mode="command"\`, call \`spawn_agent\` first and do not execute the delegated command directly from the main agent. If the delegated command is handoff-only, continue the delegated work immediately and do not re-open the same approval label.

In non-approval state (progress updates, analysis, tool execution logs, unrelated Q&A):

- Do NOT append \`approvalRequest.finalPrompt\`.
- Do NOT ask for \`<LABEL>\` / \`<LABEL> OK\`.
- Do NOT show labels unless the user asked for current options.

If approval is still pending after answering an unrelated question:

- First answer the question.
- Then re-open approval using both:
  - \`actionOptions[*].approvalPrompt\` (label meaning included), and
  - \`approvalRequest.finalPrompt\` (format line).
- Never output \`finalPrompt\` alone without the matching \`A: ...\` prompt.`;

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
