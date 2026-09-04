import type { Entity } from './Entity';
import type { SpritesheetAnimationData } from './SpritesheetAnimationData';
import type { SpritesheetFrameData } from './SpritesheetFrameData';

export interface SpritesheetData extends Entity {
  animations: SpritesheetAnimationData[];
  frames: SpritesheetFrameData[];
  imageFile: string;
  imageHeight: number;
  imageWidth: number;
  scale: number;
}
