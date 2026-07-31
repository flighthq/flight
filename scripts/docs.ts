// Enforces the size budgets that agent-facing docs declare about themselves.
//
// AGENTS.md is read IN FULL at the start of every agent session, so every character in it is paid for
// by every session whether or not the task touches that domain. That is why it carries a stated budget
// and a stated remedy: when a section grows past a trigger plus the rule it enforces, the elaboration
// moves into the domain doc under agents/ that owns it and a pointer stays behind.
//
// The budget was written down long before anything enforced it, and the file drifted over it anyway —
// discovered by accident during unrelated work, at which point nobody could say when it had crossed.
// A doc budget nobody measures is a suggestion; this makes it a gate. The warn band exists so the
// pressure arrives while there is still room to move a section deliberately, rather than as a red gate
// on top of whatever change happened to be the last one in.
//
// Measured in CHARACTERS, not bytes or tokens: it is the unit the budget is written in, and it is
// stable across encodings. Reported with `--check`; there is no fix mode, because the remedy is an
// editorial decision about which section has outgrown the map, not a mechanical rewrite.
import { readFileSync } from 'node:fs';

import pc from 'picocolors';

// Every doc with a self-declared size budget. Keep the number here identical to the one the doc states
// in its own prose — the doc is where a reader meets the rule, this table is only what enforces it.
export const DOC_BUDGETS: readonly DocBudget[] = [{ limit: 40_000, path: 'AGENTS.md' }];

// Fraction of the limit below which the budget warns rather than passes silently. 2% of 40,000 is 800
// characters — roughly a long paragraph, so the warning lands while one section can still absorb the
// cut, instead of when every section would have to.
export const DOC_BUDGET_WARN_FRACTION = 0.02;

export interface DocBudget {
  limit: number;
  path: string;
}

export interface DocBudgetReport {
  length: number;
  limit: number;
  path: string;
  status: DocBudgetStatus;
}

// `over` fails the gate; `near` warns and passes; `ok` is silent.
export type DocBudgetStatus = 'near' | 'ok' | 'over';

export function getDocBudgetStatus(length: number, limit: number): DocBudgetStatus {
  if (length > limit) return 'over';
  return length >= limit - limit * DOC_BUDGET_WARN_FRACTION ? 'near' : 'ok';
}

export function reportDocBudget(budget: Readonly<DocBudget>, contents: string): DocBudgetReport {
  const length = contents.length;
  return { length, limit: budget.limit, path: budget.path, status: getDocBudgetStatus(length, budget.limit) };
}

function main(): void {
  const reports = DOC_BUDGETS.map((budget) => reportDocBudget(budget, readFileSync(budget.path, 'utf8')));
  let over = 0;
  for (const report of reports) {
    const headroom = report.limit - report.length;
    const measured = `${report.length.toLocaleString('en-US')} / ${report.limit.toLocaleString('en-US')} characters`;
    if (report.status === 'over') {
      over++;
      process.stderr.write(
        `${pc.red('✗')} ${report.path} is ${(-headroom).toLocaleString('en-US')} characters OVER budget (${measured})\n`,
      );
      continue;
    }
    if (report.status === 'near') {
      process.stdout.write(
        `${pc.yellow('!')} ${report.path} is within ${headroom.toLocaleString('en-US')} characters of its budget (${measured})\n`,
      );
      continue;
    }
    process.stdout.write(`${pc.green('✓')} ${report.path} ${measured}\n`);
  }
  if (over > 0) {
    process.stderr.write(
      `\n${pc.red('✗')} ${pc.bold(`${over} doc${over === 1 ? '' : 's'} over budget`)} — move the elaboration into the agents/ doc that owns it and leave a pointer\n`,
    );
    process.exit(1);
  }
}

if (process.argv.includes('--check')) main();
