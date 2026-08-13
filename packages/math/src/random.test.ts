import { createRandomSource } from './random';

describe('createRandomSource', () => {
  it('produces values in [0, 1)', () => {
    const rng = createRandomSource(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic — same seed yields the same sequence', () => {
    const a = createRandomSource(0xc0ffee);
    const b = createRandomSource(0xc0ffee);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('different seeds yield different sequences', () => {
    const a = createRandomSource(1);
    const b = createRandomSource(2);
    let differs = false;
    for (let i = 0; i < 10; i++) if (a() !== b()) differs = true;
    expect(differs).toBe(true);
  });

  it('pins the mulberry32 transform with a known-answer sequence', () => {
    const rng = createRandomSource(0xc0ffee);
    expect([rng(), rng(), rng(), rng()]).toEqual([
      0.021141508361324668, 0.6661099966149777, 0.7799714196007699, 0.7395844468846917,
    ]);
  });

  it('tolerates non-finite seeds without producing NaN', () => {
    const rng = createRandomSource(NaN);
    const v = rng();
    expect(Number.isFinite(v)).toBe(true);
  });
});
