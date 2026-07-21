import { createEntity } from '@flighthq/entity';
import { getNodeRoot, getNodeRuntime } from '@flighthq/node';
import { createSignal, emitSignal } from '@flighthq/signals';
import type { DisplayObject, DisplayObjectRuntime, Stage, StageRuntime, StageSignals } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createDisplayObject } from './displayObject';

// Allocates a Stage: a presentation-context Entity that owns a display-object `root` (allocated here), not a
// node in the tree. Carries the fit context (`align`/`scaleMode`) directly — fit is the Stage's concern, and
// the bedrock `Viewport` is a drawable rect, not a base of Stage — plus the view dimensions and background
// color. The entity runtime stays unbound; the root's runtime carries a back-pointer so getDisplayObjectStage
// resolves membership by a lazy walk to the root.
export function createStage(
  obj?: Readonly<Partial<Pick<Stage, 'align' | 'color' | 'scaleMode' | 'stageHeight' | 'stageWidth'>>>,
): Stage {
  const root = createDisplayObject();
  const stage = createEntity({
    align: obj?.align ?? 'topleft',
    color: obj?.color ?? null,
    root,
    scaleMode: obj?.scaleMode ?? 'noscale',
    stageHeight: obj?.stageHeight ?? 550,
    stageWidth: obj?.stageWidth ?? 400,
  }) as Stage;
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
  const runtime = ensureStageRuntime(source);
  return (runtime.stageSignals ??= createStageSignals());
}

// Resolves the Stage a display object belongs to, or null when its root is not owned by a stage. Walks to the
// root (a cheap parent walk) and reads the stage back-pointer the root runtime carries.
export function getDisplayObjectStage(source: Readonly<DisplayObject>): Stage | null {
  const root = getNodeRoot(source);
  return (getNodeRuntime(root) as DisplayObjectRuntime).stage;
}

// The stage's runtime, allocated on first access (the entity is created unbound). Callers that only read
// enabled signals should use getStageSignals, which does not allocate.
export function getStageRuntime(source: Readonly<Stage>): Readonly<StageRuntime> {
  return ensureStageRuntime(source as Stage);
}

export function getStageSignals(source: Readonly<Stage>): StageSignals | null {
  const runtime = source[EntityRuntimeKey] as StageRuntime | undefined;
  return runtime?.stageSignals ?? null;
}

export function setStageSize(source: Stage, width: number, height: number): void {
  if (source.stageWidth === width && source.stageHeight === height) return;
  source.stageWidth = width;
  source.stageHeight = height;
  const runtime = source[EntityRuntimeKey] as StageRuntime | undefined;
  if (runtime?.stageSignals) emitSignal(runtime.stageSignals.onResize);
}

function ensureStageRuntime(source: Stage): StageRuntime {
  const existing = source[EntityRuntimeKey] as StageRuntime | undefined;
  if (existing !== undefined) return existing;
  const runtime = createStageRuntime();
  source[EntityRuntimeKey] = runtime;
  return runtime;
}
