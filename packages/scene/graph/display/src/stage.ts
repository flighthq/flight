import { DisplayObjectType, type PartialWithData, type Stage, type StageData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createStage(obj?: PartialWithData<Stage>): Stage {
  return createPrimitive(DisplayObjectType.Stage, obj, createStageData) as Stage;
}

export function createStageData(data?: Partial<StageData>): StageData {
  return {
    autoOrients: data?.autoOrients ?? true,
    align: data?.align ?? 'topleft',
    color: data?.color ?? null,
    displayState: data?.displayState ?? 'normal',
    frameRate: data?.frameRate ?? 0,
    quality: data?.quality ?? 'high',
    scaleMode: data?.scaleMode ?? 'noscale',
    stageFocusRect: data?.stageFocusRect ?? false,
    stageHeight: data?.stageHeight ?? 550,
    stageWidth: data?.stageWidth ?? 400,
  };
}
