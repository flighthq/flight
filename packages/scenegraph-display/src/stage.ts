import { getGraphRoot } from '@flighthq/scenegraph-core';
import type {
  DisplayObject,
  GraphNode,
  MethodsOf,
  PartialNode,
  Rectangle,
  Stage,
  StageData,
  StageRuntime,
} from '@flighthq/types';
import { StageKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeStageLocalBoundsRectangle(out: Rectangle, source: Readonly<GraphNode>): void {
  const data = (source as Stage).data;
  out.width = data.stageWidth;
  out.height = data.stageHeight;
}

export function createStage(obj?: Readonly<PartialNode<Stage>>): Stage {
  return createDisplayObjectGeneric(StageKind, obj, createStageData, createStageRuntime) as Stage;
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

export function createStageRuntime(): StageRuntime {
  return createDisplayObjectRuntime(defaultMethods) as StageRuntime;
}

export function getStage(source: Readonly<DisplayObject>): Stage | null {
  const root = getGraphRoot(source);
  return root.kind === StageKind ? (root as Stage) : null;
}

export function getStageRuntime(source: Readonly<Stage>): Readonly<StageRuntime> {
  return getDisplayObjectRuntime(source) as StageRuntime;
}

const defaultMethods: Partial<MethodsOf<StageRuntime>> = {
  computeLocalBoundsRect: computeStageLocalBoundsRectangle,
};
