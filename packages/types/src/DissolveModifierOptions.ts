import type { Texture } from './Texture';

export interface DissolveModifierOptions {
  threshold: number;
  edgeColor?: number;
  edgeWidth?: number;
  map?: Texture;
  scale?: number;
}
