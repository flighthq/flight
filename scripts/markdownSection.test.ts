import { readSection } from './markdownSection';

describe('readSection', () => {
  it('reads the body between a heading and the next one', () => {
    const text = ['## Decisions', '', '- one', '- two', '', '## Open directions', '', '- three'].join('\n');
    expect(readSection(text, 'Decisions')).toBe('\n- one\n- two\n\n');
  });

  it('reads a section that runs to the end of the document', () => {
    // The end-of-string form must be `$(?![\s\S])`: under the `m` flag a bare `$` matches every line
    // end, so a lazy quantifier stops at the first newline and the capture comes back EMPTY. That exact
    // bug silently zeroed the Open-directions term of every bless-queue attention score, and `Approved`
    // is the last section of most assessments — so the ledger check inherits the same dependency.
    expect(readSection(['## Approved', '', '- [2026-07-02 · picked] item'].join('\n'), 'Approved')).toBe(
      '\n- [2026-07-02 · picked] item',
    );
  });

  it('stops at a horizontal rule', () => {
    expect(readSection(['## Decisions', '', '- one', '', '---', '', 'footer'].join('\n'), 'Decisions')).toBe(
      '\n- one\n\n',
    );
  });

  it('returns null when the heading is absent, which is different from an empty section', () => {
    // The ledger check turns on this distinction: a cell with no `Decisions` heading yet has nothing to
    // preserve, while a cell that HAD one and lost it has deleted a ledger.
    expect(readSection('## Approved\n\n- x', 'Decisions')).toBeNull();
  });

  it('matches a heading that carries trailing text, so `## Approved (frozen)` is still Approved', () => {
    // Deliberate, and shared by both gates: the docs gate validates whatever this returns and the
    // ledger check guards it, so they can never disagree about where a section is. The cost is that a
    // heading renamed to a PREFIX-EXTENDED form stays the same section; a genuine rename does not.
    expect(readSection('## Approved (frozen)\n\n- x', 'Approved')).toBe('\n- x');
    expect(readSection('## Archive\n\n- x', 'Approved')).toBeNull();
  });
});
