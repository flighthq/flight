import type { Vector3Like } from '@flighthq/geometry/contract';
import type { Texture } from '@flighthq/texture/contract';

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
