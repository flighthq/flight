import type { DisplayObject, PrimitiveData } from './DisplayObject.js';
import type { StageAlign } from './StageAlign';
import type { StageDisplayState } from './StageDisplayState';
import type { StageQuality } from './StageQuality';
import type { StageScaleMode } from './StageScaleMode';

export interface StageData extends PrimitiveData {
  autoOrients: boolean;
  align: StageAlign;
  color: number | null;
  displayState: StageDisplayState;
  frameRate: number;
  quality: StageQuality;
  scaleMode: StageScaleMode;
  stageFocusRect: boolean;
  stageHeight: number;
  stageWidth: number;
}

export interface Stage extends DisplayObject {
  data: StageData;
}
