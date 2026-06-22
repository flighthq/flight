import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { StageSignals } from './StageSignals';

export interface StageData extends DisplayObjectData {
  color: number | null;
  stageHeight: number;
  stageWidth: number;
}

export interface StageRuntime extends DisplayObjectRuntime {
  stageSignals: StageSignals | null;
}

export interface Stage extends DisplayObject {
  data: StageData;
}

export const StageKind = 'Stage';
