import type { Entity } from './Entity';

export interface ImageSource extends Entity {
  height: number;
  src: CanvasImageSource | null;
  version: number;
  width: number;
}
