import type { PartialWithData, Stage, StageData } from '@flighthq/types';
import { StageKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createStage(obj?: Readonly<PartialWithData<Stage>>): Stage {
  return createDisplayObjectGeneric(StageKind, obj, createStageData) as Stage;
}

export function createStageData(data?: Readonly<Partial<StageData>>): StageData {
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
