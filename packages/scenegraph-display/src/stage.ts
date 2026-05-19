import { getRoot } from '@flighthq/scenegraph-core';
import type { DisplayObject, PartialNode, Stage, StageData } from '@flighthq/types';
import { StageKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createStage(obj?: Readonly<PartialNode<Stage>>): Stage {
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

export function getStage(source: Readonly<DisplayObject>): Stage | null {
  const root = getRoot(source);
  return root.kind === StageKind ? (root as Stage) : null;
}
