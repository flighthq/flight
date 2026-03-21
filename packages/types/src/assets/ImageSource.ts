import type { Entity } from '../core';

export interface ImageSource extends Entity {
  height: number;
  src: HTMLImageElement | null;
  width: number;
}
