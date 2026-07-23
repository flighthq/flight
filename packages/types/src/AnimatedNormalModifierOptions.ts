import type { Texture } from './Texture';
import type { Vector2Like } from './Vector2';

export interface AnimatedNormalModifierOptions {
  map: Texture | null;
  scroll: Vector2Like;
  strength?: number;
  secondaryMap?: Texture;
  secondaryScroll?: Vector2Like;
}
