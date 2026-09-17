import type { Entity } from './Entity';

export interface Surface extends Entity {
  readonly native: HTMLCanvasElement;
  width: number;
  height: number;
}
