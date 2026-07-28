import type { BitmapEdgeMode } from './BitmapEdgeMode';

export interface BitmapConvolutionOptions {
  bias?: number;
  /** How to handle kernel samples outside the surface. Default 'clamp'. */
  edge?: BitmapEdgeMode;
  divisor?: number;
  matrix: ReadonlyArray<number>;
  matrixX: number;
  matrixY: number;
  preserveAlpha?: boolean;
}
