import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import type { LocalWorkflowCheck, ProjectConfig } from '../config/types.js';

/** Validate without dropping malformed checks or changing their arguments. */
export function validateChecks(value: unknown): LocalWorkflowCheck[] {
  if (!Array.isArray(value))
    throw new Error('Workflow checks must be an array.');
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.command !== 'string' ||
      !entry.command.trim() ||
      (entry.args !== undefined &&
        (!Array.isArray(entry.args) ||
          entry.args.some((arg: unknown) => typeof arg !== 'string')))
    ) {
      throw new Error(
        'Each workflow check requires a nonempty command and optional string args.'
      );
    }
    return { command: entry.command.trim(), args: entry.args || [] };
  });
}

export function resolveFeatureCheckPolicy(
  config: ProjectConfig,
  component: string
) {
  const workflow = config.workflow;
  const override = workflow?.featureChecksByComponent?.[component];
  const checks = validateChecks(
    override
      ? override.checks
      : workflow?.featureChecks !== undefined
        ? workflow.featureChecks
        : workflow?.postMergeChecks !== undefined
          ? workflow.postMergeChecks
          : []
  );
  const skipReason =
    (override
      ? override.skipReason
      : workflow?.featureChecksSkipReason
    )?.trim() || '';
  if (checks.length && skipReason)
    throw new Error('Configure checks or a skip reason, not both.');
  const postMergeChecks = validateChecks(
    workflow?.featureChecks !== undefined
      ? workflow.postMergeChecks === undefined
        ? []
        : workflow.postMergeChecks
      : []
  );
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ component, checks, skipReason, postMergeChecks }))
    .digest('hex');
  return { checks, skipReason, hash, postMergeChecks };
}

/** Read-only suggestions; never execute package scripts during discovery. */
export async function detectFeatureChecks(
  projectRoot: string
): Promise<LocalWorkflowCheck[]> {
  const manifestPath = path.join(projectRoot, 'package.json');
  if (!(await fs.pathExists(manifestPath))) return [];
  const manifest = await fs.readJson(manifestPath);
  const declared =
    typeof manifest.packageManager === 'string'
      ? manifest.packageManager.split('@')[0]
      : '';
  let manager = ['pnpm', 'npm', 'yarn', 'bun'].includes(declared)
    ? declared
    : '';
  if (!manager) {
    const detected = [];
    for (const [name, lockfiles] of Object.entries({
      pnpm: ['pnpm-lock.yaml'],
      yarn: ['yarn.lock'],
      npm: ['package-lock.json'],
      bun: ['bun.lock', 'bun.lockb'],
    })) {
      if (lockfiles.some((file) => fs.existsSync(path.join(projectRoot, file))))
        detected.push(name);
    }
    if (detected.length > 1) return [];
    manager = detected[0] || 'npm';
  }
  return ['typecheck', 'lint', 'test', 'build']
    .filter(
      (name) =>
        typeof manifest.scripts?.[name] === 'string' &&
        manifest.scripts[name].trim()
    )
    .map((name) => ({ command: manager, args: ['run', name] }));
}
