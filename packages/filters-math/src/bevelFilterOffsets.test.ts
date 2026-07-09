import { getBevelFilterOffsets } from './bevelFilterOffsets';

describe('getBevelFilterOffsets', () => {
  const makeOut = () => ({ dx: 0, dy: 0, negDx: 0, negDy: 0 });

  it('points the highlight along +x at angle 0', () => {
    const out = getBevelFilterOffsets(6, 0, makeOut());
    expect(out.dx).toBe(6);
    expect(out.dy).toBe(0);
    expect(out.negDx).toBe(-6);
    expect(out.negDy).toBe(0);
  });

  it('points the highlight along +y at angle 90 degrees', () => {
    const out = getBevelFilterOffsets(6, Math.PI / 2, makeOut());
    expect(out.dx).toBe(0);
    expect(out.dy).toBe(6);
    expect(out.negDx).toBe(0);
    expect(out.negDy).toBe(-6);
  });

  it('rounds an odd diagonal distance to whole pixels on both sides', () => {
    // cos(45°)·5 ≈ 3.5355 → 4 for both components; the shadow is the exact negation.
    const out = getBevelFilterOffsets(5, Math.PI / 4, makeOut());
    expect(out.dx).toBe(4);
    expect(out.dy).toBe(4);
    expect(out.negDx).toBe(-4);
    expect(out.negDy).toBe(-4);
  });

  it('keeps the shadow offsets the exact negation of the highlight offsets', () => {
    const out = getBevelFilterOffsets(7, Math.PI / 5, makeOut());
    expect(out.negDx).toBe(-out.dx);
    expect(out.negDy).toBe(-out.dy);
  });

  it('rounds before negating so a half-pixel highlight and shadow stay mirrored', () => {
    // Exact tie: cos(0)·2.5 = 2.5. Math.round ties toward +∞, so round(2.5) = 3 and the shadow is
    // its negation (-3). Rounding the shadow independently would give round(-2.5) = -2, skewing the
    // pair by a pixel — round-before-negate avoids that.
    const out = getBevelFilterOffsets(2.5, 0, makeOut());
    expect(out.dx).toBe(3);
    expect(out.negDx).toBe(-3);
    expect(out.negDx).not.toBe(Math.round(-2.5)); // -2, the value independent rounding would give
  });

  it('returns out', () => {
    const out = makeOut();
    expect(getBevelFilterOffsets(4, 0, out)).toBe(out);
  });
});
