import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The promotions (develop → next in CI, next → main in Nightly) move a branch only through this script,
// so its forward-only rule is what keeps `next` and `main` from ever rewinding or jumping sideways.
// Exercised against a real bare remote rather than mocked git.

const SCRIPT = resolve(import.meta.dirname, 'fast-forward-branch.sh');

let root: string;
let work: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: work, encoding: 'utf8' }).trim();
}

function commit(message: string): string {
  git('commit', '--quiet', '--allow-empty', '-m', message);
  return git('rev-parse', 'HEAD');
}

function promote(branch: string, sha: string): { output: string; status: number | null } {
  const result = spawnSync('bash', [SCRIPT, branch, sha], {
    cwd: work,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: '' },
  });
  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}

function remoteHead(branch: string): string {
  return git('ls-remote', 'origin', `refs/heads/${branch}`).split('\t')[0] ?? '';
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fast-forward-'));
  execFileSync('git', ['init', '--quiet', '--bare', join(root, 'origin.git')]);
  work = join(root, 'work');
  execFileSync('git', ['clone', '--quiet', join(root, 'origin.git'), work], { stdio: 'ignore' });
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('fast-forward-branch.sh', () => {
  it('creates an absent branch at the commit', () => {
    const first = commit('first');
    expect(promote('next', first).status).toBe(0);
    expect(remoteHead('next')).toBe(first);
  });

  it('moves the branch forward to a descendant', () => {
    const first = commit('first');
    promote('next', first);
    const second = commit('second');
    expect(promote('next', second).status).toBe(0);
    expect(remoteHead('next')).toBe(second);
  });

  it('leaves the branch alone when it already contains the commit', () => {
    const first = commit('first');
    const second = commit('second');
    promote('next', second);
    const result = promote('next', first);
    expect(result.status).toBe(0);
    expect(result.output).toContain('nothing to do');
    expect(remoteHead('next')).toBe(second);
  });

  it('refuses a commit that diverges from the branch', () => {
    const first = commit('first');
    const second = commit('second');
    promote('next', second);
    git('checkout', '--quiet', '-b', 'side', first);
    const side = commit('side');
    const result = promote('next', side);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('have diverged');
    expect(remoteHead('next')).toBe(second);
  });
});
