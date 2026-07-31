import { readFileSync } from 'node:fs';

import { DOC_BUDGETS, DOC_BUDGET_WARN_FRACTION, getDocBudgetStatus, reportDocBudget } from './docs';

describe('DOC_BUDGETS', () => {
  it('holds every budgeted doc within its stated limit', () => {
    // The gate's own subject: this fails exactly when a budgeted doc has outgrown the map, which is
    // the whole point of writing the budget down.
    for (const budget of DOC_BUDGETS) {
      expect(reportDocBudget(budget, readFileSync(budget.path, 'utf8')).status).not.toBe('over');
    }
  });

  it('states a limit matching the one the doc declares in its own prose', () => {
    // A table that drifts from the doc teaches the reader the wrong number, and the reader is who
    // decides what to cut.
    for (const budget of DOC_BUDGETS) {
      const stated = budget.limit.toLocaleString('en-US');
      expect(readFileSync(budget.path, 'utf8')).toContain(stated);
    }
  });
});

describe('getDocBudgetStatus', () => {
  it('fails only ABOVE the limit, so a doc exactly at budget still passes', () => {
    expect(getDocBudgetStatus(40_001, 40_000)).toBe('over');
    expect(getDocBudgetStatus(40_000, 40_000)).toBe('near');
  });

  it('warns within the fraction of the limit and is silent below it', () => {
    const band = 40_000 - 40_000 * DOC_BUDGET_WARN_FRACTION;
    expect(getDocBudgetStatus(band, 40_000)).toBe('near');
    expect(getDocBudgetStatus(band - 1, 40_000)).toBe('ok');
  });

  it('scales the warn band with the limit rather than using a fixed character count', () => {
    expect(getDocBudgetStatus(9_800, 10_000)).toBe('near');
    expect(getDocBudgetStatus(9_799, 10_000)).toBe('ok');
  });
});

describe('reportDocBudget', () => {
  it('measures characters, not bytes, so a multi-byte doc is not charged twice', () => {
    // '→' is three bytes in UTF-8 and one character; charging bytes would make an em-dash-heavy doc
    // read as over budget while the text a session actually reads is well under it.
    const report = reportDocBudget({ limit: 4, path: 'multibyte.md' }, '→→→');
    expect(report.length).toBe(3);
    expect(report.status).toBe('ok');
  });

  it('carries the path and limit through so a report names which doc to cut', () => {
    const report = reportDocBudget({ limit: 10, path: 'AGENTS.md' }, 'x'.repeat(11));
    expect(report).toEqual({ length: 11, limit: 10, path: 'AGENTS.md', status: 'over' });
  });
});
