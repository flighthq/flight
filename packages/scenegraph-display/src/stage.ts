import { getGraphRoot, invalidateLocalBounds } from '@flighthq/scenegraph-core';
import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  DisplayObject,
  GraphNode,
  MatrixLike,
  MethodsOf,
  PartialNode,
  Rectangle,
  Stage,
  StageAlign,
  StageData,
  StageRuntime,
  StageScaleMode,
  StageSignals,
} from '@flighthq/types';
import { EntityRuntimeKey, StageKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeStageAlignX(scaledStageWidth: number, viewWidth: number, align: StageAlign): number {
  if (align.includes('left')) return 0;
  if (align.includes('right')) return viewWidth - scaledStageWidth;
  return (viewWidth - scaledStageWidth) / 2;
}

export function computeStageAlignY(scaledStageHeight: number, viewHeight: number, align: StageAlign): number {
  if (align.includes('top')) return 0;
  if (align.includes('bottom')) return viewHeight - scaledStageHeight;
  return (viewHeight - scaledStageHeight) / 2;
}

export function computeStageFillScale(
  stageWidth: number,
  stageHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.max(viewWidth / stageWidth, viewHeight / stageHeight);
}

export function computeStageFitScale(
  stageWidth: number,
  stageHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  return Math.min(viewWidth / stageWidth, viewHeight / stageHeight);
}

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

export function setStageRenderTransform(
  out: MatrixLike,
  stageWidth: number,
  stageHeight: number,
  viewWidth: number,
  viewHeight: number,
  scaleMode: StageScaleMode,
  align: StageAlign,
): void {
  let sx: number;
  let sy: number;
  if (scaleMode === 'noscale') {
    sx = 1;
    sy = 1;
  } else if (scaleMode === 'exactfit') {
    sx = viewWidth / stageWidth;
    sy = viewHeight / stageHeight;
  } else if (scaleMode === 'showall') {
    sx = sy = computeStageFitScale(stageWidth, stageHeight, viewWidth, viewHeight);
  } else {
    sx = sy = computeStageFillScale(stageWidth, stageHeight, viewWidth, viewHeight);
  }
  out.a = sx;
  out.b = 0;
  out.c = 0;
  out.d = sy;
  out.tx = computeStageAlignX(stageWidth * sx, viewWidth, align);
  out.ty = computeStageAlignY(stageHeight * sy, viewHeight, align);
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
