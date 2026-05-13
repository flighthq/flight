import type { Entity } from '../foundation';

export interface ImageSource extends Entity {
  height: number;
  src: HTMLImageElement | null;
  width: number;
}
