import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { Entity } from '../../core';
import type { SpritesheetAnimation } from './SpritesheetAnimation';

export interface Spritesheet extends Entity {
  atlas: TextureAtlas | null;
  animations: SpritesheetAnimation[];
}
