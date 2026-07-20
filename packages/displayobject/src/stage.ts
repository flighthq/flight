import { getNodeRoot, getNodeRuntime } from '@flighthq/node';
import { createSignal, emitSignal } from '@flighthq/signals';
import type { DisplayObject, DisplayObjectRuntime, Stage, StageRuntime, StageSignals } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createDisplayObject } from './displayObject';

// Allocates a Stage: a presentation-context Entity that owns a display-object `root` (allocated here), not a
// node in the tree. Defaults mirror the historical stage size and an unscaled, top-left viewport fit. The
// root's runtime carries a back-pointer to this stage so getDisplayObjectStage can resolve membership by a
// lazy walk to the root.
export function createStage(
  obj?: Readonly<Partial<Pick<Stage, 'align' | 'color' | 'scaleMode' | 'stageHeight' | 'stageWidth'>>>,
): Stage {
  const root = createDisplayObject();
  const stage: Stage = {
    [EntityRuntimeKey]: createStageRuntime(),
    align: obj?.align ?? 'topleft',
    color: obj?.color ?? null,
    root,
    scaleMode: obj?.scaleMode ?? 'noscale',
    stageHeight: obj?.stageHeight ?? 550,
    stageWidth: obj?.stageWidth ?? 400,
  };
  (getNodeRuntime(root) as DisplayObjectRuntime).stage = stage;
  return stage;
}

export function createStageRuntime(): StageRuntime {
  return {
    binding: null,
    stageSignals: null,
  };
}

export function createStageSignals(): StageSignals {
  return {
    onFullscreenChanged: createSignal(),
    onOrientationChanged: createSignal(),
    onResize: createSignal(),
  };
}

export function enableStageSignals(source: Stage): StageSignals {
  const runtime = source[EntityRuntimeKey] as StageRuntime;
  return (runtime.stageSignals ??= createStageSignals());
}

// Resolves the Stage a display object belongs to, or null when its root is not owned by a stage. Walks to the
// root (a cheap parent walk) and reads the stage back-pointer the root runtime carries.
export function getDisplayObjectStage(source: Readonly<DisplayObject>): Stage | null {
  const root = getNodeRoot(source);
  return (getNodeRuntime(root) as DisplayObjectRuntime).stage;
}

export function getStageRuntime(source: Readonly<Stage>): Readonly<StageRuntime> {
  return source[EntityRuntimeKey] as StageRuntime;
}

export function getStageSignals(source: Readonly<Stage>): StageSignals | null {
  return (source[EntityRuntimeKey] as StageRuntime).stageSignals;
}

export function setStageSize(source: Stage, width: number, height: number): void {
  if (source.stageWidth === width && source.stageHeight === height) return;
  source.stageWidth = width;
  source.stageHeight = height;
  const runtime = source[EntityRuntimeKey] as StageRuntime;
  if (runtime.stageSignals) emitSignal(runtime.stageSignals.onResize);
}
