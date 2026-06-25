/**
 * Convolution kernel builders for use with `createConvolutionFilter`.
 *
 * Each builder returns `{ matrix, matrixX, matrixY, divisor? }` — the fields needed to construct
 * a `ConvolutionFilter`. None performs rasterization; backends consume these values.
 *
 * Separable kernels can be applied as two independent 1-D passes (horizontal then vertical),
 * which reduces the per-pixel work from O(w×h) to O(w+h). Use `isSeparableKernel` to test
 * and `getSeparableKernelFactors` to obtain the two 1-D factor arrays.
 */

/** Describes the shape of a convolution kernel returned by the builders. */
export interface ConvolutionKernelData {
  readonly matrix: number[];
  readonly matrixX: number;
  readonly matrixY: number;
  /** Recommended divisor. When undefined, use the kernel sum or 1 if the sum is 0. */
  readonly divisor?: number;
}

/**
 * Returns a 3×3 box (averaging) blur kernel of size `size` × `size`. `size` must be an odd
 * integer ≥ 1; out-of-range values are clamped. Allocates a new matrix.
 */
export function createBoxBlurKernel(size: number): ConvolutionKernelData {
  const s = Math.max(1, Math.round(size) | 1); // force odd, ≥ 1
  const n = s * s;
  const matrix = new Array(n).fill(1);
  return { matrix, matrixX: s, matrixY: s, divisor: n };
}

/**
 * Returns a 3×3 edge-detection kernel (Laplacian of Gaussian approximation). The kernel
 * highlights edges by subtracting the neighbourhood average from the centre. Allocates a new
 * matrix.
 */
export function createEdgeDetectKernel(): ConvolutionKernelData {
  // prettier-ignore
  const matrix = [
    -1, -1, -1,
    -1, 8, -1,
    -1, -1, -1,
  ];
  return { matrix, matrixX: 3, matrixY: 3, divisor: 1 };
}

/**
 * Returns a 3×3 emboss kernel oriented at `angle` degrees (default 135°, which matches the
 * classic north-west emboss). Allocates a new matrix.
 */
export function createEmbossKernel(angle = 135): ConvolutionKernelData {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.round(Math.cos(rad));
  const dy = Math.round(Math.sin(rad));
  // Centre = 1 (bias-neutral), opposite to (dx,dy) = -2, along (dx,dy) = 2, rest 0.
  const matrix = new Array(9).fill(0);
  // row-major 3×3: index = (row+1)*3 + (col+1)
  matrix[4] = 1; // centre
  const oppRow = 1 - dy;
  const oppCol = 1 - dx;
  const dirRow = 1 + dy;
  const dirCol = 1 + dx;
  matrix[oppRow * 3 + oppCol] = -2;
  matrix[dirRow * 3 + dirCol] = 2;
  return { matrix, matrixX: 3, matrixY: 3, divisor: 1 };
}

/**
 * Returns a separable 1D Gaussian kernel of length `size` (odd, ≥ 1) with standard deviation
 * `sigma`. When `sigma` is not provided it defaults to `(size - 1) / 6` (the common rule-of-thumb
 * that fits ~99.7% of the distribution within the kernel). Use the same kernel for both the
 * horizontal and vertical passes of a two-pass separable convolution. Allocates a new matrix.
 */
export function createGaussianKernel(size: number, sigma?: number): ConvolutionKernelData {
  const s = Math.max(1, Math.round(size) | 1);
  const sig = sigma ?? Math.max(1, (s - 1) / 6);
  const half = Math.floor(s / 2);
  const kernel = new Array(s);
  let sum = 0;
  for (let i = 0; i < s; i++) {
    const x = i - half;
    kernel[i] = Math.exp((-x * x) / (2 * sig * sig));
    sum += kernel[i];
  }
  // Normalise so the kernel sums to 1 (stored un-scaled; divisor matches the sum).
  return { matrix: kernel, matrixX: s, matrixY: 1, divisor: sum };
}

/**
 * Returns a 3×3 Laplacian kernel. Equivalent to `createEdgeDetectKernel` in most backends.
 * Allocates a new matrix.
 */
export function createLaplacianKernel(): ConvolutionKernelData {
  // prettier-ignore
  const matrix = [
    0, -1, 0,
    -1, 4, -1,
    0, -1, 0,
  ];
  return { matrix, matrixX: 3, matrixY: 3, divisor: 1 };
}

/**
 * Returns a 3×3 outline kernel that highlights borders by subtracting the centre from its
 * neighbours. Allocates a new matrix.
 */
export function createOutlineKernel(): ConvolutionKernelData {
  // prettier-ignore
  const matrix = [
    -1, -1, -1,
    -1, 8, -1,
    -1, -1, -1,
  ];
  return { matrix, matrixX: 3, matrixY: 3, divisor: 1 };
}

/**
 * Returns a 3×3 sharpen kernel with the given `amount` (default 1). Higher values produce a
 * stronger sharpening effect. Allocates a new matrix.
 */
export function createSharpenKernel(amount = 1): ConvolutionKernelData {
  const c = 1 + 4 * amount; // centre weight
  // prettier-ignore
  const matrix = [
    0, -amount, 0,
    -amount, c, -amount,
    0, -amount, 0,
  ];
  return { matrix, matrixX: 3, matrixY: 3, divisor: 1 };
}

/**
 * Computes the sum of all kernel values; use as the divisor for a unit-gain kernel. When the sum
 * is 0 (e.g. edge-detect kernels), returns 1 to avoid division by zero.
 */
export function getConvolutionDivisor(matrix: Readonly<number[]>): number {
  let sum = 0;
  for (const v of matrix) sum += v;
  return sum === 0 ? 1 : sum;
}

/**
 * Returns `[row, col]` 1-D factor arrays when `kernel` is a rank-1 (separable) 2-D matrix, or
 * `null` when it is not separable. A kernel is separable when its 2-D matrix is the outer product
 * of two 1-D vectors, i.e. `kernel[i][j] = row[i] * col[j]`.
 *
 * GPU backends can substitute two 1-D convolution passes for the 2-D pass, reducing per-pixel
 * work from O(w×h) to O(w+h). Allocates two new arrays when the kernel is separable.
 */
export function getSeparableKernelFactors(kernel: ConvolutionKernelData): Readonly<[number[], number[]]> | null {
  const { matrix, matrixX, matrixY } = kernel;
  if (matrixX === 1) return [[1], matrix.slice()];
  if (matrixY === 1) return [matrix.slice(), [1]];
  // Find the first non-zero element to establish the scale vector.
  let pivotRow = -1;
  let pivotCol = -1;
  outer: for (let r = 0; r < matrixY; r++) {
    for (let c = 0; c < matrixX; c++) {
      if (matrix[r * matrixX + c] !== 0) {
        pivotRow = r;
        pivotCol = c;
        break outer;
      }
    }
  }
  // All-zero kernel: trivially separable as zero vectors.
  if (pivotRow === -1) {
    return [new Array(matrixY).fill(0), new Array(matrixX).fill(0)];
  }
  const pivotValue = matrix[pivotRow * matrixX + pivotCol];
  // Extract candidate column factor from the pivot row.
  const colFactor = new Array(matrixX);
  for (let c = 0; c < matrixX; c++) {
    colFactor[c] = matrix[pivotRow * matrixX + c] / pivotValue;
  }
  // Extract candidate row factor from the pivot column.
  const rowFactor = new Array(matrixY);
  for (let r = 0; r < matrixY; r++) {
    rowFactor[r] = matrix[r * matrixX + pivotCol];
  }
  // Verify: every element must equal rowFactor[r] * colFactor[c].
  const eps = 1e-10;
  for (let r = 0; r < matrixY; r++) {
    for (let c = 0; c < matrixX; c++) {
      const expected = rowFactor[r] * colFactor[c];
      const actual = matrix[r * matrixX + c];
      if (Math.abs(actual - expected) > eps) return null;
    }
  }
  return [rowFactor, colFactor];
}

/**
 * Returns `true` when `kernel` is separable — i.e. can be decomposed into two independent 1-D
 * passes. Equivalent to `getSeparableKernelFactors(kernel) !== null` but avoids allocating the
 * factor arrays when only the boolean answer is needed.
 */
export function isSeparableKernel(kernel: ConvolutionKernelData): boolean {
  return getSeparableKernelFactors(kernel) !== null;
}

/**
 * Normalises `matrix` in-place so the kernel sums to 1 by dividing each value by the kernel sum.
 * No-ops when the sum is 0. When `out` is provided the normalised values are written there instead
 * (alias-safe: `out` may be `matrix`). Returns the output array.
 */
export function normalizeConvolutionKernel(matrix: Readonly<number[]>, out?: number[]): number[] {
  const sum = getConvolutionDivisor(matrix);
  const result = out ?? new Array(matrix.length);
  for (let i = 0; i < matrix.length; i++) {
    result[i] = matrix[i] / sum;
  }
  return result;
}
