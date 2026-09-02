import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGitCapture } from '../../utils/git-run.js';

const MANAGED_HOOK_FILENAMES = [
  '_lee_spec_kit_hook_utils.mjs',
  'session_start_lee_spec_kit.mjs',
  'subagent_start_lee_spec_kit.mjs',
  'user_prompt_submit_lee_spec_kit.mjs',
  'pre_tool_use_policy.mjs',
  'stop_workflow_audit.mjs',
] as const;

type ManagedHookFileName = (typeof MANAGED_HOOK_FILENAMES)[number];
type HookEventName =
  | 'SessionStart'
  | 'SubagentStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'Stop';

interface HookHandler {
  type: 'command';
  command: string;
  statusMessage?: string;
  timeout?: number;
}

interface HookMatcherGroup {
  matcher?: string;
  hooks: HookHandler[];
}

interface HooksConfigFile {
  hooks?: Partial<Record<HookEventName, HookMatcherGroup[]>> &
    Record<string, unknown>;
  [key: string]: unknown;
}

function getHookScriptContent(
  fileName: ManagedHookFileName,
  repoRoot: string,
  workflowRoot: string
): string {
  switch (fileName) {
    case '_lee_spec_kit_hook_utils.mjs':
      return `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function readHookInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) return { ok: true, value: {} };
    return {
      ok: true,
      value: JSON.parse(raw),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid Codex hook payload';
    return {
      ok: false,
      error: message,
    };
  }
}

const CLI_ENTRYPOINT = ${JSON.stringify(getInstalledCliEntrypoint())};
const HOOK_REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const WORKFLOW_ROOT_RELATIVE = ${JSON.stringify(
        path.relative(path.resolve(repoRoot), path.resolve(workflowRoot))
      )};

export function getWorkflowCwd() {
  return path.resolve(HOOK_REPO_ROOT, WORKFLOW_ROOT_RELATIVE);
}

export function runLeeSpecKit(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [CLI_ENTRYPOINT, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function runLeeSpecKitJson(args, cwd = process.cwd()) {
  const result = runLeeSpecKit(args, cwd);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();

  if (result.error) {
    return {
      ok: false,
      error: result.error.message || String(result.error),
      status: result.status ?? 1,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: stderr || stdout || \`lee-spec-kit \${args.join(' ')} failed\`,
      status: result.status ?? 1,
    };
  }

  if (!stdout) {
    return {
      ok: false,
      error: \`lee-spec-kit \${args.join(' ')} returned empty JSON output\`,
      status: result.status ?? 0,
    };
  }

  try {
    return {
      ok: true,
      data: JSON.parse(stdout),
      status: result.status ?? 0,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid JSON output from lee-spec-kit';
    return {
      ok: false,
      error: \`\${message}: \${stdout.slice(0, 200)}\`,
      status: result.status ?? 0,
    };
  }
}

export function printAdditionalContext(hookEventName, additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext,
      },
    })
  );
}

export function printBlock(reason) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason,
    })
  );
}
`;
    case 'session_start_lee_spec_kit.mjs':
      return `#!/usr/bin/env node
import { getWorkflowCwd, printAdditionalContext, readHookInput, runLeeSpecKitJson } from './_lee_spec_kit_hook_utils.mjs';

// Equivalent CLI probe: npx lee-spec-kit detect --json
const inputResult = readHookInput();
if (!inputResult.ok) {
  process.exit(0);
}
const input = inputResult.value;
const cwd = getWorkflowCwd();
const detectedResult = runLeeSpecKitJson(['detect', '--json'], cwd);
const detected = detectedResult.ok ? detectedResult.data : null;

if (detected?.status === 'ok' && detected?.isLeeSpecKitProject === true) {
  const docsDir = detected.docsDir || '(unknown docs dir)';
  const stageResult = runLeeSpecKitJson(['workflow-stage', '--json'], cwd);
  const lines = [
    'lee-spec-kit project detected.',
    'Use lee-spec-kit docs and workflow policy only when explicitly detected.',
    'Prefer Codex native execution with workspace-scoped AGENTS.md plus official hooks for the default runtime path.',
    'If the user gives a generic request such as continuing the next feature according to the rules, interpret it through this workflow automatically.',
    'infer the workflow automatically even for generic rule-following requests.',
    \`Docs dir: \${docsDir}\`,
    'Primary agents start by reading npx lee-spec-kit docs get agents --json and the active feature docs.',
    'Delegated subagents skip the primary-agent bootstrap and follow the exact delegationContext and workerContract returned by workflow-stage.',
    'Primary agents run npx lee-spec-kit workflow-stage --json before the next stage and only follow its nextAction.',
    'Keep docs as the SSOT and treat workflow-audit as the end-of-turn sync guard.',
  ];
  if (stageResult.ok && stageResult.data?.status === 'ok') {
    lines.push(
      \`Current workflow stage: \${stageResult.data.stage}\`,
      \`Next allowed action: \${stageResult.data.nextAction?.category || 'none'}\`,
      \`Approval required: \${stageResult.data.approvalRequired ? 'yes' : 'no'}\`,
      \`Implementation allowed: \${stageResult.data.implementationAllowed ? 'yes' : 'no'}\`
    );
    if (stageResult.data.primaryActionLabel && Array.isArray(stageResult.data.actionOptions)) {
      lines.push(
        \`Primary reply label: \${stageResult.data.primaryActionLabel}\`,
        ...stageResult.data.actionOptions.map(
          (option) => \`Option \${option.label} -> reply \${option.reply}: \${option.summary}\`
        )
      );
    }
  } else if (stageResult.ok && stageResult.data?.status === 'error') {
    lines.push(
      \`Workflow stage is unresolved: \${stageResult.data.reasonCode}\`,
      'Resolve feature selection or create/select the target feature before continuing.'
    );
  }
  printAdditionalContext('SessionStart', lines.join('\\n'));
}
`;
    case 'subagent_start_lee_spec_kit.mjs':
      return `#!/usr/bin/env node
import { getWorkflowCwd, printAdditionalContext, readHookInput, runLeeSpecKitJson } from './_lee_spec_kit_hook_utils.mjs';

const inputResult = readHookInput();
if (!inputResult.ok) {
  process.exit(0);
}
const input = inputResult.value;
const cwd = getWorkflowCwd();
const detectedResult = runLeeSpecKitJson(['detect', '--json'], cwd);
const detected = detectedResult.ok ? detectedResult.data : null;

if (detected?.status === 'ok' && detected?.isLeeSpecKitProject === true) {
  const agentType =
    typeof input.agent_type === 'string' && input.agent_type.trim()
      ? input.agent_type.trim().replace(/[\u0000-\u001f\u007f]/g, ' ')
      : 'unknown';
  const lines = [
    'lee-spec-kit delegated subagent detected.',
    \`Codex agent type/profile: \${agentType}\`,
    'Skip the primary-agent startup bootstrap: do not run detect, docs get agents, load every requiredDocs entry, or run workflow-stage.',
    'Follow the exact delegationContext and workerContract supplied by the parent agent. Read the requiredDocuments in that contract and use referenceDocuments only under their stated conditions.',
    'Do not load built-in requiredDocs, unrelated Features, or additional Feature documents outside the delegationContext. Ask the parent agent if the contract is missing or insufficient before expanding scope.',
    'The agent type/profile is informative; delegationContext, the delegation prompt, and workerContract define the exact implementation or review role and its permissions.',
    'Continue to follow applicable repository safety instructions and the explicit delegation boundaries.',
  ];
  printAdditionalContext('SubagentStart', lines.join('\\n'));
}
`;
    case 'user_prompt_submit_lee_spec_kit.mjs':
      return `#!/usr/bin/env node
import { getWorkflowCwd, printAdditionalContext, readHookInput, runLeeSpecKitJson } from './_lee_spec_kit_hook_utils.mjs';

const inputResult = readHookInput();
if (!inputResult.ok) {
  process.exit(0);
}
const input = inputResult.value;
const cwd = getWorkflowCwd();
const detectedResult = runLeeSpecKitJson(['detect', '--json'], cwd);
const detected = detectedResult.ok ? detectedResult.data : null;

if (detected?.status === 'ok' && detected?.isLeeSpecKitProject === true) {
  const stageResult = runLeeSpecKitJson(['workflow-stage', '--json'], cwd);
  const lines = [
    'This prompt is inside a lee-spec-kit workspace.',
    'Interpret generic rule-following requests through the lee-spec-kit docs workflow automatically.',
    'Primary agents prefer docs get plus feature-local docs as the primary context source.',
    'Delegated subagents follow the exact delegationContext and workerContract instead of running the primary-agent bootstrap.',
    'Primary agents use workflow-stage --json to determine the next allowed stage before implementation.',
  ];
  if (stageResult.ok && stageResult.data?.status === 'ok') {
    lines.push(
      \`Current workflow stage: \${stageResult.data.stage}\`,
      \`Next allowed action: \${stageResult.data.nextAction?.category || 'none'}\`,
      \`Approval required: \${stageResult.data.approvalRequired ? 'yes' : 'no'}\`,
      \`Implementation allowed: \${stageResult.data.implementationAllowed ? 'yes' : 'no'}\`,
      'Do not jump ahead of the reported nextAction.'
    );
    if (stageResult.data.primaryActionLabel && Array.isArray(stageResult.data.actionOptions)) {
      lines.push(
        'If labeled action options are present, keep the option labels but ask the user to reply with the exact reply token shown for that option.',
        ...stageResult.data.actionOptions.map(
          (option) => \`Option \${option.label} -> reply \${option.reply}: \${option.summary}\`
        )
      );
    }
  } else if (stageResult.ok && stageResult.data?.status === 'error') {
    lines.push(
      \`Workflow stage is unresolved: \${stageResult.data.reasonCode}\`,
      'Resolve feature selection before attempting implementation.'
    );
  }
  printAdditionalContext('UserPromptSubmit', lines.join('\\n'));
}
`;
    case 'pre_tool_use_policy.mjs':
      return `#!/usr/bin/env node
import { getWorkflowCwd, printBlock, readHookInput, runLeeSpecKitJson } from './_lee_spec_kit_hook_utils.mjs';
import fs from 'node:fs';
import path from 'node:path';

function normalizeResolvedPath(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

const inputResult = readHookInput();
if (!inputResult.ok) {
  printBlock('Codex hook input was malformed. Resolve the local hook setup before continuing.');
  process.exit(0);
}
const input = inputResult.value;
const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
const workflowCwd = getWorkflowCwd();
const command = String(input?.tool_input?.command || '').trim();

function tokenizeShellCommand(value) {
  const matches = value.match(/"(?:\\\\.|[^"])*"|'(?:\\\\.|[^'])*'|\\S+/g) || [];
  return matches.map((token) => {
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }
    return token;
  });
}

function normalizeExecutableToken(token) {
  const base = token.split(/[\\\\/]/).pop() || token;
  return base.replace(/\\.(?:bat|cmd|exe)$/i, '').toLowerCase();
}

function stripEnvWrapper(tokens) {
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) {
      index += 1;
      continue;
    }
    if (token === '--') {
      return tokens.slice(index + 1);
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token)) {
      index += 1;
      continue;
    }
    return tokens.slice(index);
  }

  return tokens;
}

function stripSudoWrapper(tokens) {
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) {
      index += 1;
      continue;
    }
    if (token === '--') {
      return tokens.slice(index + 1);
    }
    if (token === '-u' || token === '-g' || token === '-h' || token === '-p') {
      index += 2;
      continue;
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    return tokens.slice(index);
  }

  return tokens;
}

const KNOWN_SHELL_EXECUTABLES = new Set([
  'ash',
  'bash',
  'cmd',
  'dash',
  'fish',
  'ksh',
  'powershell',
  'pwsh',
  'sh',
  'zsh',
]);
const DIRECT_GIT_OR_GH_EXECUTABLES = new Set(['git', 'gh']);

function isShellCommandFlag(token) {
  const lower = token.toLowerCase();
  if (lower === '-c' || lower === '/c' || lower === '-command') {
    return true;
  }
  if (token === lower && /^-[a-z]*c[a-z]*$/.test(token)) {
    return true;
  }
  return false;
}

function isExecutablePayloadFlag(token) {
  const lower = token.toLowerCase();
  if (isShellCommandFlag(token)) {
    return true;
  }
  return lower === '-e' || lower === '-r' || lower === '--eval' || lower === '--execute';
}

function findShellCommandFlagIndex(tokens) {
  return tokens.findIndex((token, index) => index > 0 && isShellCommandFlag(token));
}

function findExecutablePayloadFlagIndex(tokens) {
  return tokens.findIndex((token, index) => index > 0 && isExecutablePayloadFlag(token));
}

function containsDangerousGitOrGhPayload(value) {
  return (
    /\\bgit(?:\\.cmd|\\.exe)?\\b[\\s\\S]{0,80}\\b(?:commit|push|checkout|switch|restore|clean|rebase|merge|cherry-pick|revert|stash|reset|branch|tag)\\b/i.test(
      value
    ) ||
    /\\bgh(?:\\.cmd|\\.exe)?\\b[\\s\\S]{0,80}\\b(?:issue|pr|repo|release)\\b/i.test(
      value
    )
  );
}

function containsProcessExecutionPayload(value) {
  return (
    /\\bchild_process\\b/i.test(value) ||
    /\\bspawn(?:Sync)?\\s*\\(/i.test(value) ||
    /\\bexec(?:Sync|FileSync|File)?\\s*\\(/i.test(value) ||
    /\\bfork\\s*\\(/i.test(value) ||
    /\\bsubprocess\\b/i.test(value) ||
    /\\bos\\.system\\s*\\(/i.test(value) ||
    /\\bsystem\\s*\\(/i.test(value) ||
    /\\bpopen\\s*\\(/i.test(value) ||
    /\\bcreateprocess\\b/i.test(value) ||
    /\\bstart-process\\b/i.test(value)
  );
}

const KNOWN_EXECUTABLE_WRAPPERS = new Set([
  'bun',
  'deno',
  'node',
  'nodejs',
  'perl',
  'php',
  'python',
  'python2',
  'python3',
  'ruby',
]);

const KNOWN_WRAPPER_LAUNCHERS = new Set(['uv', 'uvx']);

const EXECUTABLE_WRAPPER_OPTIONS_WITH_VALUE = new Set([
  '--experimental-loader',
  '--import',
  '--loader',
  '--require',
  '-m',
  '-r',
]);

const UNSUPPORTED_WRAPPER_PAYLOAD = '__LEE_SPEC_KIT_UNSUPPORTED_WRAPPER_PAYLOAD__';

function readWrapperScriptPayload(executable, tokens, rawValue, baseCwd) {
  if (KNOWN_WRAPPER_LAUNCHERS.has(executable)) {
    return UNSUPPORTED_WRAPPER_PAYLOAD;
  }

  if (!KNOWN_EXECUTABLE_WRAPPERS.has(executable)) {
    const flagIndex = findExecutablePayloadFlagIndex(tokens);
    return flagIndex === -1 || flagIndex + 1 >= tokens.length
      ? null
      : UNSUPPORTED_WRAPPER_PAYLOAD;
  }

  if (rawValue.includes('<<')) {
    return UNSUPPORTED_WRAPPER_PAYLOAD;
  }

  const flagIndex = findExecutablePayloadFlagIndex(tokens);
  if (flagIndex !== -1 && flagIndex + 1 < tokens.length) {
    return UNSUPPORTED_WRAPPER_PAYLOAD;
  }
  return resolveScriptToken(tokens) ? UNSUPPORTED_WRAPPER_PAYLOAD : null;
}

function resolveScriptToken(tokens) {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === '--') {
      return tokens[index + 1] || null;
    }
    if (token === '-') {
      return token;
    }
    if (token.startsWith('-')) {
      if (
        EXECUTABLE_WRAPPER_OPTIONS_WITH_VALUE.has(token.toLowerCase()) &&
        index + 1 < tokens.length
      ) {
        index += 1;
      }
      continue;
    }
    return token;
  }
  return null;
}

function resolvesToExistingFile(token, baseCwd) {
  if (!token || token.startsWith('-')) {
    return false;
  }

  const resolvedPath = path.resolve(baseCwd, token);
  try {
    return fs.statSync(resolvedPath).isFile();
  } catch {
    return false;
  }
}

function unwrapShellCommand(value) {
  let currentValue = value;

  for (let depth = 0; depth < 6; depth += 1) {
    const tokens = tokenizeShellCommand(currentValue);
    const executable = normalizeExecutableToken(tokens[0] || '');

    if (executable === 'sudo') {
      const stripped = stripSudoWrapper(tokens);
      currentValue = stripped.join(' ');
      continue;
    }

    if (executable === 'command' || executable === 'nohup') {
      if (tokens.length <= 1) return currentValue;
      currentValue = tokens.slice(1).join(' ');
      continue;
    }

    if (executable === 'env') {
      const stripped = stripEnvWrapper(tokens);
      currentValue = stripped.join(' ');
      continue;
    }

    if (!KNOWN_SHELL_EXECUTABLES.has(executable)) {
      return currentValue;
    }

    const flagIndex = findShellCommandFlagIndex(tokens);
    if (flagIndex === -1 || flagIndex + 1 >= tokens.length) {
      return currentValue;
    }

    currentValue = tokens.slice(flagIndex + 1).join(' ');
  }

  return currentValue;
}

function hasUnsupportedDangerousShellWrapper(value, baseCwd) {
  let currentValue = value;

  for (let depth = 0; depth < 6; depth += 1) {
    const tokens = tokenizeShellCommand(currentValue);
    const executable = normalizeExecutableToken(tokens[0] || '');

    if (executable === 'sudo') {
      currentValue = stripSudoWrapper(tokens).join(' ');
      continue;
    }

    if (executable === 'command' || executable === 'nohup') {
      if (tokens.length <= 1) return false;
      currentValue = tokens.slice(1).join(' ');
      continue;
    }

    if (executable === 'env') {
      currentValue = stripEnvWrapper(tokens).join(' ');
      continue;
    }

    if (DIRECT_GIT_OR_GH_EXECUTABLES.has(executable)) {
      return false;
    }

    const flagIndex = findExecutablePayloadFlagIndex(tokens);
    if (!KNOWN_SHELL_EXECUTABLES.has(executable)) {
      const payload = readWrapperScriptPayload(
        executable,
        tokens,
        currentValue,
        baseCwd
      );
      if (payload === UNSUPPORTED_WRAPPER_PAYLOAD) {
        return true;
      }
      if (!payload) {
        return false;
      }
      return containsDangerousGitOrGhPayload(payload) || containsProcessExecutionPayload(payload);
    }

    if (flagIndex === -1 || flagIndex + 1 >= tokens.length) {
      if (currentValue.includes('<<') || resolveScriptToken(tokens)) {
        return true;
      }
      return false;
    }

    const payload = tokens.slice(flagIndex + 1).join(' ');
    const payloadTokens = tokenizeShellCommand(payload);
    if (resolvesToExistingFile(payloadTokens[0] || '', baseCwd)) {
      return true;
    }
    currentValue = payload;
  }

  return false;
}

const GIT_OPTIONS_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--exec-path',
  '--git-dir',
  '--namespace',
  '--super-prefix',
  '--work-tree',
  '--config-env',
]);

function getGitSubcommand(value) {
  const unwrappedValue = unwrapShellCommand(value);
  const tokens = tokenizeShellCommand(unwrappedValue);
  const gitIndex = tokens.findIndex(
    (token) => normalizeExecutableToken(token) === 'git'
  );
  if (gitIndex === -1) return null;

  for (let index = gitIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === '--') {
      return tokens[index + 1] || null;
    }
    if (!token.startsWith('-')) {
      return token;
    }
    if (GIT_OPTIONS_WITH_VALUE.has(token) && index + 1 < tokens.length) {
      index += 1;
    }
  }

  return null;
}

function getGitCommandCwd(value, baseCwd) {
  const unwrappedValue = unwrapShellCommand(value);
  const tokens = tokenizeShellCommand(unwrappedValue);
  const gitIndex = tokens.findIndex(
    (token) => normalizeExecutableToken(token) === 'git'
  );
  if (gitIndex === -1) return baseCwd;

  let currentCwd = baseCwd;
  for (let index = gitIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === '--') break;
    if (!token.startsWith('-')) break;
    if (token === '-C' && index + 1 < tokens.length) {
      currentCwd = path.resolve(currentCwd, tokens[index + 1]);
      index += 1;
      continue;
    }
    if (GIT_OPTIONS_WITH_VALUE.has(token) && index + 1 < tokens.length) {
      index += 1;
    }
  }

  return currentCwd;
}

function getGitCommitMessage(value) {
  const unwrappedValue = unwrapShellCommand(value);
  const tokens = tokenizeShellCommand(unwrappedValue);
  const gitIndex = tokens.findIndex(
    (token) => normalizeExecutableToken(token) === 'git'
  );
  if (gitIndex === -1) return null;

  let sawCommit = false;
  for (let index = gitIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === '--') break;

    if (!sawCommit) {
      if (token === 'commit') {
        sawCommit = true;
        continue;
      }
      if (token.startsWith('-')) {
        if (GIT_OPTIONS_WITH_VALUE.has(token) && index + 1 < tokens.length) {
          index += 1;
        }
        continue;
      }
      break;
    }

    if (token === '-m' || token === '--message') {
      return index + 1 < tokens.length ? tokens[index + 1] : null;
    }
  }

  return null;
}

function normalizeCommandText(value) {
  return String(value || '').replace(/[ \\t\\r\\n]+/g, ' ').trim();
}

function extractLeeSpecKitFeatureRef(value) {
  const tokens = tokenizeShellCommand(value);
  const cliIndex = tokens.findIndex((token) => /(?:^|[\\\\/])lee-spec-kit(?:\\.cmd|\\.exe)?$/i.test(token));
  if (cliIndex === -1) return null;
  for (let index = cliIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token === 'npx' || token === '--yes' || token === '-y') continue;
    if (token === 'github' && tokens[index + 1] === 'issue') return tokens[index + 2] || null;
    if (token === 'github' && tokens[index + 1] === 'pr') return tokens[index + 2] || null;
    if (token === 'workflow-stage') {
      const candidate = tokens[index + 1] || null;
      return candidate && !candidate.startsWith('-') ? candidate : null;
    }
  }
  return null;
}

function extractBranchCreateTarget(value) {
  const tokens = tokenizeShellCommand(unwrapShellCommand(value));
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] || '';
    if (token === '-b' || token === '-c' || token === '--create') {
      const candidate = tokens[index + 1] || '';
      if (candidate && !candidate.startsWith('-')) return candidate;
    }
    if (token.startsWith('-b') && token.length > 2) return token.slice(2);
    if (token.startsWith('-c') && token.length > 2) return token.slice(2);
  }

  const worktreeAddIndex = tokens.findIndex((token, index) => {
    return token === 'add' && index > 0 && tokens.slice(0, index).some((item) => normalizeExecutableToken(item) === 'git' || item === 'worktree');
  });
  if (worktreeAddIndex !== -1) {
    const nonOptionArgs = [];
    for (let index = worktreeAddIndex + 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (!token || token.startsWith('-')) continue;
      nonOptionArgs.push(token);
    }
    return nonOptionArgs.length >= 2 ? nonOptionArgs[1] : null;
  }

  const branchNameMatch = String(value).match(/\\bfeat\\/[A-Za-z0-9][A-Za-z0-9._/-]*/);
  return branchNameMatch?.[0] || null;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[\\^$.*+?()[\\]{}|]/g, '\\\\$&');
}

function readFeatureRefFromTasksBranch(docsDir, branchName) {
  if (!docsDir || !branchName) return null;
  const featuresRoot = path.join(docsDir, 'features');
  const stack = [featuresRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.name !== 'tasks.md') continue;
      try {
        const content = fs.readFileSync(entryPath, 'utf8');
        if (new RegExp('^-\\\\s+\\\\*\\\\*(?:Branch|브랜치)\\\\*\\\\*:\\\\s+\`?' + escapeRegExp(branchName) + '\`?\\\\s*$', 'm').test(content)) {
          return path.basename(path.dirname(entryPath));
        }
      } catch {
        // Ignore unreadable feature docs and keep scanning.
      }
    }
  }
  return null;
}

function hasUnsupportedGitTargetOptions(value) {
  const unwrappedValue = unwrapShellCommand(value);
  const tokens = tokenizeShellCommand(unwrappedValue);
  return tokens.some((token) => {
    const normalized = String(token || '').toLowerCase();
    return (
      normalized === '--git-dir' ||
      normalized.startsWith('--git-dir=') ||
      normalized === '--work-tree' ||
      normalized.startsWith('--work-tree=')
    );
  });
}

function hasGitTargetEnvOverrides(value) {
  const tokens = tokenizeShellCommand(value);
  return tokens.some((token) => {
    const normalized = String(token || '').trim().toUpperCase();
    return (
      normalized.startsWith('GIT_DIR=') ||
      normalized.startsWith('GIT_WORK_TREE=')
    );
  });
}

const normalizedCommand = unwrapShellCommand(command);
const hasUnsupportedShellWrappedDangerousCommand =
  hasUnsupportedDangerousShellWrapper(command, cwd);
const gitSubcommand = getGitSubcommand(command);
const gitCommandCwd = getGitCommandCwd(command, cwd);
const hasUnsupportedGitTarget = hasUnsupportedGitTargetOptions(command);
const hasGitTargetEnvOverride = hasGitTargetEnvOverrides(command);
const isGitCommit = gitSubcommand === 'commit';
const isGitPush = gitSubcommand === 'push';
const isGitCheckout = gitSubcommand === 'checkout';
const isGitSwitch = gitSubcommand === 'switch';
const isGitWorktree = gitSubcommand === 'worktree';
const isGitRestore = gitSubcommand === 'restore';
const isGitClean = gitSubcommand === 'clean';
const isGitRebase = gitSubcommand === 'rebase';
const isGitMerge = gitSubcommand === 'merge';
const isGitCherryPick = gitSubcommand === 'cherry-pick';
const isGitRevert = gitSubcommand === 'revert';
const isGitStash = gitSubcommand === 'stash';
const isGitBranchDelete =
  gitSubcommand === 'branch' &&
  /(^|\\s)(?:-D|-d|--delete)(\\s|$)/.test(normalizedCommand);
const isGitTagDelete =
  gitSubcommand === 'tag' &&
  /(^|\\s)-d(\\s|$)/.test(normalizedCommand);
const isGitResetHard =
  gitSubcommand === 'reset' && /(^|\\s)--hard(\\s|$)/.test(normalizedCommand);
const isAlwaysBlockedGhCommand =
  /\\bgh(?:\\.cmd|\\.exe)?\\s+repo\\s+delete\\b/i.test(command) ||
  /\\bgh(?:\\.cmd|\\.exe)?\\s+release\\s+delete\\b/i.test(command) ||
  /\\bgh(?:\\.cmd|\\.exe)?\\s+api\\b[\\s\\S]{0,160}(?:--method=DELETE|(?:-X|--method)\\s+DELETE)\\b/i.test(command) ||
  /\\bgh(?:\\.cmd|\\.exe)?\\s+api\\b[\\s\\S]{0,120}\\bgraphql\\b/i.test(command);
const isAlwaysBlockedGhOperation =
  isAlwaysBlockedGhCommand;
const isDangerousGhCommand =
  /\\bgh(?:\\.cmd|\\.exe)?\\s+issue\\s+(?:create|delete|edit|close|reopen)\\b/i.test(command) ||
  /\\bgh(?:\\.cmd|\\.exe)?\\s+pr\\s+(?:create|merge|close|reopen|review|ready)\\b/i.test(command) ||
  /\\bgh(?:\\.cmd|\\.exe)?\\s+repo\\s+(?:delete|archive|rename|edit)\\b/i.test(command) ||
  /\\bgh(?:\\.cmd|\\.exe)?\\s+release\\s+(?:create|delete|edit)\\b/i.test(command) ||
  /\\bgh(?:\\.cmd|\\.exe)?\\s+api\\b[\\s\\S]{0,160}(?:--method=(?:DELETE|PATCH|POST|PUT)|(?:-X|--method)\\s+(?:DELETE|PATCH|POST|PUT))\\b/i.test(command);
const isGitCreateBranch =
  (isGitCheckout && /(^|\\s)-b(\\s|$)/.test(normalizedCommand)) ||
  (isGitSwitch && /(^|\\s)(?:-c|--create)(\\s|$)/.test(normalizedCommand));
const isGitWorktreeAdd =
  isGitWorktree && /(^|\\s)add(\\s|$)/.test(normalizedCommand);
const isLeeSpecKitIssueCreate =
  /\\blee-spec-kit\\b[\\s\\S]{0,120}\\bgithub\\s+issue\\b[\\s\\S]{0,160}\\b--create\\b/i.test(command);
const isLeeSpecKitPrCreate =
  /\\blee-spec-kit\\b[\\s\\S]{0,120}\\bgithub\\s+pr\\b[\\s\\S]{0,160}\\b--create\\b/i.test(command);
const isLeeSpecKitPrMerge =
  /\\blee-spec-kit\\b[\\s\\S]{0,120}\\bgithub\\s+pr\\b[\\s\\S]{0,160}\\b--merge\\b/i.test(command);
const isGhIssueCreate =
  isDangerousGhCommand && /\\bgh(?:\\.cmd|\\.exe)?\\s+issue\\s+create\\b/i.test(command);
const isGhPrCreate =
  isDangerousGhCommand && /\\bgh(?:\\.cmd|\\.exe)?\\s+pr\\s+create\\b/i.test(command);
const isGhPrMerge =
  isDangerousGhCommand && /\\bgh(?:\\.cmd|\\.exe)?\\s+pr\\s+merge\\b/i.test(command);
let stageBoundAction = null;
if (isGitCreateBranch) {
  stageBoundAction = 'branch_create';
} else if (isGitWorktreeAdd) {
  stageBoundAction = 'branch_create';
} else if (isGhIssueCreate || isLeeSpecKitIssueCreate) {
  stageBoundAction = 'issue_create';
} else if (isGhPrCreate || isLeeSpecKitPrCreate) {
  stageBoundAction = 'pr_create';
} else if (isGhPrMerge || isLeeSpecKitPrMerge) {
  stageBoundAction = 'pr_merge';
}
const isDangerousCommand =
  isAlwaysBlockedGhOperation ||
  hasUnsupportedShellWrappedDangerousCommand ||
  isGitCommit ||
  isGitPush ||
  isGitCheckout ||
  isGitSwitch ||
  isGitWorktree ||
  isGitRestore ||
  isGitClean ||
  isGitRebase ||
  isGitMerge ||
  isGitCherryPick ||
  isGitRevert ||
  isGitStash ||
  isGitBranchDelete ||
  isGitTagDelete ||
  isGitResetHard ||
  isDangerousGhCommand ||
  isLeeSpecKitIssueCreate ||
  isLeeSpecKitPrCreate ||
  isLeeSpecKitPrMerge;

if (!command || !isDangerousCommand) {
  process.exit(0);
}

if (isAlwaysBlockedGhOperation) {
  printBlock('Destructive GitHub CLI commands such as repo or release deletion are not supported by lee-spec-kit hooks. Re-run them manually after explicit review.');
  process.exit(0);
}

if (hasUnsupportedGitTarget || hasGitTargetEnvOverride) {
  printBlock('Git commands using --git-dir, --work-tree, GIT_DIR, or GIT_WORK_TREE are not supported by lee-spec-kit hooks. Re-run the command from the target repo root instead.');
  process.exit(0);
}

const detectedResult = runLeeSpecKitJson(['detect', '--json'], workflowCwd);
if (!detectedResult.ok) {
  printBlock('lee-spec-kit detection failed inside the Codex hook. Fix the local CLI or hook setup before continuing.');
  process.exit(0);
}
const detected = detectedResult.data;
if (!(detected?.status === 'ok' && detected?.isLeeSpecKitProject === true)) {
  process.exit(0);
}

const docsDir = typeof detected?.docsDir === 'string' ? detected.docsDir : '';
const gitTargetIsDocsRepo =
  !!docsDir &&
  normalizeResolvedPath(gitCommandCwd) === normalizeResolvedPath(docsDir);

if (
  gitTargetIsDocsRepo &&
  (isGitCheckout ||
    isGitSwitch ||
    isGitCreateBranch ||
    isGitWorktreeAdd ||
    gitSubcommand === 'branch')
) {
  printBlock('Standalone docs repos stay on their docs branch and must not be switched into feature branches or worktrees.');
  process.exit(0);
}

let stage = null;
const isPotentialMergeCleanupCommand =
  !stageBoundAction &&
  !isGitCommit &&
  path.resolve(gitCommandCwd) !== path.resolve(cwd) &&
  (
    command.includes('worktree remove') ||
    command.includes('branch -D') ||
    command.includes('push origin --delete')
  );
const commandFeatureRef =
  extractLeeSpecKitFeatureRef(command) ||
  readFeatureRefFromTasksBranch(docsDir, extractBranchCreateTarget(command));
if (hasUnsupportedShellWrappedDangerousCommand && !commandFeatureRef) {
  printBlock('lee-spec-kit hooks do not support this shell wrapper for git or gh commands. Re-run the command from a supported shell or the target repo root instead.');
  process.exit(0);
}
if (isGitCommit) {
  const commitStageArgs = commandFeatureRef
    ? ['workflow-stage', commandFeatureRef, '--json']
    : ['workflow-stage', '--json'];
  const commitStageResult = runLeeSpecKitJson(commitStageArgs, workflowCwd);
  const commitStage = commitStageResult.ok ? commitStageResult.data : null;
  if (
    commitStage?.status === 'ok' &&
    commitStage?.nextAction?.category === 'task_execute'
  ) {
    printBlock('Commits are not allowed while task_execute is active. The task implementation worker must return code and verification results without committing; the main agent must synchronize docs and task state before the task_commit checkpoint.');
    process.exit(0);
  }
}
if (stageBoundAction || isPotentialMergeCleanupCommand || hasUnsupportedShellWrappedDangerousCommand) {
  const stageArgs = commandFeatureRef
    ? ['workflow-stage', commandFeatureRef, '--json']
    : ['workflow-stage', '--json'];
  const stageResult = runLeeSpecKitJson(stageArgs, workflowCwd);
  if (!stageResult.ok) {
    printBlock('lee-spec-kit workflow-stage failed inside the Codex hook. Resolve the workflow stage before running this stage-bound command.');
    process.exit(0);
  }
  stage = stageResult.data;
  if (stage?.status !== 'ok') {
    printBlock('Resolve feature selection and workflow stage before running this stage-bound command.');
    process.exit(0);
  }
  const isExactNextActionCommand =
    normalizeCommandText(stage?.nextAction?.command) === normalizeCommandText(command);
  if (hasUnsupportedShellWrappedDangerousCommand && !isExactNextActionCommand) {
    printBlock('lee-spec-kit hooks do not support this shell wrapper for git or gh commands. Re-run the command from a supported shell or the target repo root instead.');
    process.exit(0);
  }
  if (
    stageBoundAction &&
    stage?.nextAction?.category !== stageBoundAction &&
    !isExactNextActionCommand
  ) {
    printBlock(
      \`Current workflow stage is \${stage?.stage || 'unknown'} and only \${stage?.nextAction?.category || 'the current nextAction'} is allowed next. Do not jump ahead to \${stageBoundAction}.\`
    );
    process.exit(0);
  }
}

const isExactMergeCleanupCommand =
  stage?.nextAction?.category === 'merge_cleanup' &&
  normalizeCommandText(stage?.nextAction?.command) === normalizeCommandText(command);
const isExactNextActionCommand =
  normalizeCommandText(stage?.nextAction?.command) === normalizeCommandText(command);

if (
  path.resolve(gitCommandCwd) !== path.resolve(cwd) &&
  !isGitCommit &&
  !isExactNextActionCommand &&
  !isExactMergeCleanupCommand &&
  !(stageBoundAction === 'branch_create' && (isGitCreateBranch || isGitWorktreeAdd))
) {
  printBlock('Git commands targeting another repo via -C are only supported for git commit. Re-run the command from the target repo root instead.');
  process.exit(0);
}

if (isGitCommit) {
  const commitAuditArgs = ['commit-audit', '--json', '--git-root', gitCommandCwd];
  const commitMessage = getGitCommitMessage(command);
  if (commitMessage) {
    commitAuditArgs.push('--message', commitMessage);
  }
  const commitAuditResult = runLeeSpecKitJson(commitAuditArgs, workflowCwd);
  if (!commitAuditResult.ok) {
    printBlock('lee-spec-kit commit-audit failed inside the Codex hook. Resolve the docs guardrail failure before committing.');
    process.exit(0);
  }
  const commitAudit = commitAuditResult.data;
  if (commitAudit?.status === 'blocked') {
    if (commitAudit?.reasonCode === 'UNSUPPORTED_GIT_TARGET') {
      printBlock('Git commit targets outside the current lee-spec-kit project topology are not supported. Re-run the command from the active workspace or target repo root instead.');
      process.exit(0);
    }
    printBlock('Normalize or allowlist non-canonical docs paths before committing.');
    process.exit(0);
  }
  if (!(commitAudit?.status === 'ok' || commitAudit?.status === 'skipped')) {
    printBlock('lee-spec-kit commit-audit returned a non-ok status inside the Codex hook. Resolve the docs guardrail failure before committing.');
    process.exit(0);
  }
}

const auditResult = runLeeSpecKitJson(['workflow-audit', '--json'], workflowCwd);
if (!auditResult.ok) {
  printBlock('lee-spec-kit workflow-audit failed inside the Codex hook. Resolve the docs sync guardrail failure before continuing.');
  process.exit(0);
}
const audit = auditResult.data;
if (audit?.status === 'needs_sync') {
  printBlock('Sync the active feature docs before running remote or destructive commands.');
  process.exit(0);
}
if (!(audit?.status === 'ok' || audit?.status === 'skipped')) {
  printBlock('lee-spec-kit workflow-audit returned a non-ok status inside the Codex hook. Resolve the docs sync guardrail failure before continuing.');
}
`;
    case 'stop_workflow_audit.mjs':
      return `#!/usr/bin/env node
import { getWorkflowCwd, printBlock, readHookInput, runLeeSpecKitJson } from './_lee_spec_kit_hook_utils.mjs';

// Equivalent CLI probe: npx lee-spec-kit workflow-audit --json
const inputResult = readHookInput();
if (!inputResult.ok) {
  printBlock('Codex stop hook input was malformed. Resolve the local hook setup before stopping.');
  process.exit(0);
}
const input = inputResult.value;
if (input?.stop_hook_active === true) {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

const cwd = getWorkflowCwd();
const detectedResult = runLeeSpecKitJson(['detect', '--json'], cwd);
if (!detectedResult.ok) {
  printBlock('lee-spec-kit detection failed inside the stop hook. Resolve the local CLI or hook setup before stopping.');
  process.exit(0);
}
const detected = detectedResult.data;
if (!(detected?.status === 'ok' && detected?.isLeeSpecKitProject === true)) {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

const auditResult = runLeeSpecKitJson(['workflow-audit', '--json'], cwd);
if (!auditResult.ok) {
  printBlock('lee-spec-kit workflow-audit failed inside the stop hook. Resolve the docs sync guardrail failure before stopping.');
  process.exit(0);
}
const audit = auditResult.data;
if (audit?.status === 'needs_sync') {
  printBlock('Run one more pass and sync the active feature docs before stopping.');
  process.exit(0);
}
if (!(audit?.status === 'ok' || audit?.status === 'skipped')) {
  printBlock('lee-spec-kit workflow-audit returned a non-ok status inside the stop hook. Resolve the docs sync guardrail failure before stopping.');
  process.exit(0);
}

process.stdout.write(JSON.stringify({ continue: true }));
`;
    default:
      return '';
  }
}

function getManagedHookRelativePath(fileName: ManagedHookFileName): string {
  return path.posix.join('.codex', 'hooks', fileName);
}

function normalizePathSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPortableHookCommandSuffix(fileName: ManagedHookFileName): string {
  const relativeHookPath = normalizePathSlashes(
    getManagedHookRelativePath(fileName)
  );
  const loaderSource = [
    '(async () => {',
    "  const fs = require('node:fs');",
    "  const path = require('node:path');",
    "  const { pathToFileURL } = require('node:url');",
    `  const relativeHookPath = ${JSON.stringify(relativeHookPath)};`,
    '  let dir = process.cwd();',
    '  while (true) {',
    '    const candidate = path.join(dir, relativeHookPath);',
    '    if (fs.existsSync(candidate)) {',
    '      await import(pathToFileURL(candidate).href);',
    '      return;',
    '    }',
    '    const parent = path.dirname(dir);',
    '    if (parent === dir) {',
    "      throw new Error('lee-spec-kit hook script not found: ' + relativeHookPath);",
    '    }',
    '    dir = parent;',
    '  }',
    '})().catch((error) => {',
    '  console.error(error && error.stack ? error.stack : String(error));',
    '  process.exit(1);',
    '});',
  ].join(' ');
  return ` -e ${JSON.stringify(loaderSource)}`;
}

function isManagedCommand(command: string): boolean {
  const normalized = normalizePathSlashes(command).trim();
  return MANAGED_HOOK_FILENAMES.some((fileName) => {
    const currentCommand = normalizePathSlashes(
      toPortableHookCommand(fileName)
    ).trim();
    const portableSuffix = normalizePathSlashes(
      getPortableHookCommandSuffix(fileName)
    ).trim();
    if (normalized === currentCommand || normalized.endsWith(portableSuffix)) {
      return true;
    }

    const relativeHookPath = escapeRegExp(getManagedHookRelativePath(fileName));
    const legacyAbsolutePattern = new RegExp(
      `^node\\s+["']?.*${relativeHookPath}["']?$`
    );
    return legacyAbsolutePattern.test(normalized);
  });
}

function toPortableHookCommand(fileName: ManagedHookFileName): string {
  const nodeCommand = JSON.stringify(process.execPath);
  return `${nodeCommand}${getPortableHookCommandSuffix(fileName)}`;
}

function getManagedHooksConfig(): Record<HookEventName, HookMatcherGroup[]> {
  const commandFor = (fileName: ManagedHookFileName) =>
    toPortableHookCommand(fileName);

  return {
    SessionStart: [
      {
        matcher: 'startup|resume|clear|compact',
        hooks: [
          {
            type: 'command',
            command: commandFor('session_start_lee_spec_kit.mjs'),
            statusMessage: 'Loading lee-spec-kit workflow context',
          },
        ],
      },
    ],
    SubagentStart: [
      {
        hooks: [
          {
            type: 'command',
            command: commandFor('subagent_start_lee_spec_kit.mjs'),
            statusMessage: 'Loading scoped lee-spec-kit subagent context',
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'command',
            command: commandFor('user_prompt_submit_lee_spec_kit.mjs'),
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: commandFor('pre_tool_use_policy.mjs'),
            statusMessage: 'Checking lee-spec-kit workflow guardrails',
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command: commandFor('stop_workflow_audit.mjs'),
            timeout: 30,
          },
        ],
      },
    ],
  };
}

function getInstalledCliEntrypoint(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js');
}

function pruneManagedGroups(
  groups: HookMatcherGroup[] | undefined
): HookMatcherGroup[] {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => {
      if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) {
        return group;
      }

      const hooks = group.hooks.filter(
        (hook) =>
          !(
            hook &&
            typeof hook === 'object' &&
            typeof hook.command === 'string' &&
            isManagedCommand(hook.command)
          )
      );

      if (hooks.length === 0) {
        return null;
      }

      return {
        ...group,
        hooks,
      };
    })
    .filter((group): group is HookMatcherGroup => !!group);
}

function mergeManagedGroups(
  current: HooksConfigFile,
  managedHooks: Record<HookEventName, HookMatcherGroup[]>
): HooksConfigFile {
  const nextHooks: Record<string, unknown> = {
    ...(current.hooks && typeof current.hooks === 'object'
      ? current.hooks
      : {}),
  };

  for (const eventName of Object.keys(managedHooks) as HookEventName[]) {
    const existing = pruneManagedGroups(
      Array.isArray(nextHooks[eventName])
        ? (nextHooks[eventName] as HookMatcherGroup[])
        : undefined
    );
    nextHooks[eventName] = [...existing, ...managedHooks[eventName]];
  }

  return {
    ...current,
    hooks: nextHooks,
  };
}

function removeManagedGroups(current: HooksConfigFile): HooksConfigFile {
  const nextHooks: Record<string, unknown> = {
    ...(current.hooks && typeof current.hooks === 'object'
      ? current.hooks
      : {}),
  };

  for (const eventName of [
    'SessionStart',
    'SubagentStart',
    'UserPromptSubmit',
    'PreToolUse',
    'Stop',
  ]) {
    const pruned = pruneManagedGroups(
      Array.isArray(nextHooks[eventName])
        ? (nextHooks[eventName] as HookMatcherGroup[])
        : undefined
    );
    if (pruned.length > 0) {
      nextHooks[eventName] = pruned;
    } else {
      delete nextHooks[eventName];
    }
  }

  return {
    ...current,
    hooks: nextHooks,
  };
}

export function getRepoCodexDir(repoRoot = process.cwd()): string {
  return path.join(repoRoot, '.codex');
}

export function resolveCodexHooksRepoRoot(cwd = process.cwd()): string {
  return runGitCapture(['rev-parse', '--show-toplevel'], cwd) || cwd;
}

export function getRepoHooksDir(repoRoot = process.cwd()): string {
  return path.join(getRepoCodexDir(repoRoot), 'hooks');
}

export function getRepoHooksConfigPath(repoRoot = process.cwd()): string {
  return path.join(getRepoCodexDir(repoRoot), 'hooks.json');
}

export async function upsertLeeSpecKitCodexHooks(
  repoRoot = process.cwd(),
  workflowRoot = repoRoot
): Promise<{
  changed: boolean;
  action: 'created' | 'updated' | 'noop';
  hooksJsonPath: string;
}> {
  const hooksDir = getRepoHooksDir(repoRoot);
  const hooksJsonPath = getRepoHooksConfigPath(repoRoot);
  await fs.ensureDir(hooksDir);

  for (const fileName of MANAGED_HOOK_FILENAMES) {
    const targetPath = path.join(hooksDir, fileName);
    await fs.writeFile(
      targetPath,
      getHookScriptContent(fileName, repoRoot, workflowRoot),
      {
        encoding: 'utf-8',
        mode: 0o755,
      }
    );
  }

  const managedHooks = getManagedHooksConfig();
  const exists = await fs.pathExists(hooksJsonPath);
  const current = exists
    ? ((await fs.readJson(hooksJsonPath)) as HooksConfigFile)
    : ({ hooks: {} } as HooksConfigFile);
  const next = mergeManagedGroups(current, managedHooks);
  const nextJson = `${JSON.stringify(next, null, 2)}\n`;
  const currentJson = exists ? `${JSON.stringify(current, null, 2)}\n` : null;

  if (currentJson === nextJson) {
    return { changed: false, action: 'noop', hooksJsonPath };
  }

  await fs.writeFile(hooksJsonPath, nextJson, 'utf-8');
  return {
    changed: true,
    action: exists ? 'updated' : 'created',
    hooksJsonPath,
  };
}

export async function removeLeeSpecKitCodexHooks(
  repoRoot = process.cwd()
): Promise<{ changed: boolean; hooksJsonPath: string }> {
  const hooksDir = getRepoHooksDir(repoRoot);
  const hooksJsonPath = getRepoHooksConfigPath(repoRoot);
  let changed = false;

  if (await fs.pathExists(hooksJsonPath)) {
    const current = (await fs.readJson(hooksJsonPath)) as HooksConfigFile;
    const next = removeManagedGroups(current);
    const currentJson = `${JSON.stringify(current, null, 2)}\n`;
    const nextJson = `${JSON.stringify(next, null, 2)}\n`;
    if (currentJson !== nextJson) {
      await fs.writeFile(hooksJsonPath, nextJson, 'utf-8');
      changed = true;
    }
  }

  for (const fileName of MANAGED_HOOK_FILENAMES) {
    const targetPath = path.join(hooksDir, fileName);
    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath);
      changed = true;
    }
  }

  return { changed, hooksJsonPath };
}
