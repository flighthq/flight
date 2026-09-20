// `npm run test:cost` — what the default unit lane actually costs, ranked. A REPORT, NEVER A GATE.
//
// The capability rule in `unitTestCost.ts` fails the costs that are STRUCTURAL, because a capability is
// a static fact that reads the same on an idle laptop and a loaded CI box. What is left over is honest
// unit work that happens to be heavy — a brute-force march, a physics stress qualification — and there
// is no non-flaky way to fail that on wall clock: this repository already has a scar where the same file
// measured 3387ms and then timed out at 5000ms on one tree. So this surfaces the ranking and lets a
// person judge it, the way `npm run untested` and `npm run unchecked` report test depth without gating.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { UNIT_TEST_COST_EXEMPTIONS } from './unitTestCost';

interface FileCost {
  capability: string | null;
  duration: number;
  path: string;
  tests: number;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const limit = readLimit(process.argv.slice(2));
  const directory = mkdtempSync(join(tmpdir(), 'flight-test-cost-'));
  try {
    const reportPath = join(directory, 'run.json');
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--project',
        'shared',
        '--reporter=json',
        `--outputFile=${reportPath}`,
      ],
      { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    if (result.error !== undefined) throw result.error;

    // ★ A RUN THAT DIED PRODUCES NO REPORT, AND SAYING NOTHING WOULD READ AS "NOTHING IS SLOW". The
    // report is the verdict token here; its absence is a failure to measure, not a clean measurement.
    const costs = readFileCosts(reportPath, root);
    if (costs === null) {
      console.log(pc.red('FAIL test:cost could not measure: vitest produced no JSON report (the run above says why).'));
      process.exit(1);
    }
    printReport(costs, limit, result.status ?? 0);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function readFileCosts(path: string, root: string): FileCost[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  const results = (parsed as { testResults?: unknown }).testResults;
  if (!Array.isArray(results)) return null;
  const capabilities = new Map(UNIT_TEST_COST_EXEMPTIONS.map(({ capability, path: file }) => [file, capability]));
  return results
    .map((entry) => {
      // Vitest reports absolute paths; the ledger and every other surface speak repository-relative.
      const file = relative(root, String((entry as { name?: unknown }).name ?? '')).replaceAll('\\', '/');
      return {
        capability: capabilities.get(file) ?? null,
        duration:
          Number((entry as { endTime?: number }).endTime ?? 0) -
          Number((entry as { startTime?: number }).startTime ?? 0),
        path: file,
        tests: Array.isArray((entry as { assertionResults?: unknown }).assertionResults)
          ? (entry as { assertionResults: unknown[] }).assertionResults.length
          : 0,
      };
    })
    .sort((a, b) => b.duration - a.duration);
}

function printReport(costs: readonly FileCost[], limit: number, status: number): void {
  const total = costs.reduce((sum, cost) => sum + cost.duration, 0);
  const tests = costs.reduce((sum, cost) => sum + cost.tests, 0);
  console.log(
    pc.bold(
      `Unit lane cost: ${costs.length} files, ${tests} tests, ${(total / 1000).toFixed(1)}s of file time` +
        (status === 0 ? '' : pc.yellow(' (the run had failures; durations still stand)')),
    ),
  );
  let running = 0;
  let half = costs.length;
  for (const [index, cost] of costs.entries()) {
    running += cost.duration;
    if (running >= total / 2) {
      half = index + 1;
      break;
    }
  }
  console.log(pc.dim(`Half of the lane's file time is in its slowest ${half} file${half === 1 ? '' : 's'}.\n`));
  for (const cost of costs.slice(0, limit)) {
    const share = total === 0 ? 0 : (cost.duration / total) * 100;
    console.log(
      `  ${String(Math.round(cost.duration)).padStart(6)}ms ${String(cost.tests).padStart(4)} test${cost.tests === 1 ? ' ' : 's'}` +
        ` ${pc.dim(`${share.toFixed(1)}%`)}  ${cost.path}` +
        (cost.capability === null ? '' : pc.yellow(` [${cost.capability}]`)),
    );
  }
  console.log(
    pc.dim(
      `\nA [capability] tag means the file is on the UNIT_TEST_COST_EXEMPTIONS ledger and belongs in another lane.` +
        ` Untagged cost is honest unit work — judge it, do not gate it.`,
    ),
  );
}

function readLimit(args: readonly string[]): number {
  const flag = args.find((argument) => argument.startsWith('--limit='));
  const parsed = flag === undefined ? Number.NaN : Number.parseInt(flag.slice('--limit='.length), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
}

const DEFAULT_LIMIT = 25;

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
