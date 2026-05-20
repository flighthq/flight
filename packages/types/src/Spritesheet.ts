import type { Entity } from './Entity';
import type { SpritesheetAnimation } from './SpritesheetAnimation';
import type { SpritesheetFrame } from './SpritesheetFrame';
import type { TextureAtlas } from './TextureAtlas';

export interface Spritesheet extends Entity {
  atlas: TextureAtlas | null;
  animations: Record<string, SpritesheetAnimation>;
  frames: SpritesheetFrame[];
}
