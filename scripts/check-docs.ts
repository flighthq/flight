import { availableParallelism } from 'node:os';

import pc from 'picocolors';

import { createGateRegistry } from './gateRegistry.ts';
import { formatGateFailure, runGates } from './gateRunner.ts';

// The doc-lane quality sweep. Answers "are committed doc artifacts current" — a different lane from
// `npm run check` (SDK code correctness). Every check here has a fix command; the error message names it.
//
// Run periodically by principal or a bookkeeper agent, not gated on every commit. Doc staleness from a
// broad architecture change is principal's responsibility on principal's schedule, not something that
// blocks the fleet's commit path.
const { add, gates } = createGateRegistry();

add('docs:check', 'tsx', ['scripts/docs.ts', '--check']);
add('documented-commands:check', 'tsx', ['scripts/check-documented-commands.ts', '--check']);
add('append-only-ledgers:check', 'tsx', ['scripts/check-append-only-ledgers.ts']);
add('capabilities:check', 'tsx', ['scripts/swf-capabilities.ts', '--check']);
add('capabilities:sites:check', 'tsx', ['scripts/swf-diagnostic-sites.ts', '--check']);
add('capabilities:numbers:check', 'tsx', ['scripts/swf-doc-numbers.ts']);

const configuredConcurrency = Number.parseInt(process.env.FLIGHT_CHECK_CONCURRENCY ?? '', 10);
const concurrency = Number.isFinite(configuredConcurrency)
  ? Math.max(1, configuredConcurrency)
  : Math.min(6, Math.max(1, Math.ceil(availableParallelism() / 2)));
const results = await runGates(gates, concurrency);
const failed: string[] = [];

for (const result of results) {
  process.stdout.write(`\n▶ ${result.label}\n`);
  process.stdout.write(result.output);
  if (!result.passed) {
    process.stdout.write(`${pc.red('✗')} ${result.label} failed (${formatGateFailure(result)})\n`);
    failed.push(result.label);
  }
}

if (failed.length > 0) {
  const failedSet = new Set(failed);
  process.stdout.write(`\n${pc.red('✗')} ${pc.bold(`${failed.length} doc checks failed:`)}\n`);
  for (const label of failed) process.stdout.write(`  ${pc.red('✗')} ${label}\n`);
  process.stdout.write('\n');
  for (const result of results) {
    if (!failedSet.has(result.label)) continue;
    process.stdout.write(`${pc.red('▶')} ${result.label}\n`);
    process.stdout.write(result.output);
    process.stdout.write(`${pc.red('✗')} ${result.label} failed (${formatGateFailure(result)})\n`);
  }
  process.exit(1);
}

process.stdout.write(`\n${pc.green('✓')} ${pc.bold('all doc checks passed')}\n`);
process.stdout.write(pc.dim(`  ${results.length} checks across doc artifacts and generators.\n`));
