import type { ImageSource } from './ImageSource';
import type { Matrix } from './Matrix';

export interface ImageCacheResult {
  source: ImageSource | null;
  transform: Matrix;
}
