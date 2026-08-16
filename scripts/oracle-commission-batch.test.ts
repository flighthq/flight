import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ★ THE REFUSALS ARE THE ONLY LOGIC LEFT IN THIS CLI, AND THEY ARE THE PART THAT MUST NOT REGRESS
// QUIETLY. Everything this script decides lives in `oracle-eligibility.ts`; what is left is argument
// handling, file reading, and two refusals that exist because a DEFAULT would let a weaker claim pass as
// a stronger one silently. A default is invisible in the output — the report still prints, and the reader
// has to notice that a whole condition went missing — so these are exercised against the real script
// rather than reasoned about.
//
// Both refusals fire before any file is read, so these need no fixture tree.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'oracle-commission-batch.ts');
// The local binary rather than `npx`, whose resolution alone costs more than the script run, and an
// explicit budget because a subprocess test is honestly slow — not because it is flaky.
const TSX = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'tsx');
const SPAWN_BUDGET_MS = 30_000;

describe('oracle-commission-batch', () => {
  it(
    'refuses a single capture root, because one run cannot measure determinism',
    () => {
      const run = runBatch(['report', '--runs', '.artifacts', '--hosts', 'one-host']);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('at least two capture roots');
    },
    SPAWN_BUDGET_MS,
  );

  it(
    'refuses to run without a declared host scope',
    () => {
      // Nothing can derive it: two runs in one sandbox and two runs on separate machines produce
      // identical input. Defaulting it would let within-host agreement pass as cross-host portability.
      const run = runBatch(['report', '--runs', 'a,b']);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('--hosts must be');
    },
    SPAWN_BUDGET_MS,
  );

  it(
    'refuses a host scope it does not recognize rather than falling back to one',
    () => {
      const run = runBatch(['report', '--runs', 'a,b', '--hosts', 'probably-fine']);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('--hosts must be');
    },
    SPAWN_BUDGET_MS,
  );

  it(
    'refuses an unknown subcommand instead of defaulting to a write',
    () => {
      const run = runBatch(['commission', '--runs', 'a,b', '--hosts', 'one-host']);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('usage: oracle-commission-batch');
    },
    SPAWN_BUDGET_MS,
  );
});

function runBatch(args: readonly string[]): { status: number; stderr: string } {
  try {
    execFileSync(TSX, [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stderr?: string };
    return { status: failure.status ?? -1, stderr: failure.stderr ?? '' };
  }
}
