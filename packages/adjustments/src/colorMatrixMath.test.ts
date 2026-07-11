import {
  applyColorMatrixToColor,
  COLOR_MATRIX_LENGTH,
  concatColorMatrix,
  createBrightnessColorMatrix,
  createChannelMixerColorMatrix,
  createColorBalanceColorMatrix,
  createColorMatrixFromTint,
  createContrastColorMatrix,
  createDesaturateColorMatrix,
  createGrayscaleColorMatrix,
  createHueRotateColorMatrix,
  createIdentityColorMatrix,
  createInvertColorMatrix,
  createLevelsColorMatrix,
  createOpacityColorMatrix,
  createPolaroidColorMatrix,
  createSaturationColorMatrix,
  createSepiaColorMatrix,
  createTechnicolorColorMatrix,
  createVintageColorMatrix,
  createWhiteBalanceColorMatrix,
  multiplyColorMatrix,
} from './colorMatrixMath';

const WHITE = 0xffffffff;
const BLACK = 0x000000ff;
const RED = 0xff0000ff;
const GREEN = 0x00ff00ff;

describe('applyColorMatrixToColor', () => {
  it('identity matrix leaves color unchanged', () => {
    const identity = createIdentityColorMatrix();
    expect(applyColorMatrixToColor(identity, RED)).toBe(RED);
    expect(applyColorMatrixToColor(identity, GREEN)).toBe(GREEN);
    expect(applyColorMatrixToColor(identity, WHITE)).toBe(WHITE);
  });

  it('invert matrix inverts RGB channels', () => {
    const inv = createInvertColorMatrix();
    // 0xff0000ff → 0x00ffffff
    expect(applyColorMatrixToColor(inv, 0xff0000ff)).toBe(0x00ffffff);
  });

  it('grayscale matrix produces equal R/G/B', () => {
    const gray = createGrayscaleColorMatrix();
    const result = applyColorMatrixToColor(gray, RED);
    const r = (result >>> 24) & 0xff;
    const g = (result >>> 16) & 0xff;
    const b = (result >>> 8) & 0xff;
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe('COLOR_MATRIX_LENGTH', () => {
  it('is 20', () => {
    expect(COLOR_MATRIX_LENGTH).toBe(20);
  });
});

describe('concatColorMatrix', () => {
  it('applying identity leaves matrix unchanged', () => {
    const m = createGrayscaleColorMatrix();
    const original = m.slice();
    concatColorMatrix(m, createIdentityColorMatrix());
    expect(m).toEqual(original);
  });

  it('is alias-safe when target === source', () => {
    const m = createIdentityColorMatrix();
    const original = m.slice();
    concatColorMatrix(m, m);
    // identity ∘ identity = identity
    expect(m).toEqual(original);
  });
});

describe('createBrightnessColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createBrightnessColorMatrix(50)).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('brightens black to grey', () => {
    const m = createBrightnessColorMatrix(128);
    const result = applyColorMatrixToColor(m, BLACK);
    const r = (result >>> 24) & 0xff;
    expect(r).toBe(128);
  });
});

describe('createChannelMixerColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createChannelMixerColorMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1])).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('identity mix leaves color unchanged', () => {
    const m = createChannelMixerColorMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });

  it('swap R and G channels', () => {
    const m = createChannelMixerColorMatrix([0, 1, 0], [1, 0, 0], [0, 0, 1]);
    // Apply to 0xff0000ff (pure red) — should output pure green
    const result = applyColorMatrixToColor(m, 0xff0000ff);
    const r = (result >>> 24) & 0xff;
    const g = (result >>> 16) & 0xff;
    expect(r).toBe(0);
    expect(g).toBe(255);
  });
});

describe('createColorBalanceColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createColorBalanceColorMatrix([0, 0, 0], [0, 0, 0], [0, 0, 0])).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('all-zero offsets is identity', () => {
    const m = createColorBalanceColorMatrix([0, 0, 0], [0, 0, 0], [0, 0, 0]);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });

  it('positive red midtone raises red channel offset', () => {
    const m = createColorBalanceColorMatrix([0, 0, 0], [100, 0, 0], [0, 0, 0]);
    // Red offset should be positive (midtone weight 0.5 * 255 = 127.5)
    expect(m[4]).toBeCloseTo(127.5, 0);
    expect(m[9]).toBeCloseTo(0, 5); // green unaffected
    expect(m[14]).toBeCloseTo(0, 5); // blue unaffected
  });
});

describe('createColorMatrixFromTint', () => {
  it('returns a 20-element array', () => {
    expect(createColorMatrixFromTint(0xff0000ff, 0.5)).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('amount=0 is identity', () => {
    const m = createColorMatrixFromTint(0xff0000ff, 0);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });
});

describe('createContrastColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createContrastColorMatrix(1.5)).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('amount=1 is identity', () => {
    const m = createContrastColorMatrix(1);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });
});

describe('createDesaturateColorMatrix', () => {
  it('amount=1 produces a grayscale matrix', () => {
    const desaturate = createDesaturateColorMatrix(1);
    const grayscale = createGrayscaleColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(desaturate[i]).toBeCloseTo(grayscale[i]);
    }
  });

  it('amount=0 is identity', () => {
    const m = createDesaturateColorMatrix(0);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });
});

describe('createGrayscaleColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createGrayscaleColorMatrix()).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('luma row sums to 1', () => {
    const m = createGrayscaleColorMatrix();
    expect(m[0] + m[1] + m[2]).toBeCloseTo(1);
  });
});

describe('createHueRotateColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createHueRotateColorMatrix(90)).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('0 degrees is close to identity', () => {
    const m = createHueRotateColorMatrix(0);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });

  it('360 degrees is close to identity', () => {
    const m = createHueRotateColorMatrix(360);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });
});

describe('createIdentityColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createIdentityColorMatrix()).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('leaves red unchanged', () => {
    expect(applyColorMatrixToColor(createIdentityColorMatrix(), RED)).toBe(RED);
  });
});

describe('createInvertColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createInvertColorMatrix()).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('inverts white to black (RGB only, alpha unchanged)', () => {
    const result = applyColorMatrixToColor(createInvertColorMatrix(), 0xffffff00);
    expect((result >>> 24) & 0xff).toBe(0);
    expect((result >>> 16) & 0xff).toBe(0);
    expect((result >>> 8) & 0xff).toBe(0);
  });
});

describe('createLevelsColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createLevelsColorMatrix(0, 255, 0, 255)).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('full range with gamma=1 is identity', () => {
    const m = createLevelsColorMatrix(0, 255, 0, 255, 1);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });

  it('clips blacks: inBlack=128 shifts scale', () => {
    const m = createLevelsColorMatrix(128, 255, 0, 255);
    // scale = 255 / (255-128) ≈ 2.008; offset = 0 - 128 * 2.008 ≈ -257
    expect(m[0]).toBeGreaterThan(1); // amplified
  });
});

describe('createOpacityColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createOpacityColorMatrix(0.5)).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('scales alpha channel', () => {
    const m = createOpacityColorMatrix(0.5);
    // white fully opaque (alpha=255) → alpha should be ~128
    const result = applyColorMatrixToColor(m, WHITE);
    const a = result & 0xff;
    expect(a).toBeCloseTo(128, 0);
  });
});

describe('createPolaroidColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createPolaroidColorMatrix()).toHaveLength(COLOR_MATRIX_LENGTH);
  });
});

describe('createSaturationColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createSaturationColorMatrix(0.5)).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('saturation=1 is identity', () => {
    const m = createSaturationColorMatrix(1);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });

  it('saturation=0 matches grayscale matrix', () => {
    const sat0 = createSaturationColorMatrix(0);
    const gray = createGrayscaleColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(sat0[i]).toBeCloseTo(gray[i]);
    }
  });
});

describe('createSepiaColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createSepiaColorMatrix()).toHaveLength(COLOR_MATRIX_LENGTH);
  });
});

describe('createTechnicolorColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createTechnicolorColorMatrix()).toHaveLength(COLOR_MATRIX_LENGTH);
  });
});

describe('createVintageColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createVintageColorMatrix()).toHaveLength(COLOR_MATRIX_LENGTH);
  });
});

describe('createWhiteBalanceColorMatrix', () => {
  it('returns a 20-element array', () => {
    expect(createWhiteBalanceColorMatrix(0, 0)).toHaveLength(COLOR_MATRIX_LENGTH);
  });

  it('neutral (0, 0) is identity', () => {
    const m = createWhiteBalanceColorMatrix(0, 0);
    const identity = createIdentityColorMatrix();
    for (let i = 0; i < 20; i++) {
      expect(m[i]).toBeCloseTo(identity[i]);
    }
  });

  it('warm temperature (positive) increases red gain and decreases blue gain', () => {
    const m = createWhiteBalanceColorMatrix(50, 0);
    // m[0] = R diagonal (index 0), m[12] = B diagonal (index 2*5+2)
    expect(m[0]).toBeGreaterThan(1); // R gain > 1
    expect(m[12]).toBeLessThan(1); // B gain < 1
  });

  it('cool temperature (negative) decreases red gain and increases blue gain', () => {
    const m = createWhiteBalanceColorMatrix(-50, 0);
    // m[0] = R diagonal (index 0), m[12] = B diagonal (index 2*5+2)
    expect(m[0]).toBeLessThan(1); // R gain < 1
    expect(m[12]).toBeGreaterThan(1); // B gain > 1
  });

  it('positive tint increases green gain', () => {
    const m = createWhiteBalanceColorMatrix(0, 100);
    // m[6] = G diagonal (index 1*5+1)
    expect(m[6]).toBeGreaterThan(1); // G gain > 1
  });
});

describe('multiplyColorMatrix', () => {
  it('identity ∘ identity = identity', () => {
    const identity = createIdentityColorMatrix();
    const result = multiplyColorMatrix(identity, identity);
    for (let i = 0; i < 20; i++) {
      expect(result[i]).toBeCloseTo(identity[i]);
    }
  });

  it('writes to out when provided', () => {
    const identity = createIdentityColorMatrix();
    const out = new Array(20).fill(0);
    const returned = multiplyColorMatrix(identity, identity, out);
    expect(returned).toBe(out);
  });

  it('is alias-safe when out === a', () => {
    const a = createGrayscaleColorMatrix();
    const b = createIdentityColorMatrix();
    const expected = multiplyColorMatrix(a, b);
    multiplyColorMatrix(a, b, a);
    for (let i = 0; i < 20; i++) {
      expect(a[i]).toBeCloseTo(expected[i]);
    }
  });

  it('is alias-safe when out === b', () => {
    const a = createIdentityColorMatrix();
    const b = createGrayscaleColorMatrix();
    const expected = multiplyColorMatrix(a, b);
    multiplyColorMatrix(a, b, b);
    for (let i = 0; i < 20; i++) {
      expect(b[i]).toBeCloseTo(expected[i]);
    }
  });
});
