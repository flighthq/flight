import {
  createBevelFilter,
  createBlurFilter,
  createColorMatrixFilter,
  createConvolutionFilter,
  createDisplacementMapFilter,
  createDropShadowFilter,
  createGradientBevelFilter,
  createGradientGlowFilter,
  createInnerGlowFilter,
  createInnerShadowFilter,
  createMedianFilter,
  createOuterGlowFilter,
  createPixelateFilter,
  createSharpenFilter,
} from './index';

describe('createBevelFilter', () => {
  it('sets type to bevel', () => {
    expect(createBevelFilter().type).toBe('bevel');
  });

  it('spreads provided options', () => {
    const f = createBevelFilter({ strength: 2, bevelType: 'outer' });
    expect(f.strength).toBe(2);
    expect(f.bevelType).toBe('outer');
  });
});

describe('createBlurFilter', () => {
  it('sets type to blur', () => {
    expect(createBlurFilter().type).toBe('blur');
  });

  it('spreads provided options', () => {
    const f = createBlurFilter({ blurX: 8, blurY: 4 });
    expect(f.blurX).toBe(8);
    expect(f.blurY).toBe(4);
  });
});

describe('createColorMatrixFilter', () => {
  it('sets type to colorMatrix', () => {
    const m = new Array(20).fill(0);
    expect(createColorMatrixFilter(m).type).toBe('colorMatrix');
  });

  it('stores the provided matrix', () => {
    const m = new Array(20).fill(1);
    expect(createColorMatrixFilter(m).matrix).toBe(m);
  });
});

describe('createConvolutionFilter', () => {
  it('sets type to convolution', () => {
    const f = createConvolutionFilter({ matrix: [1], matrixX: 1, matrixY: 1 });
    expect(f.type).toBe('convolution');
  });

  it('spreads required fields', () => {
    const matrix = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    const f = createConvolutionFilter({ matrix, matrixX: 3, matrixY: 3 });
    expect(f.matrixX).toBe(3);
    expect(f.matrixY).toBe(3);
  });
});

describe('createDisplacementMapFilter', () => {
  it('sets type to displacementMap', () => {
    expect(createDisplacementMapFilter().type).toBe('displacementMap');
  });

  it('spreads provided options', () => {
    const f = createDisplacementMapFilter({ scaleX: 10, scaleY: 5 });
    expect(f.scaleX).toBe(10);
    expect(f.scaleY).toBe(5);
  });
});

describe('createDropShadowFilter', () => {
  it('sets type to dropShadow', () => {
    expect(createDropShadowFilter().type).toBe('dropShadow');
  });

  it('spreads provided options', () => {
    const f = createDropShadowFilter({ color: 0xff0000, distance: 8 });
    expect(f.color).toBe(0xff0000);
    expect(f.distance).toBe(8);
  });
});

describe('createGradientBevelFilter', () => {
  it('sets type to gradientBevel', () => {
    const f = createGradientBevelFilter({ colors: [0xffffff], alphas: [1], ratios: [0] });
    expect(f.type).toBe('gradientBevel');
  });

  it('stores gradient arrays', () => {
    const colors = [0xffffff, 0x000000];
    const alphas = [1, 0];
    const ratios = [0, 255];
    const f = createGradientBevelFilter({ colors, alphas, ratios });
    expect(f.colors).toBe(colors);
    expect(f.alphas).toBe(alphas);
    expect(f.ratios).toBe(ratios);
  });
});

describe('createGradientGlowFilter', () => {
  it('sets type to gradientGlow', () => {
    const f = createGradientGlowFilter({ colors: [0xff0000], alphas: [1], ratios: [128] });
    expect(f.type).toBe('gradientGlow');
  });
});

describe('createInnerGlowFilter', () => {
  it('sets type to innerGlow', () => {
    expect(createInnerGlowFilter().type).toBe('innerGlow');
  });

  it('spreads provided options', () => {
    const f = createInnerGlowFilter({ color: 0x00ff00, strength: 2 });
    expect(f.color).toBe(0x00ff00);
    expect(f.strength).toBe(2);
  });
});

describe('createInnerShadowFilter', () => {
  it('sets type to innerShadow', () => {
    expect(createInnerShadowFilter().type).toBe('innerShadow');
  });

  it('spreads provided options', () => {
    const f = createInnerShadowFilter({ angle: 90, distance: 4 });
    expect(f.angle).toBe(90);
    expect(f.distance).toBe(4);
  });
});

describe('createMedianFilter', () => {
  it('sets type to median', () => {
    expect(createMedianFilter().type).toBe('median');
  });

  it('spreads provided options', () => {
    expect(createMedianFilter({ radius: 3 }).radius).toBe(3);
  });
});

describe('createOuterGlowFilter', () => {
  it('sets type to outerGlow', () => {
    expect(createOuterGlowFilter().type).toBe('outerGlow');
  });

  it('spreads provided options', () => {
    const f = createOuterGlowFilter({ color: 0xffff00, knockout: true });
    expect(f.color).toBe(0xffff00);
    expect(f.knockout).toBe(true);
  });
});

describe('createPixelateFilter', () => {
  it('sets type to pixelate', () => {
    expect(createPixelateFilter().type).toBe('pixelate');
  });

  it('spreads provided options', () => {
    expect(createPixelateFilter({ blockSize: 16 }).blockSize).toBe(16);
  });
});

describe('createSharpenFilter', () => {
  it('sets type to sharpen', () => {
    expect(createSharpenFilter().type).toBe('sharpen');
  });

  it('spreads provided options', () => {
    const f = createSharpenFilter({ amount: 1.5, blurX: 3 });
    expect(f.amount).toBe(1.5);
    expect(f.blurX).toBe(3);
  });
});
