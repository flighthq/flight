import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface CheckRun {
  readonly target: string;
  readonly environment: string | null;
  readonly baseline: string;
  readonly report: string;
}

const CHECKS: readonly CheckRun[] = [
  {
    target: 'cpp',
    environment: null,
    baseline: '.flight-compiler/baselines/cpp-flight-cpp-default.json',
    report: 'artifacts/flight-compiler-cpp-default.json',
  },
  {
    target: 'cpp',
    environment: 'web',
    baseline: '.flight-compiler/baselines/cpp-flight-cpp-web.json',
    report: 'artifacts/flight-compiler-cpp-web.json',
  },
];

async function main(): Promise<void> {
  let failed = false;

  for (const check of CHECKS) {
    const args = [
      'check',
      '.',
      '--target',
      check.target,
      '--baseline',
      check.baseline,
      '--format',
      'json',
      '--report',
      check.report,
    ];
    if (check.environment !== null) {
      args.push('--environment', check.environment);
    }

    const label = check.environment !== null ? `${check.target}/${check.environment}` : `${check.target}/default`;
    const bin = resolve('node_modules/.bin/flight-compile');

    let exitCode: number;
    try {
      execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      exitCode = 0;
    } catch (error: unknown) {
      const execError = error as { status?: number; stderr?: Buffer };
      exitCode = execError.status ?? 2;
      if (exitCode === 2) {
        const stderr = execError.stderr?.toString() ?? '';
        process.stderr.write(`${label}: infrastructure error\n${stderr}\n`);
        failed = true;
        continue;
      }
    }

    let report: {
      comparison?: {
        introduced?: readonly { identity: string; policyClass: string }[];
        resolvedFindingIdentities?: readonly string[];
      };
    };
    try {
      report = JSON.parse(await readFile(check.report, 'utf8'));
    } catch {
      process.stderr.write(`${label}: could not read report at ${check.report}\n`);
      failed = true;
      continue;
    }

    const introduced = report.comparison?.introduced ?? [];
    const resolved = report.comparison?.resolvedFindingIdentities ?? [];

    const gating = introduced.filter((f) => f.policyClass !== 'target-runtime' && f.policyClass !== 'compiler-defect');

    if (gating.length > 0) {
      process.stderr.write(`${label}: ${gating.length} new gating finding(s) — baseline the source change or fix it\n`);
      for (const f of gating) {
        process.stderr.write(`  introduced: ${f.identity}\n`);
      }
      failed = true;
    }

    if (resolved.length > 0) {
      process.stderr.write(
        `${label}: ${resolved.length} resolved finding(s) — ratchet the baseline downward:\n` +
          `  Remove these identities from ${check.baseline}\n`,
      );
      for (const id of resolved) {
        process.stderr.write(`  resolved: ${id}\n`);
      }
      failed = true;
    }

    const total = introduced.length;
    const baselined = (report as { comparison?: { baselinedCount?: number } }).comparison?.baselinedCount;
    process.stdout.write(
      `${label}: ${total === 0 ? 'clean' : `${total} finding(s)`}` +
        `${gating.length > 0 ? ` (${gating.length} gating)` : ''}` +
        `${resolved.length > 0 ? ` (${resolved.length} resolved, ratchet needed)` : ''}` +
        `${baselined !== undefined ? ` [${baselined} baselined]` : ''}` +
        '\n',
    );
  }

  process.exit(failed ? 1 : 0);
}

main();
