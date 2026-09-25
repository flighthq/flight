import type { Texture } from './Texture.ts';
import type { Vector3Like } from './Vector3.ts';
import type { VertexDisplaceModifierSource } from './VertexDisplaceModifier.ts';

export interface VertexDisplaceModifierOptions {
  source: VertexDisplaceModifierSource;
  amplitude: number;
  axis?: Vector3Like;
  map?: Texture;
  frequency?: number;
  speed?: number;
  direction?: Vector3Like;
}
