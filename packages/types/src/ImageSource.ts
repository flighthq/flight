import type { Entity } from './Entity';

export interface ImageSource extends Entity {
  height: number;
  src: CanvasImageSource | null;
  width: number;
}
