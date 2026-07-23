import type { Texture } from './Texture';
import type { Vector3Like } from './Vector3';
import type { VertexDisplaceModifierSource } from './VertexDisplaceModifier';

export interface VertexDisplaceModifierOptions {
  source: VertexDisplaceModifierSource;
  amplitude: number;
  axis?: Vector3Like;
  map?: Texture;
  frequency?: number;
  speed?: number;
  direction?: Vector3Like;
}
