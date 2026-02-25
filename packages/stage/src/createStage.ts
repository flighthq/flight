import type { PartialWithData, Stage, StageData } from '@flighthq/types';

import { createPrimitive } from './internal/createPrimitive';

export function createStage(obj?: PartialWithData<Stage>): Stage {
  return createPrimitive<Stage, StageData>('stage', obj, createStageData);
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
