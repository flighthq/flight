import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ★ THE REFUSALS ARE THE ONLY LOGIC LEFT IN THIS CLI, AND THEY ARE THE PART THAT MUST NOT REGRESS
// QUIETLY. Everything this script decides lives in `oracle-eligibility.ts`; what is left is argument
// handling, file reading, and the refusals that exist because a DEFAULT would let a weaker claim pass as
// a stronger one silently. A default is invisible in the output — the report still prints, and the reader
// has to notice that a whole condition went missing — so these are exercised against the real script
// rather than reasoned about.
//
// The argument refusals fire before any file is read; the identity refusals read the capture roots, so
// those build a fixture tree carrying exactly the provenance under test.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'oracle-commission-batch.ts');
// The local binary rather than `npx`, whose resolution alone costs more than the script run, and an
// explicit budget because a subprocess test is honestly slow — not because it is flaky.
const TSX = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'tsx');
const SPAWN_BUDGET_MS = 30_000;

describe('oracle-commission-batch', () => {
  it(
    'refuses a single capture root, because one run cannot measure determinism',
    () => {
      const run = runBatch(['report', '--runs', '.artifacts']);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('at least two capture roots');
    },
    SPAWN_BUDGET_MS,
  );

  // ★ THESE TWO REPLACED THE `--hosts` FLAG TESTS, WHICH OUTLIVED THE FLAG. The declared scope was
  // deleted when the host relationship became DERIVED from `provenance.hostInstanceId`, and these two
  // tests kept asserting `--hosts must be` against a script that no longer has the option — red for a
  // reason that was already fixed, which is how a suite stops being read. The condition they were
  // protecting is real and is now measured rather than declared, so it is tested against the data.
  it(
    'refuses a root that is not one host, rather than picking one of its identities',
    () => {
      const a = captureRoot({ 'entry-a/webgl': 'host-1', 'entry-b/webgl': 'host-2' });
      const b = captureRoot({ 'entry-a/webgl': 'host-3' });

      const run = runBatch(['report', '--runs', `${a},${b}`]);

      expect(run.status).toBe(1);
      expect(run.stderr).toContain('contains more than one hostInstanceId');
    },
    SPAWN_BUDGET_MS,
  );

  it(
    'refuses roots that declare different environments, because they are not comparable runs',
    () => {
      const a = captureRoot({ 'entry-a/webgl': 'host-1' }, 'env-1');
      const b = captureRoot({ 'entry-a/webgl': 'host-2' }, 'env-2');

      const run = runBatch(['report', '--runs', `${a},${b}`]);

      expect(run.status).toBe(1);
      expect(run.stderr).toContain('different environmentId values');
    },
    SPAWN_BUDGET_MS,
  );

  // ★ THE TWO WRITE REFUSALS ARE THE ONES THAT GUARD A PERMANENT ACT, and both end in an empty batch, so
  // the generic "nothing is eligible" would be technically true and send the reader hunting for eligible
  // cells when the remedy is to capture on a second machine, or to re-capture with identity at all.
  it(
    'refuses to file from one host, naming the condition instead of an empty batch',
    () => {
      const a = captureRoot({ 'entry-a/webgl': 'host-1' });
      const b = captureRoot({ 'entry-a/webgl': 'host-1' });

      const run = runBatch(['write', '--runs', `${a},${b}`, '--id', 'never-written', '--reason', 'test']);

      expect(run.status).toBe(1);
      expect(run.stderr).toContain('same hostInstanceId');
    },
    SPAWN_BUDGET_MS,
  );

  it(
    'refuses to file when the captures record no host at all, as UNEVALUATED rather than one-host',
    () => {
      const a = captureRoot({ 'entry-a/webgl': null });
      const b = captureRoot({ 'entry-a/webgl': null });

      const run = runBatch(['write', '--runs', `${a},${b}`, '--id', 'never-written', '--reason', 'test']);

      expect(run.status).toBe(1);
      expect(run.stderr).toContain('UNEVALUATED, not measured-as-one-host');
    },
    SPAWN_BUDGET_MS,
  );

  // ★ THE SAME ROOT TWICE SATISFIES THE COUNT ABOVE WITHOUT SATISFYING THE CONDITION IT STANDS FOR. Two
  // paths were given, so "at least two capture roots" passes — and a directory compared with itself
  // agrees with itself, which is the strongest-looking result the tool can print over no comparison.
  it(
    'refuses the same root given twice, which passes the count and fails the condition',
    () => {
      const a = captureRoot({ 'entry-a/webgl': 'host-1' });

      const run = runBatch(['report', '--runs', `${a},${a}`]);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('was given more than once');
    },
    SPAWN_BUDGET_MS,
  );

  it(
    'refuses an unknown subcommand instead of defaulting to a write',
    () => {
      const run = runBatch(['commission', '--runs', 'a,b']);

      expect(run.status).toBe(2);
      expect(run.stderr).toContain('usage: oracle-commission-batch');
    },
    SPAWN_BUDGET_MS,
  );
});

/**
 * A capture root holding one `functional` subject, keyed `entry/renderer`, whose statuses carry the given
 * host identity — or none, which is the real corpus's shape since it predates the field.
 */
function captureRoot(cells: Readonly<Record<string, string | null>>, environmentId = 'env-1'): string {
  const root = mkdtempSync(join(tmpdir(), 'oracle-batch-'));
  for (const [cell, hostInstanceId] of Object.entries(cells)) {
    const [entry, renderer] = cell.split('/');
    const directory = join(root, 'functional', entry!, renderer!);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'status.json'),
      JSON.stringify({
        hash: 'a'.repeat(64),
        provenance: hostInstanceId === null ? {} : { environmentId, hostInstanceId },
        state: 'ready',
      }),
    );
  }
  return root;
}

function runBatch(args: readonly string[]): { status: number; stderr: string } {
  try {
    execFileSync(TSX, [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stderr?: string };
    return { status: failure.status ?? -1, stderr: failure.stderr ?? '' };
  }
}
