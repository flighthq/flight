import type { Entity } from './Entity.ts';
import type { SpritesheetAnimationData } from './SpritesheetAnimationData.ts';
import type { SpritesheetFrameData } from './SpritesheetFrameData.ts';

export interface SpritesheetData extends Entity {
  animations: SpritesheetAnimationData[];
  frames: SpritesheetFrameData[];
  imageFile: string;
  imageHeight: number;
  imageWidth: number;
  scale: number;
}
