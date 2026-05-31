import type { Matrix } from './Matrix';

export interface ImageCacheResult {
  canvas: HTMLCanvasElement | null;
  transform: Matrix;
}
