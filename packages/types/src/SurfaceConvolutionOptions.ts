import type { SurfaceEdgeMode } from './SurfaceEdgeMode';

export interface SurfaceConvolutionOptions {
  bias?: number;
  /** How to handle kernel samples outside the surface. Default 'clamp'. */
  edge?: SurfaceEdgeMode;
  divisor?: number;
  matrix: ReadonlyArray<number>;
  matrixX: number;
  matrixY: number;
  preserveAlpha?: boolean;
}
