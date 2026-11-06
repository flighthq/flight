import type { Vector2Like } from '@flighthq/geometry/contract';
import type { Texture } from '@flighthq/texture/contract';

export interface AnimatedNormalModifierOptions {
  map: Texture | null;
  scroll: Vector2Like;
  strength?: number;
  secondaryMap?: Texture;
  secondaryScroll?: Vector2Like;
}
