import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { Entity } from '../../foundation';
import type { SpritesheetAnimation } from './SpritesheetAnimation';

export interface Spritesheet extends Entity {
  atlas: TextureAtlas | null;
  animations: SpritesheetAnimation[];
}
