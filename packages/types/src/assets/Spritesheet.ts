import type { SpritesheetAnimation } from './SpritesheetAnimation';
import type { TextureAtlas } from './TextureAtlas';

export interface Spritesheet {
  atlas: TextureAtlas | null;
  animations: SpritesheetAnimation[];
}
