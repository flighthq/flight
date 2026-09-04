import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getNodeRoot, getNodeRuntime } from '@flighthq/node/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  Node2D,
  Node2DRuntime,
  Scene2D,
  Scene2DRuntime,
  Scene2DSignals,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createDisplayObject } from './displayObject';

// Allocates a Scene2D: a presentation-context Entity that owns a display-object `root` (allocated here), not a
// node in the tree. Carries the fit context (`align`/`scaleMode`) directly — fit is the Scene2D's concern, and
// the bedrock `Viewport` is a drawable rect, not a base of Scene2D — plus the view dimensions and background
// color. The entity runtime stays unbound; the root's runtime carries a back-pointer so getScene2DRoot
// resolves membership by a lazy walk to the root.
export function createScene2D(
  obj?: Readonly<Partial<Pick<Scene2D, 'align' | 'color' | 'scaleMode' | 'scene2dHeight' | 'scene2dWidth'>>>,
): Scene2D {
  const root = createDisplayObject();
  const scene2d = allocateEntity<Scene2D>();
  initializeScene2D(scene2d, root, obj);
  (getNodeRuntime(root) as Node2DRuntime).scene2d = scene2d;
  return scene2d;
}

export function createScene2DRuntime(): Scene2DRuntime {
  return {
    binding: null,
    scene2dSignals: null,
  };
}

export function createScene2DSignals(): Scene2DSignals {
  const out = allocateEntity<Scene2DSignals>();
  initializeScene2DSignals(out);
  return finishEntity(out);
}

export function enableScene2DSignals(source: Scene2D): Scene2DSignals {
  const runtime = ensureScene2DRuntime(source);
  return (runtime.scene2dSignals ??= createScene2DSignals());
}

// Resolves the Scene2D a display object belongs to, or null when its root is not owned by a scene2d. Walks to the
// root (a cheap parent walk) and reads the scene2d back-pointer the root runtime carries.
export function getScene2DRoot(source: Readonly<Node2D>): Scene2D | null {
  const root = getNodeRoot(source);
  return (getNodeRuntime(root) as Node2DRuntime).scene2d;
}

// The scene2d's runtime, allocated on first access (the entity is created unbound). Callers that only read
// enabled signals should use getScene2DSignals, which does not allocate.
export function getScene2DRuntime(source: Readonly<Scene2D>): Readonly<Scene2DRuntime> {
  return ensureScene2DRuntime(source as Scene2D);
}

export function getScene2DSignals(source: Readonly<Scene2D>): Scene2DSignals | null {
  const runtime = source[EntityRuntimeKey] as Scene2DRuntime | undefined;
  return runtime?.scene2dSignals ?? null;
}

export function initializeScene2D(
  out: EntityConstruction<Scene2D>,
  root: Node2D,
  obj?: Readonly<Partial<Pick<Scene2D, 'align' | 'color' | 'scaleMode' | 'scene2dHeight' | 'scene2dWidth'>>>,
): void {
  out.align = obj?.align ?? 'topleft';
  out.color = obj?.color ?? null;
  out.root = root;
  out.scaleMode = obj?.scaleMode ?? 'noscale';
  out.scene2dHeight = obj?.scene2dHeight ?? 550;
  out.scene2dWidth = obj?.scene2dWidth ?? 400;
}

export function initializeScene2DSignals(out: EntityConstruction<Scene2DSignals>): void {
  out.onFullscreenChanged = createSignal();
  out.onOrientationChanged = createSignal();
  out.onResize = createSignal();
}

export function setScene2DSize(source: Scene2D, width: number, height: number): void {
  if (source.scene2dWidth === width && source.scene2dHeight === height) return;
  source.scene2dWidth = width;
  source.scene2dHeight = height;
  const runtime = source[EntityRuntimeKey] as Scene2DRuntime | undefined;
  if (runtime?.scene2dSignals) emitSignal(runtime.scene2dSignals.onResize);
}

function ensureScene2DRuntime(source: Scene2D): Scene2DRuntime {
  const existing = source[EntityRuntimeKey] as Scene2DRuntime | undefined;
  if (existing !== undefined) return existing;
  const runtime = createScene2DRuntime();
  source[EntityRuntimeKey] = runtime;
  return runtime;
}
