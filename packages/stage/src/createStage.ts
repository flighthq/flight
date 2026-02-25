import type { PartialWithData, Stage, StageData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createStage(obj: PartialWithData<Stage> = {}): Stage {
  if (obj.data === undefined) obj.data = {} as StageData;
  if (obj.data.autoOrients === undefined) obj.data.autoOrients = true;
  if (obj.data.align === undefined) obj.data.align = 'topleft';
  if (obj.data.color === undefined) obj.data.color = null;
  if (obj.data.displayState === undefined) obj.data.displayState = 'normal';
  if (obj.data.frameRate === undefined) obj.data.frameRate = 0;
  if (obj.data.quality === undefined) obj.data.quality = 'high';
  if (obj.data.scaleMode === undefined) obj.data.scaleMode = 'noscale';
  if (obj.data.stageFocusRect === undefined) obj.data.stageFocusRect = false;
  if (obj.data.stageHeight === undefined) obj.data.stageHeight = 550;
  if (obj.data.stageWidth === undefined) obj.data.stageWidth = 400;
  if (obj.type === undefined) obj.type = 'stage';
  return createDisplayObject(obj) as Stage;
}
