import { execFileSync } from 'child_process';

export function runGitOrThrow(
  args: string[],
  cwd: string,
  options: {
    encoding?: BufferEncoding;
    stdio?: 'pipe' | 'ignore' | ['ignore', 'pipe', 'pipe'] | ['ignore', 'pipe', 'ignore'];
  } = {}
): string {
  const encoding = options.encoding ?? 'utf-8';
  const stdio = options.stdio ?? 'ignore';
  const out = execFileSync('git', args, {
    cwd,
    encoding,
    stdio,
  });

  return out.trim();
}

export function runGitCapture(args: string[], cwd: string): string | undefined {
  try {
    return runGitOrThrow(args, cwd, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return undefined;
  }
}
