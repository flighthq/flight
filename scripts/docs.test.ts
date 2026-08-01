import { readFileSync } from 'node:fs';

import {
  DOC_BUDGETS,
  DOC_BUDGET_WARN_FRACTION,
  findMapStatusClaims,
  getDocBudgetStatus,
  reportDocBudget,
} from './docs';

function mapWith(...entries: readonly string[]): string {
  return ['# Map', '', '## Domain Conventions', '', ...entries, '', '## Next Section', ''].join('\n');
}

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

describe('findMapStatusClaims', () => {
  it('finds no progress claim in the live map', () => {
    // The gate's own subject. The baseline is zero, so this fails exactly when an edit reintroduces
    // the second source of truth the rule exists to prevent.
    for (const budget of DOC_BUDGETS) {
      expect(findMapStatusClaims(readFileSync(budget.path, 'utf8'))).toEqual([]);
    }
  });

  it('flags the shape that actually drifted: a status stamped onto a pointer entry', () => {
    // Verbatim from the map before the cleanup. It claimed M2 while the linked doc said M2–M5 had
    // landed, which is the drift no reader could see from the map alone.
    const claims = findMapStatusClaims(
      mapWith(
        '- [texture source model](agents/texture-source-model.md) — **spec, locked 2026-07-30; only M2 implemented**. Before touching `Texture`.',
      ),
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].entry).toBe('texture source model');
    expect(claims[0].words).toContain('implemented');
    expect(claims[0].words).toContain('2026-07-30');
  });

  it('allows `unratified`, the one status word that changes what an agent may do', () => {
    // It says "do not build on this as settled" rather than reporting how far along the work is, so
    // it stays true until the design is ruled on. Banning it would push authors back to prose that rots.
    expect(
      findMapStatusClaims(
        mapWith(
          '- [render view model](agents/render-view-model.md) — **unratified.** Before touching `ApplicationRenderView`.',
        ),
      ),
    ).toEqual([]);
  });

  it('leaves the surrounding rules alone, which are allowed to say "implemented"', () => {
    // The AAA-completeness rule states a standard rather than reporting progress. A file-wide scan
    // flags it, and a check that contradicts its own doctrine gets muted rather than obeyed.
    const map = [
      '# Map',
      '',
      'The goal is to bring a feature area to AAA completeness — implemented using canonical patterns.',
      'A feature area that is partially built is unfinished work, not a design choice.',
      '',
      '## Domain Conventions',
      '',
      '- [export lanes](agents/conventions/export-lanes.md) — before adding a package export.',
      '',
    ].join('\n');
    expect(findMapStatusClaims(map)).toEqual([]);
  });

  it('ignores code spans and link targets, so a path is never mistaken for a claim', () => {
    // `agents/2026-07-30-notes.md` and a fenced `shipped` are data, not an assertion about progress.
    expect(
      findMapStatusClaims(mapWith('- [notes](agents/2026-07-30-notes.md) — before calling `markShipped`, read this.')),
    ).toEqual([]);
  });

  it('scans only pointer entries, not the rule bullets above them', () => {
    // The rule bullets legitimately name what they ban ("in-flight direction"), so scoping to
    // link-led entries is what keeps the check from flagging its own statement of the rule.
    expect(
      findMapStatusClaims(
        mapWith('- Anything whose audience is one role — plans, reviews, in-flight direction — goes elsewhere.'),
      ),
    ).toEqual([]);
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
