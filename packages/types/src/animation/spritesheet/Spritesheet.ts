import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { Entity } from '../../foundation';
import type { SpritesheetAnimation } from './SpritesheetAnimation';
import type { SpritesheetFrame } from './SpritesheetFrame';

export interface Spritesheet extends Entity {
  atlas: TextureAtlas | null;
  animations: Record<string, SpritesheetAnimation>;
  frames: SpritesheetFrame[];
}
