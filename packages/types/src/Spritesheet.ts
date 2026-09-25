import type { Entity } from './Entity.ts';
import type { SpritesheetAnimation } from './SpritesheetAnimation.ts';
import type { SpritesheetFrame } from './SpritesheetFrame.ts';
import type { TextureAtlas } from './TextureAtlas.ts';

export interface Spritesheet extends Entity {
  atlas: TextureAtlas | null;
  animations: Record<string, SpritesheetAnimation>;
  frames: SpritesheetFrame[];
}
