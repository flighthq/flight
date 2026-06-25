import { getBlurPassCountForQuality } from './blurQuality';

describe('getBlurPassCountForQuality', () => {
  it('returns 1 for quality 1', () => {
    expect(getBlurPassCountForQuality(1)).toBe(1);
  });

  it('returns 2 for quality 2', () => {
    expect(getBlurPassCountForQuality(2)).toBe(2);
  });

  it('returns 2 for quality 3 (2 passes covers quality 2–8)', () => {
    expect(getBlurPassCountForQuality(3)).toBe(2);
  });

  it('returns 3 for quality 9 and above (3 passes covers quality 9–15)', () => {
    expect(getBlurPassCountForQuality(9)).toBe(3);
    expect(getBlurPassCountForQuality(15)).toBe(3);
  });

  it('clamps quality 0 to 1 pass', () => {
    expect(getBlurPassCountForQuality(0)).toBe(1);
  });

  it('clamps negative quality to 1 pass', () => {
    expect(getBlurPassCountForQuality(-5)).toBe(1);
  });

  it('clamps quality above 15 to the 3-pass tier', () => {
    expect(getBlurPassCountForQuality(20)).toBe(3);
  });
});
