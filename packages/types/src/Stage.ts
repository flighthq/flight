import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { StageAlign } from './StageAlign';
import type { StageDisplayState } from './StageDisplayState';
import type { StageQuality } from './StageQuality';
import type { StageScaleMode } from './StageScaleMode';
import type { StageSignals } from './StageSignals';

export interface StageData extends DisplayObjectData {
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

export interface StageRuntime extends DisplayObjectRuntime {
  stageSignals: StageSignals | null;
}

export interface Stage extends DisplayObject {
  data: StageData;
}

export const StageKind: unique symbol = Symbol('Stage');
