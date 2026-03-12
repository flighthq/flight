import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { SpritesheetAnimation } from './SpritesheetAnimation';

export interface Spritesheet {
  atlas: TextureAtlas | null;
  animations: SpritesheetAnimation[];
}
