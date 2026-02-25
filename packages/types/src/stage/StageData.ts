import type { PrimitiveData } from './PrimitiveData';
import type StageAlign from './StageAlign';
import type StageDisplayState from './StageDisplayState';
import type StageQuality from './StageQuality';
import type StageScaleMode from './StageScaleMode';

export default interface StageData extends PrimitiveData {
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
