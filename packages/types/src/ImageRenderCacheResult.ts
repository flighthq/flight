import type { ImageSource } from './ImageSource';
import type { Matrix } from './Matrix';

export interface ImageRenderCacheResult {
  source: ImageSource | null;
  transform: Matrix;
}
