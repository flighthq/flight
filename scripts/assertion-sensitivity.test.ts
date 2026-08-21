import {
  ASSERTION_SENSITIVITY_CONTROLS,
  assertSensitivityControls,
  classifyAssertionSource,
  formatAssertionSensitivityReport,
  hasCurrentAssertionSensitivitySemantics,
  readAssertionSensitivityRows,
} from './assertion-sensitivity.mjs';

const PREFIX = `
  type Bitmap = { height: number; width: number };
  declare function getBitmapPixelRgb(frame: Bitmap, x: number, y: number): number;
`;

describe('assertSensitivityControls', () => {
  it('fails when a known-answer control changes classification', () => {
    const path = Object.keys(ASSERTION_SENSITIVITY_CONTROLS)[0]!;
    const expected = ASSERTION_SENSITIVITY_CONTROLS[path]!;
    const wrong = expected === 'able' ? 'blind' : 'able';

    expect(() => assertSensitivityControls([{ evidence: 'mutant', line: 1, path, verdict: wrong }])).toThrow(path);
  });
});

describe('classifyAssertionSource', () => {
  it('keeps a whole-frame coverage fraction blind to rearrangement', () => {
    const source = `${PREFIX}
      export function assertRender(frame: Bitmap): void {
        let bright = 0;
        for (let y = 0; y < frame.height; y++) {
          for (let x = 0; x < frame.width; x++) {
            if (getBitmapPixelRgb(frame, x, y) > 40) bright++;
          }
        }
        if (bright < 20) throw new Error('too little coverage');
      }
    `;

    expect(classifyAssertionSource('coverage.ts', source)).toMatchObject({ verdict: 'blind' });
  });

  it('recognizes a named point whose value is thresholded inside a sampling loop', () => {
    const source = `${PREFIX}
      export function assertRender(frame: Bitmap): void {
        for (const [x, y] of [[20, 30], [80, 30]]) {
          const pixel = getBitmapPixelRgb(frame, x, y);
          if (pixel < 40) throw new Error('named point is dark');
        }
      }
    `;

    expect(classifyAssertionSource('points.ts', source)).toMatchObject({ verdict: 'able' });
  });

  it('uses aggregate-helper call-site bounds to recognize per-region comparisons', () => {
    const source = `${PREFIX}
      function mean(frame: Bitmap, x0: number, y0: number, x1: number, y1: number): number {
        let sum = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) sum += getBitmapPixelRgb(frame, x, y);
        }
        return sum / ((x1 - x0) * (y1 - y0));
      }
      export function assertRender(frame: Bitmap): void {
        const left = mean(frame, 0, 0, 20, 40);
        const right = mean(frame, 80, 0, 100, 40);
        if (left >= right) throw new Error('regions reversed');
      }
    `;

    const row = classifyAssertionSource('regions.ts', source);
    expect(row).toMatchObject({ verdict: 'able' });
    expect(row.evidence).toContain('2 distinct call-site regions');
    expect(row.evidence).toContain('0 | 0 | 20 | 40');
    expect(row.evidence).toContain('80 | 0 | 100 | 40');
  });

  it('follows helpers with object return types instead of mistaking the type literal for the body', () => {
    const source = `${PREFIX}
      function energy(frame: Bitmap): { adjacent: number; mean: number } {
        let adjacent = 0;
        let previous = 0;
        for (let x = 0; x < frame.width; x++) {
          const value = getBitmapPixelRgb(frame, x, 0);
          adjacent += Math.abs(value - previous);
          previous = value;
        }
        return { adjacent, mean: 0 };
      }
      export function assertRender(frame: Bitmap): void {
        const result = energy(frame);
        if (result.adjacent < 3) throw new Error('no edge energy');
      }
    `;

    expect(classifyAssertionSource('object-return.ts', source)).toMatchObject({ verdict: 'able' });
  });

  it('labels an assertRender without an executable threshold as a gap', () => {
    const source = `${PREFIX}
      export function assertRender(frame: Bitmap): void {
        getBitmapPixelRgb(frame, 20, 30);
      }
    `;

    expect(classifyAssertionSource('gap.ts', source)).toMatchObject({ verdict: 'gap' });
  });
});

describe('formatAssertionSensitivityReport', () => {
  it('prints the population and per-case evidence in the committed format', () => {
    const report = formatAssertionSensitivityReport([
      { evidence: 'point at (4, 8)', line: 12, path: 'functional/scenes/example.ts', verdict: 'able' },
    ]);

    expect(report).toContain('| **total** | **1** |');
    expect(report).toContain('`functional/scenes/example.ts` | able | L12: point at (4, 8)');
  });
});

describe('hasCurrentAssertionSensitivitySemantics', () => {
  it('keeps a pure evidence-line shift green', () => {
    const committed = formatAssertionSensitivityReport([
      { evidence: 'named point', line: 12, path: 'functional/scenes/example.ts', verdict: 'able' },
    ]);
    const current = [
      { evidence: 'named point', line: 47, path: 'functional/scenes/example.ts', verdict: 'able' as const },
    ];

    expect(formatAssertionSensitivityReport(current)).not.toBe(committed);
    expect(hasCurrentAssertionSensitivitySemantics(current, committed)).toBe(true);
  });

  it('fails when a scene verdict changes', () => {
    const committed = formatAssertionSensitivityReport([
      { evidence: 'named point', line: 12, path: 'functional/scenes/example.ts', verdict: 'able' },
    ]);
    const current = [
      { evidence: 'whole-frame aggregate', line: 12, path: 'functional/scenes/example.ts', verdict: 'blind' as const },
    ];

    expect(hasCurrentAssertionSensitivitySemantics(current, committed)).toBe(false);
  });

  it('fails when a scene identity changes', () => {
    const committed = formatAssertionSensitivityReport([
      { evidence: 'named point', line: 12, path: 'functional/scenes/example.ts', verdict: 'able' },
    ]);
    const current = [
      { evidence: 'named point', line: 12, path: 'functional/scenes/renamed.ts', verdict: 'able' as const },
    ];

    expect(hasCurrentAssertionSensitivitySemantics(current, committed)).toBe(false);
  });
});

describe('readAssertionSensitivityRows', () => {
  // ★ A RATCHET, NOT AN EQUALITY, ON THE TWO COUNTS THAT MOVE WITH SCENE QUALITY. Pinning `able` and
  // `blind` exactly meant that STRENGTHENING a scene assertion broke this test: `5378d657d` gave the
  // three effect-empty-passthrough cells position probes on top of their colour-set check, which is
  // precisely the improvement this census exists to encourage, and it failed here as 340 against an
  // expected 337. An equality cannot tell an improvement from a regression, so it made the good change
  // and the bad change cost the same edit — and the edit is in a file the author has no reason to open.
  //
  // The direction is what matters: `blind` may fall and must never rise. That still catches an assertion
  // being weakened, which is the thing worth catching, and stops charging for the opposite.
  const BLIND_CEILING = 16;

  it('re-runs every current-tree control and retains every scene identity', () => {
    const rows = readAssertionSensitivityRows(process.cwd());

    expect(rows).toHaveLength(356);
    expect(rows.filter((row) => row.verdict === 'blind').length).toBeLessThanOrEqual(BLIND_CEILING);
    // Total is still exact, so a scene silently leaving the census is a failure rather than a smaller
    // number nobody reads; able is whatever the other two are not.
    expect(rows.filter((row) => row.verdict === 'able').length).toBe(
      rows.length - rows.filter((row) => row.verdict === 'blind').length,
    );
    expect(rows.filter((row) => row.verdict === 'exempt')).toHaveLength(0);
    expect(rows.filter((row) => row.verdict === 'gap')).toHaveLength(0);
    expect(new Set(rows.map((row) => row.path)).size).toBe(rows.length);
    expect(() => assertSensitivityControls(rows)).not.toThrow();
  });

  // The ceiling has to be able to fail, or it is a comment. Lowering it below the current count is the
  // same shape as a scene regressing from `able` to `blind`.
  it('fails when blind scenes outnumber the ceiling', () => {
    const rows = readAssertionSensitivityRows(process.cwd());
    const blind = rows.filter((row) => row.verdict === 'blind').length;

    expect(blind).toBeGreaterThan(BLIND_CEILING - 1);
  });
});
