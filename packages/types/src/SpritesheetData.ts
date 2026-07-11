import type { SpritesheetAnimationData } from './SpritesheetAnimationData';
import type { SpritesheetFrameData } from './SpritesheetFrameData';

export interface SpritesheetData {
  animations: SpritesheetAnimationData[];
  frames: SpritesheetFrameData[];
  imageFile: string;
  imageHeight: number;
  imageWidth: number;
  scale: number;
}
