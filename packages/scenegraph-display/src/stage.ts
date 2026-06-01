import { getGraphRoot, invalidateLocalBounds } from '@flighthq/scenegraph-core';
import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  DisplayObject,
  GraphNode,
  MethodsOf,
  PartialNode,
  Rectangle,
  Stage,
  StageData,
  StageRuntime,
  StageSignals,
} from '@flighthq/types';
import { EntityRuntimeKey, StageKind } from '@flighthq/types';

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
  const out = createDisplayObjectRuntime(defaultMethods) as StageRuntime;
  out.stageSignals = null;
  return out;
}

export function createStageSignals(): StageSignals {
  return {
    onFullscreenChanged: createSignal(),
    onOrientationChanged: createSignal(),
    onResize: createSignal(),
  };
}

export function getDisplayObjectStage(source: Readonly<DisplayObject>): Stage | null {
  const root = getGraphRoot(source);
  return root.kind === StageKind ? (root as Stage) : null;
}

export function getStageRuntime(source: Readonly<Stage>): Readonly<StageRuntime> {
  return getDisplayObjectRuntime(source) as StageRuntime;
}

export function getStageSignals(source: Stage): StageSignals {
  const runtime = source[EntityRuntimeKey] as StageRuntime;
  return (runtime.stageSignals ??= createStageSignals());
}

export function setStageSize(stage: Stage, width: number, height: number): void {
  if (stage.data.stageWidth === width && stage.data.stageHeight === height) return;
  stage.data.stageWidth = width;
  stage.data.stageHeight = height;
  invalidateLocalBounds(stage);
  const runtime = stage[EntityRuntimeKey] as StageRuntime;
  if (runtime.stageSignals) emitSignal(runtime.stageSignals.onResize);
}

const defaultMethods: Partial<MethodsOf<StageRuntime>> = {
  computeLocalBoundsRect: computeStageLocalBoundsRectangle,
};
