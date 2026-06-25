import {
  createBoxBlurKernel,
  createEdgeDetectKernel,
  createEmbossKernel,
  createGaussianKernel,
  createLaplacianKernel,
  createOutlineKernel,
  createSharpenKernel,
  getConvolutionDivisor,
  getSeparableKernelFactors,
  isSeparableKernel,
  normalizeConvolutionKernel,
} from './convolutionKernels';

describe('createBoxBlurKernel', () => {
  it('returns a 3×3 kernel for size 3', () => {
    const k = createBoxBlurKernel(3);
    expect(k.matrixX).toBe(3);
    expect(k.matrixY).toBe(3);
    expect(k.matrix).toHaveLength(9);
  });

  it('all values are 1', () => {
    const k = createBoxBlurKernel(3);
    expect(k.matrix.every((v) => v === 1)).toBe(true);
  });

  it('divisor equals the number of elements', () => {
    const k = createBoxBlurKernel(3);
    expect(k.divisor).toBe(9);
  });

  it('forces odd size', () => {
    const k = createBoxBlurKernel(4);
    expect(k.matrixX % 2).toBe(1);
  });
});

describe('createEdgeDetectKernel', () => {
  it('returns a 3×3 kernel', () => {
    const k = createEdgeDetectKernel();
    expect(k.matrixX).toBe(3);
    expect(k.matrixY).toBe(3);
    expect(k.matrix).toHaveLength(9);
  });

  it('centre value is 8', () => {
    expect(createEdgeDetectKernel().matrix[4]).toBe(8);
  });

  it('sum is 0', () => {
    const k = createEdgeDetectKernel();
    expect(k.matrix.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('createEmbossKernel', () => {
  it('returns a 3×3 kernel', () => {
    const k = createEmbossKernel();
    expect(k.matrixX).toBe(3);
    expect(k.matrixY).toBe(3);
    expect(k.matrix).toHaveLength(9);
  });

  it('centre value is 1', () => {
    expect(createEmbossKernel().matrix[4]).toBe(1);
  });

  it('angle 0 (east): positive coefficient east, negative coefficient west', () => {
    // angle=0: dx=1, dy=0 → dir=(row=1,col=2), opp=(row=1,col=0)
    const k = createEmbossKernel(0);
    expect(k.matrix[1 * 3 + 2]).toBe(2); // east = positive
    expect(k.matrix[1 * 3 + 0]).toBe(-2); // west = negative
  });

  it('angle 90 (south): positive coefficient south, negative coefficient north', () => {
    // angle=90: dx=0, dy=1 → dir=(row=2,col=1), opp=(row=0,col=1)
    const k = createEmbossKernel(90);
    expect(k.matrix[2 * 3 + 1]).toBe(2); // south = positive
    expect(k.matrix[0 * 3 + 1]).toBe(-2); // north = negative
  });

  it('angle 135 (default south-west): positive south-west, negative north-east', () => {
    // angle=135: cos≈-0.707→round→-1, sin≈0.707→round→1 → dx=-1, dy=1
    // dir=(row=2,col=0), opp=(row=0,col=2)
    const k = createEmbossKernel(135);
    expect(k.matrix[2 * 3 + 0]).toBe(2); // south-west = positive
    expect(k.matrix[0 * 3 + 2]).toBe(-2); // north-east = negative
  });
});

describe('createGaussianKernel', () => {
  it('returns a 1D kernel of the correct length', () => {
    const k = createGaussianKernel(5);
    expect(k.matrix).toHaveLength(5);
    expect(k.matrixX).toBe(5);
    expect(k.matrixY).toBe(1);
  });

  it('is symmetric', () => {
    const k = createGaussianKernel(5);
    const m = k.matrix;
    expect(m[0]).toBeCloseTo(m[4]);
    expect(m[1]).toBeCloseTo(m[3]);
  });

  it('centre value is the largest', () => {
    const k = createGaussianKernel(5);
    const centre = k.matrix[2];
    for (const v of k.matrix) {
      expect(centre).toBeGreaterThanOrEqual(v);
    }
  });
});

describe('createLaplacianKernel', () => {
  it('returns a 3×3 kernel', () => {
    const k = createLaplacianKernel();
    expect(k.matrix).toHaveLength(9);
  });

  it('centre value is 4', () => {
    expect(createLaplacianKernel().matrix[4]).toBe(4);
  });
});

describe('createOutlineKernel', () => {
  it('returns a 3×3 kernel', () => {
    const k = createOutlineKernel();
    expect(k.matrix).toHaveLength(9);
  });
});

describe('createSharpenKernel', () => {
  it('returns a 3×3 kernel', () => {
    const k = createSharpenKernel();
    expect(k.matrixX).toBe(3);
    expect(k.matrixY).toBe(3);
    expect(k.matrix).toHaveLength(9);
  });

  it('default divisor is 1', () => {
    expect(createSharpenKernel().divisor).toBe(1);
  });

  it('larger amount increases centre weight', () => {
    const k1 = createSharpenKernel(1);
    const k2 = createSharpenKernel(2);
    expect(k2.matrix[4]).toBeGreaterThan(k1.matrix[4]);
  });
});

describe('getConvolutionDivisor', () => {
  it('returns the sum of kernel values', () => {
    expect(getConvolutionDivisor([1, 1, 1, 1, 1, 1, 1, 1, 1])).toBe(9);
  });

  it('returns 1 when sum is 0', () => {
    expect(getConvolutionDivisor([-1, 0, 1])).toBe(1);
  });
});

describe('getSeparableKernelFactors', () => {
  it('returns factors for a box blur kernel (uniform separable)', () => {
    const k = createBoxBlurKernel(3);
    const factors = getSeparableKernelFactors(k);
    expect(factors).not.toBeNull();
    if (factors) {
      const [row, col] = factors;
      expect(row).toHaveLength(3);
      expect(col).toHaveLength(3);
    }
  });

  it('returns factors for a 1D Gaussian kernel (already 1D)', () => {
    const k = createGaussianKernel(5);
    const factors = getSeparableKernelFactors(k);
    expect(factors).not.toBeNull();
    if (factors) {
      const [row, col] = factors;
      expect(row).toHaveLength(5);
      expect(col).toHaveLength(1);
    }
  });

  it('returns null for a non-separable kernel (Laplacian)', () => {
    const k = createLaplacianKernel();
    expect(getSeparableKernelFactors(k)).toBeNull();
  });

  it('returns null for edge-detect kernel (non-separable)', () => {
    const k = createEdgeDetectKernel();
    expect(getSeparableKernelFactors(k)).toBeNull();
  });

  it('reconstructed outer product matches original matrix', () => {
    const k = createBoxBlurKernel(3);
    const factors = getSeparableKernelFactors(k);
    expect(factors).not.toBeNull();
    if (factors) {
      const [row, col] = factors;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          expect(row[r] * col[c]).toBeCloseTo(k.matrix[r * 3 + c]);
        }
      }
    }
  });
});

describe('isSeparableKernel', () => {
  it('returns true for a box blur kernel', () => {
    expect(isSeparableKernel(createBoxBlurKernel(3))).toBe(true);
  });

  it('returns true for a 1D Gaussian kernel', () => {
    expect(isSeparableKernel(createGaussianKernel(7))).toBe(true);
  });

  it('returns false for a Laplacian kernel', () => {
    expect(isSeparableKernel(createLaplacianKernel())).toBe(false);
  });

  it('returns false for an edge-detect kernel', () => {
    expect(isSeparableKernel(createEdgeDetectKernel())).toBe(false);
  });
});

describe('normalizeConvolutionKernel', () => {
  it('normalises to unit sum', () => {
    const m = [1, 2, 3];
    const result = normalizeConvolutionKernel(m);
    expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('writes to out when provided', () => {
    const m = [1, 1, 1];
    const out = new Array(3);
    const returned = normalizeConvolutionKernel(m, out);
    expect(returned).toBe(out);
  });

  it('is alias-safe when out === matrix', () => {
    const m = [2, 2, 2];
    normalizeConvolutionKernel(m, m);
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});
