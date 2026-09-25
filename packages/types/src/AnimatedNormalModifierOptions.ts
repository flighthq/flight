import type { Texture } from './Texture.ts';
import type { Vector2Like } from './Vector2.ts';

export interface AnimatedNormalModifierOptions {
  map: Texture | null;
  scroll: Vector2Like;
  strength?: number;
  secondaryMap?: Texture;
  secondaryScroll?: Vector2Like;
}
