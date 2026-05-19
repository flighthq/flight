import type { Entity } from '../foundation';

export interface ImageSource extends Entity {
  height: number;
  src: CanvasImageSource | null;
  width: number;
}
