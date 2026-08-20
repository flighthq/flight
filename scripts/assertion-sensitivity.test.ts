import {
  ASSERTION_SENSITIVITY_CONTROLS,
  assertSensitivityControls,
  classifyAssertionSource,
  formatAssertionSensitivityReport,
  readAssertionSensitivityRows,
} from './assertion-sensitivity.mjs';

const PREFIX = `
  type Bitmap = { height: number; width: number };
`;

describe('assertion sensitivity census', () => {
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

  it('fails when a known-answer control changes classification', () => {
    const path = Object.keys(ASSERTION_SENSITIVITY_CONTROLS)[0]!;
    const expected = ASSERTION_SENSITIVITY_CONTROLS[path]!;
    const wrong = expected === 'able' ? 'blind' : 'able';

    expect(() => assertSensitivityControls([{ evidence: 'mutant', line: 1, path, verdict: wrong }])).toThrow(
      path,
    );
  });

  it('re-runs every current-tree control and retains every scene identity', () => {
    const rows = readAssertionSensitivityRows(process.cwd());

    expect(rows.length).toBeGreaterThan(300);
    expect(new Set(rows.map((row) => row.path)).size).toBe(rows.length);
    expect(() => assertSensitivityControls(rows)).not.toThrow();
  });

  it('prints the population and per-case evidence in the committed format', () => {
    const report = formatAssertionSensitivityReport([
      { evidence: 'point at (4, 8)', line: 12, path: 'functional/scenes/example.ts', verdict: 'able' },
    ]);

    expect(report).toContain('| **total** | **1** |');
    expect(report).toContain('`functional/scenes/example.ts` | able | L12: point at (4, 8)');
  });
});
