import {
  GUARDED_LEDGERS,
  checkAppendOnlyLedgers,
  findLedgerSections,
  formatAppendOnlyLedgerReport,
  getLedgerCellName,
  selectLedgerBaseline,
} from './check-append-only-ledgers';
import type { LedgerSection } from './check-append-only-ledgers';

// The real Approved line from `agents/packages/particles/assessment.md`, and the one the end-to-end
// probe edited to produce the MUST-FAIL half of the pair.
const APPROVED_LINE =
  '- [2026-07-02 · picked] Sweep items 1–5: spawnOffset status, field order, deterministic-replay test, edge spawn doc, spawn shape type alignment';

function approved(cell: string, ...lines: readonly string[]): LedgerSection {
  return { cell, file: 'assessment.md', heading: 'Approved', lines: ['', ...lines] };
}

describe('GUARDED_LEDGERS', () => {
  it('guards exactly the two sections CONTRACT.md names, and no others', () => {
    // Scope is a ruling with class scope: widening it here silently binds every cell's `Recommended`
    // and `status.md` to a rule the contract does not put them under. `status.md` is append-only by
    // convention too, and is deliberately absent.
    expect(GUARDED_LEDGERS.map((entry) => `${entry.file} › ${entry.heading}`)).toEqual([
      'assessment.md › Approved',
      'charter.md › Decisions',
    ]);
  });
});

// THE MINIMAL PAIR. Both halves use the same cell, the same file, the same single ledger line. The ONLY
// difference is whether that line survived byte-identical. Verified end to end against real history
// first: `7fc1c08ca` (retires two Recommended items as struck notes, Approved untouched) PASSES, and the
// same tree with one synthetic character added to this Approved line FAILS.
describe('checkAppendOnlyLedgers', () => {
  it('PASSES when the guarded line survives and the change lands elsewhere', () => {
    const report = checkAppendOnlyLedgers(
      [approved('particles', APPROVED_LINE)],
      [approved('particles', APPROVED_LINE)],
      new Set(),
    );
    expect(report.violations).toEqual([]);
    expect(report.comparedSections).toBe(1);
  });

  it('FAILS when the same line is edited in place, however small the edit', () => {
    const edited = APPROVED_LINE.replace('Sweep items', 'Sweep items (tweaked)');
    const report = checkAppendOnlyLedgers(
      [approved('particles', APPROVED_LINE)],
      [approved('particles', edited)],
      new Set(),
    );
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].line).toBe(APPROVED_LINE);
  });

  it('leaves additions free, which is the whole point of append-only', () => {
    const added = '- [2026-08-05 · picked] a later approval';
    const report = checkAppendOnlyLedgers(
      [approved('x', APPROVED_LINE)],
      [approved('x', APPROVED_LINE, added)],
      new Set(),
    );
    expect(report.violations).toEqual([]);
  });

  it('is order-independent, so reordering a ledger is not a violation', () => {
    const a = '- [2026-07-02 · picked] first';
    const b = '- [2026-07-03 · picked] second';
    expect(checkAppendOnlyLedgers([approved('x', a, b)], [approved('x', b, a)], new Set()).violations).toEqual([]);
  });

  it('counts by MULTISET, so losing one of two identical lines is still a deletion', () => {
    const line = '- [2026-07-02 · picked] duplicated by hand';
    const report = checkAppendOnlyLedgers([approved('x', line, line)], [approved('x', line)], new Set());
    expect(report.violations).toHaveLength(1);
  });

  it('ignores blank lines, so reflowing the whitespace around a ledger is not a deletion', () => {
    const report = checkAppendOnlyLedgers(
      [{ cell: 'x', file: 'assessment.md', heading: 'Approved', lines: ['', APPROVED_LINE, '', ''] }],
      [{ cell: 'x', file: 'assessment.md', heading: 'Approved', lines: [APPROVED_LINE] }],
      new Set(),
    );
    expect(report.violations).toEqual([]);
  });

  it('FAILS a line moved out of the guarded section, even though it is still in the file', () => {
    // Preservation is per-section. A line relocated into `Recommended` has left the ledger, and reading
    // the file as a whole would call that untouched.
    const report = checkAppendOnlyLedgers([approved('x', APPROVED_LINE)], [approved('x')], new Set());
    expect(report.violations).toHaveLength(1);
  });

  it('FAILS the struck-note form applied to an Approved line, which is lawful only in Recommended', () => {
    // CONTRACT.md sanctions `~~text~~ — LANDED …` for retiring a RECOMMENDED item. Applied to the
    // authorization ledger it rewrites an approval, which is the one thing that cannot happen.
    const struck = `- ~~${APPROVED_LINE.slice(2)}~~ — **LANDED 2026-08-05:** packages/particles/src.`;
    const report = checkAppendOnlyLedgers([approved('x', APPROVED_LINE)], [approved('x', struck)], new Set());
    expect(report.violations).toHaveLength(1);
  });

  // WHOLE-CELL REMOVAL vs LINE DELETION — the pair that keeps deleting a package possible without
  // opening a laundering route. Both halves delete every guarded line; they differ only in whether the
  // cell itself is gone.
  it('does NOT report a whole-cell removal, because deleting a package takes its ledgers with it', () => {
    const report = checkAppendOnlyLedgers([approved('sprite', APPROVED_LINE)], [], new Set(['sprite']));
    expect(report.violations).toEqual([]);
    expect(report.removals).toEqual([{ cell: 'sprite', file: 'assessment.md', heading: 'Approved', lines: 1 }]);
  });

  it('DOES report the same disappearance when the cell is still there', () => {
    const report = checkAppendOnlyLedgers([approved('sprite', APPROVED_LINE)], [], new Set());
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].detail).toContain('the cell remains');
    expect(report.removals).toEqual([]);
  });
});

describe('findLedgerSections', () => {
  it('extracts both guarded sections and nothing else', () => {
    const charter = [
      '## Decisions',
      '',
      '- **[2026-07-01] a decision.**',
      '',
      '## Open directions',
      '',
      '- not guarded',
    ].join('\n');
    const sections = findLedgerSections([{ path: 'agents/packages/mesh/charter.md', text: charter }]);
    // The trailing blanks are the section's own whitespace, carried verbatim rather than trimmed: the
    // comparison drops blank lines itself, so trimming here would be a second place for the two to
    // disagree about what a ledger line is.
    expect(sections).toEqual([
      { cell: 'mesh', file: 'charter.md', heading: 'Decisions', lines: ['', '- **[2026-07-01] a decision.**', '', ''] },
    ]);
  });

  it('ignores a section heading that lives in the wrong file', () => {
    // `Approved` belongs to assessment.md. A charter that happens to carry the heading is not a ledger,
    // and guarding it would invent scope the contract does not grant.
    expect(findLedgerSections([{ path: 'agents/packages/mesh/charter.md', text: '## Approved\n\n- x' }])).toEqual([]);
  });

  it('ignores a file outside a cell', () => {
    expect(findLedgerSections([{ path: 'agents/packages/CONTRACT.md', text: '## Approved\n\n- x' }])).toEqual([]);
  });
});

describe('formatAppendOnlyLedgerReport', () => {
  it('says plainly when it compared nothing, rather than printing a clean-looking OK', () => {
    // A check that verifies nothing must not read as a check that found nothing. This is the line that
    // tells a reader the run was inert — in CI's shallow checkout there is no merge-base to resolve.
    const output = formatAppendOnlyLedgerReport(
      { baselineLines: 0, comparedSections: 0, removals: [], violations: [] },
      'no baseline revision could be resolved',
    );
    expect(output).toContain('verified nothing');
  });

  it('names every removal on every run, so the one exemption is never invisible', () => {
    const output = formatAppendOnlyLedgerReport(
      {
        baselineLines: 3,
        comparedSections: 1,
        removals: [{ cell: 'sprite', file: 'assessment.md', heading: 'Approved', lines: 3 }],
        violations: [],
      },
      'baseline: merge-base',
    );
    expect(output).toContain('sprite no longer exists');
  });
});

// THREE WRONG VERSIONS OF ONE RULE, each pinned by the case that broke it. Every one of them made the
// check judge the wrong revision range, and two of them were only visible by RUNNING it — the first on
// its first run, the second on the rebase that integrated it. That is why the selection is pure and
// separated from the git calls: the git-shaped version could only be tested by having the right history.
describe('selectLedgerBaseline', () => {
  const SELF = { distance: 0, name: 'main', revision: '49953c97b' };
  const DEVELOP = { distance: 0, name: 'origin/develop', revision: '49953c97b' };
  const MAIN = { distance: 366, name: 'origin/main', revision: '1b4fb2bdf' };

  it('IGNORES the checked-out branch, which contains HEAD by definition and proves nothing', () => {
    // Third wrong version: treating this as evidence of integration made the check report "already
    // integrated" in every clone, always — inertness wearing a reason.
    expect(selectLedgerBaseline([SELF, { ...DEVELOP, distance: 1 }], 'main').revision).toBe('49953c97b');
  });

  it('SKIPS a remote candidate that contains HEAD and keeps looking, which is the push build', () => {
    // A test asserting the opposite stood here and pinned a design choice, not a rule: a containing
    // candidate was treated as settling the question. On a push to develop, `origin/develop` IS the
    // tip being checked, so that one candidate ended the search and the run compared nothing at any
    // fetch depth — and push is how work reaches develop here. Useless AS A BASELINE is not the same
    // as no baseline available.
    const chosen = selectLedgerBaseline([SELF, DEVELOP, MAIN], 'main');
    expect(chosen.revision).toBe('1b4fb2bdf');
    expect(chosen.how).toContain('366 commits');
  });

  it('checks NOTHING only once EVERY candidate contains HEAD', () => {
    // The pair for the case above: same shape, minus the one candidate that was behind. With nothing
    // left that HEAD is ahead of, the tree really is integrated and there is no work in flight.
    const chosen = selectLedgerBaseline([SELF, DEVELOP], 'main');
    expect(chosen.revision).toBeNull();
    expect(chosen.how).toContain('no work in flight');
  });

  it('uses a formerly-containing candidate as the baseline once it no longer contains HEAD', () => {
    // Nearest still wins among the usable ones: `origin/develop` at 2 beats `origin/main` at 366.
    expect(selectLedgerBaseline([SELF, { ...DEVELOP, distance: 2 }, MAIN], 'main').revision).toBe('49953c97b');
  });

  it('takes the nearest merge-base, not the first candidate offered', () => {
    // First wrong version: in an agent clone `@{upstream}` is `origin/main`, hundreds of commits back,
    // so first-that-resolves made months of everyone's history the branch under review.
    expect(selectLedgerBaseline([MAIN, { ...DEVELOP, distance: 1 }], 'main').revision).toBe('49953c97b');
  });

  it('reports that it resolved nothing rather than throwing, when there are no candidates at all', () => {
    const chosen = selectLedgerBaseline([], 'main');
    expect(chosen.revision).toBeNull();
    expect(chosen.how).toContain('no baseline revision could be resolved');
  });

  it('reports the same when the checked-out branch was the only candidate', () => {
    // A detached head or a clone with no remote refs at all lands here, and it must skip rather than
    // throw: the sweep must not stop for a reason unrelated to the invariant.
    expect(selectLedgerBaseline([SELF], 'main').revision).toBeNull();
  });
});

describe('getLedgerCellName', () => {
  it('names the cell a ledger belongs to', () => {
    expect(getLedgerCellName('agents/packages/mesh/charter.md')).toBe('mesh');
  });

  it('does not treat the contract itself as a cell file', () => {
    expect(getLedgerCellName('agents/packages/CONTRACT.md')).toBeNull();
  });

  it('does not reach deeper than a cell', () => {
    expect(getLedgerCellName('agents/packages/swf/notes/deep.md')).toBeNull();
  });

  it('ignores a lookalike path outside agents/', () => {
    expect(getLedgerCellName('packages/mesh/charter.md')).toBeNull();
  });
});
