import {
  getBevelFilterGlScratchCount,
  getColorMatrixFilterGlScratchCount,
  getConvolutionFilterGlScratchCount,
  getDisplacementMapFilterGlScratchCount,
  getDropShadowFilterGlScratchCount,
  getGradientBevelFilterGlScratchCount,
  getGradientGlowFilterGlScratchCount,
  getInnerGlowFilterGlScratchCount,
  getInnerShadowFilterGlScratchCount,
  getMedianFilterGlScratchCount,
  getOuterGlowFilterGlScratchCount,
  getPixelateFilterGlScratchCount,
  getSharpenFilterGlScratchCount,
} from './glScratchCount';

describe('getBevelFilterGlScratchCount', () => {
  it('returns 3', () => {
    expect(getBevelFilterGlScratchCount()).toBe(3);
  });
});

describe('getColorMatrixFilterGlScratchCount', () => {
  it('returns 0 (single-pass, no scratch)', () => {
    expect(getColorMatrixFilterGlScratchCount()).toBe(0);
  });
});

describe('getConvolutionFilterGlScratchCount', () => {
  it('returns 0 (single-pass, no scratch)', () => {
    expect(getConvolutionFilterGlScratchCount()).toBe(0);
  });
});

describe('getDisplacementMapFilterGlScratchCount', () => {
  it('returns 0 (single-pass, no scratch)', () => {
    expect(getDisplacementMapFilterGlScratchCount()).toBe(0);
  });
});

describe('getDropShadowFilterGlScratchCount', () => {
  it('returns 3', () => {
    expect(getDropShadowFilterGlScratchCount()).toBe(3);
  });
});

describe('getGradientBevelFilterGlScratchCount', () => {
  it('returns 3', () => {
    expect(getGradientBevelFilterGlScratchCount()).toBe(3);
  });
});

describe('getGradientGlowFilterGlScratchCount', () => {
  it('returns 3', () => {
    expect(getGradientGlowFilterGlScratchCount()).toBe(3);
  });
});

describe('getInnerGlowFilterGlScratchCount', () => {
  it('returns 3', () => {
    expect(getInnerGlowFilterGlScratchCount()).toBe(3);
  });
});

describe('getInnerShadowFilterGlScratchCount', () => {
  it('returns 3', () => {
    expect(getInnerShadowFilterGlScratchCount()).toBe(3);
  });
});

describe('getMedianFilterGlScratchCount', () => {
  it('returns 0 (single-pass, no scratch)', () => {
    expect(getMedianFilterGlScratchCount()).toBe(0);
  });
});

describe('getOuterGlowFilterGlScratchCount', () => {
  it('returns 3', () => {
    expect(getOuterGlowFilterGlScratchCount()).toBe(3);
  });
});

describe('getPixelateFilterGlScratchCount', () => {
  it('returns 0 (single-pass, no scratch)', () => {
    expect(getPixelateFilterGlScratchCount()).toBe(0);
  });
});

describe('getSharpenFilterGlScratchCount', () => {
  it('returns 2', () => {
    expect(getSharpenFilterGlScratchCount()).toBe(2);
  });
});
