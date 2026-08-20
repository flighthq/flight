import {
  computeFingerprintDisplacement,
  computeWorstAxisDisplacement,
  formatDisplacementReport,
  readDisplacementRows,
} from './capture-displacement';

// A 2x2 fingerprint in the committed format: `gridSize:` then RGB hex per cell, row-major.
function fingerprint(cells: readonly (readonly [number, number, number])[]): string {
  const size = Math.round(Math.sqrt(cells.length));
  const hex = cells
    .flat()
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');
  return `${size}:${hex}`;
}

const FLAT = fingerprint([
  [10, 10, 10],
  [10, 10, 10],
  [10, 10, 10],
  [10, 10, 10],
]);

// Black on the left, white on the right — a purely VERTICAL edge, which a sideways shift moves and an
// up-down shift does not.
const VERTICAL_EDGE = fingerprint([
  [0, 0, 0],
  [255, 255, 255],
  [0, 0, 0],
  [255, 255, 255],
]);

describe('computeFingerprintDisplacement', () => {
  // The instrument's whole claim is that it reports what the GATE would score, so a frame with nothing
  // to move must score zero — otherwise every row carries a floor that is not about the subject.
  it('scores a flat field at zero, since sliding it changes nothing', () => {
    expect(computeFingerprintDisplacement(FLAT, 1, 0)).toBe(0);
    expect(computeFingerprintDisplacement(FLAT, 0, 1)).toBe(0);
  });

  // ★ THE AXIS ASYMMETRY IS THE POINT, and it is why this cannot be collapsed to one number per target
  // before the caller sees both. A vertical edge is invisible to a vertical shift.
  it('sees a sideways shift of a vertical edge and not an up-down one', () => {
    expect(computeFingerprintDisplacement(VERTICAL_EDGE, 1, 0)).toBeGreaterThan(100);
    expect(computeFingerprintDisplacement(VERTICAL_EDGE, 0, 1)).toBe(0);
  });

  // Clamped, not wrapped: content slides within the frame and piles up at the edge. Wrapping would carry
  // the far edge round to the near one and invent a change the gate would never see.
  it('clamps at the edge rather than wrapping content around', () => {
    // Shifting a two-cell grid by two lands every cell on the clamped edge column, which for this edge
    // means every cell takes the left column's value — the maximum possible move.
    expect(computeFingerprintDisplacement(VERTICAL_EDGE, 2, 0)).toBe(
      computeFingerprintDisplacement(VERTICAL_EDGE, 1, 0),
    );
  });

  it('returns null for a fingerprint it cannot parse, rather than a number', () => {
    expect(computeFingerprintDisplacement('not-a-fingerprint', 1, 0)).toBeNull();
  });
});

describe('computeWorstAxisDisplacement', () => {
  // ★ THE WEAKER AXIS, NOT THE STRONGER AND NOT THE MEAN. The question is what could pass the gate, so
  // the answer has to be the axis that passes it. Taking the larger would report a target with one blind
  // axis as sighted — the exact thing this instrument exists to find.
  it('reports the axis the gate is weakest on', () => {
    expect(computeWorstAxisDisplacement(VERTICAL_EDGE, 1)).toBe(0);
    expect(computeFingerprintDisplacement(VERTICAL_EDGE, 1, 0)).toBeGreaterThan(0);
  });

  it('returns null for an unparseable fingerprint', () => {
    expect(computeWorstAxisDisplacement('16:zz', 1)).toBeNull();
  });
});

describe('formatDisplacementReport', () => {
  // Zero rows over zero targets is a different fact from zero over four hundred, so the count travels
  // with the verdict rather than being inferred from an empty list.
  it('prints the scanned count beside the findings', () => {
    expect(formatDisplacementReport([], 30)).toContain('0 fingerprinted targets');
  });

  it('counts the targets under the tolerance at each step size', () => {
    const text = formatDisplacementReport(
      [
        { oneCell: 1, target: 'a/canvas', twoCells: 2 },
        { oneCell: 9, target: 'b/canvas', twoCells: 9 },
      ],
      30,
    );

    expect(text).toContain('1 would not reach 5 if the frame moved ONE cell');
    expect(text).toContain('1 would not reach 5 if the frame moved TWO cells');
  });

  // The limit is a display bound, and a truncated list that did not say so would read as the whole set.
  it('says how many rows it withheld', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      oneCell: index,
      target: `t${index}/canvas`,
      twoCells: index,
    }));

    expect(formatDisplacementReport(rows, 2)).toContain('… 3 more');
  });

  // Stated in the output itself, not only in the source header: the two instruments answer different
  // questions, and this one bounds MOVEMENT alone.
  it('names its own scope and points at the other measure', () => {
    const text = formatDisplacementReport([], 30);

    expect(text).toContain('MOVEMENT only');
    expect(text).toContain('npm run contrast');
  });
});

describe('readDisplacementRows', () => {
  // Reads the committed baselines this repository actually ships, so a change to the fingerprint format
  // or the baseline layout surfaces here rather than as an empty report nobody questions.
  it('scores every committed functional fingerprint, worst first', () => {
    const rows = readDisplacementRows(process.cwd());

    expect(rows.length).toBeGreaterThan(100);
    for (let index = 1; index < rows.length; index++) {
      expect(rows[index]!.oneCell).toBeGreaterThanOrEqual(rows[index - 1]!.oneCell);
    }
  });
});
