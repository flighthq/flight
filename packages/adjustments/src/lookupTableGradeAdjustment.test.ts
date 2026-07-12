import { bakeColorLut } from './colorLut';
import { createLookupTableGradeAdjustment } from './lookupTableGradeAdjustment';

describe('createLookupTableGradeAdjustment', () => {
  it('is a neutral passthrough with no supplied LUT', () => {
    const adjustment = createLookupTableGradeAdjustment();
    expect(adjustment.kind).toBe('LookupTableGradeAdjustment');
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 0.2, 0.4, 0.6);
    expect(out[0]).toBeCloseTo(0.2, 5);
    expect(out[1]).toBeCloseTo(0.4, 5);
    expect(out[2]).toBeCloseTo(0.6, 5);
  });

  it('applies a supplied LUT at full strength', () => {
    const invertLut = bakeColorLut(
      [
        (out, r, g, b) => {
          out[0] = 1 - r;
          out[1] = 1 - g;
          out[2] = 1 - b;
        },
      ],
      16,
    );
    const adjustment = createLookupTableGradeAdjustment({ lut: invertLut });
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 0, 0, 0);
    expect(out[0]).toBeCloseTo(1, 4);
  });

  it('mixes toward the graded color by strength', () => {
    const invertLut = bakeColorLut(
      [
        (out, r, g, b) => {
          out[0] = 1 - r;
          out[1] = 1 - g;
          out[2] = 1 - b;
        },
      ],
      16,
    );
    const adjustment = createLookupTableGradeAdjustment({ lut: invertLut, strength: 0.5 });
    const out: [number, number, number] = [0, 0, 0];
    // input 0 → graded 1 → mix(0, 1, 0.5) = 0.5.
    adjustment.transform(out, 0, 0, 0);
    expect(out[0]).toBeCloseTo(0.5, 4);
  });
});
