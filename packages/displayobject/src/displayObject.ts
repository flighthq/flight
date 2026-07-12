import {
  COLOR_ADJUSTMENT_CHANNEL_MIXING,
  COLOR_ADJUSTMENT_NONE,
  createColorTransformAdjustment,
  resolveColorAdjustmentsColorTransform,
} from '@flighthq/adjustments';
import { createColorTransform } from '@flighthq/materials';
import {
  createNode,
  createNodeRuntime,
  getNodeRuntime,
  initAppearanceTrait,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initClipTrait,
  initMaterialTrait,
  initTransform2DRuntimeTrait,
  initTransform2DTrait,
  invalidateNodeAppearance,
} from '@flighthq/node';
import type {
  Adjustment,
  ClipRegion,
  ColorTransform,
  DisplayObject,
  DisplayObjectDataFactory,
  DisplayObjectRuntime,
  DisplayObjectRuntimeFactory,
  Kind,
  MethodsOf,
  NodeAny,
  NodeRuntimeFactory,
  PartialNode,
} from '@flighthq/types';
import { DisplayObjectKind, DisplayObjectTraitsKey } from '@flighthq/types';

// Appends one pointwise color adjustment to this object's stack (creating the stack if absent), re-fuses
// the resolved cache, and invalidates appearance so the render walk hands the fold the new value.
// Allocates a new array — the stack is a plain `readonly Adjustment[]`, never mutated in place.
export function addDisplayObjectColorAdjustment(source: DisplayObject, adjustment: Adjustment): void {
  const runtime = getNodeRuntime(source) as DisplayObjectRuntime;
  const current = runtime.colorAdjustments;
  runtime.colorAdjustments = current === null ? [adjustment] : [...current, adjustment];
  resolveDisplayObjectColorAdjustments(runtime);
  invalidateNodeAppearance(source);
}

export function createDisplayObject(obj?: Readonly<PartialNode<DisplayObject>>): DisplayObject {
  return createDisplayObjectGeneric(DisplayObjectKind, obj);
}

export function createDisplayObjectGeneric<R extends DisplayObjectRuntime>(
  kind: Kind,
  obj?: Readonly<PartialNode<DisplayObject>>,
  createData?: DisplayObjectDataFactory,
  createDisplayObjectRuntimeFactory?: DisplayObjectRuntimeFactory<R>,
): DisplayObject {
  const out = createNode(
    kind,
    obj,
    createData,
    createDisplayObjectRuntimeFactory ?? (createDisplayObjectRuntime as unknown as NodeRuntimeFactory<R>),
  ) as DisplayObject;
  initTransform2DTrait(out, obj);
  initBoundsRectangleTrait(out, obj);
  initAppearanceTrait(out, obj);
  initMaterialTrait(out, obj);
  initClipTrait(out, obj);
  return out;
}

export function createDisplayObjectRuntime(
  methods?: Readonly<Partial<MethodsOf<DisplayObjectRuntime>>>,
): DisplayObjectRuntime {
  const out = createNodeRuntime(methods) as DisplayObjectRuntime;
  out.traits = DisplayObjectTraitsKey;
  initTransform2DRuntimeTrait(out, methods);
  initBoundsRectangleRuntimeTrait(out, methods);
  return out;
}

// Returns this object's pointwise color-adjustment stack (the source of truth on the node runtime), or
// null when it carries none.
export function getDisplayObjectColorAdjustments(source: Readonly<DisplayObject>): readonly Adjustment[] | null {
  return getNodeRuntime(source).colorAdjustments;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): Readonly<DisplayObjectRuntime> {
  return getNodeRuntime(source) as DisplayObjectRuntime;
}

export function isDisplayObject(node: NodeAny): node is DisplayObject {
  return getNodeRuntime(node).traits === DisplayObjectTraitsKey;
}

export function setDisplayObjectClip(source: DisplayObject, value: ClipRegion | null): void {
  source.clip = value;
  invalidateNodeAppearance(source);
}

// Sets (or clears with null) this object's pointwise color-adjustment stack — the generic replacement for
// the removed color-transform trait. A color transform is one member: `createColorTransformAdjustment`.
// Re-fuses the resolved cache once here (not per frame) and invalidates appearance so the render walk
// hands the fold the affine ColorTransform the stack resolves to. Null is the untinted default.
export function setDisplayObjectColorAdjustments(source: DisplayObject, value: readonly Adjustment[] | null): void {
  const runtime = getNodeRuntime(source) as DisplayObjectRuntime;
  runtime.colorAdjustments = value;
  resolveDisplayObjectColorAdjustments(runtime);
  invalidateNodeAppearance(source);
}

// Convenience for the common single-tint path (the color-transform an agent looks for): sets this object's
// adjustment stack to one `ColorTransformAdjustment`, or clears it with null. Thin wrapper over
// `setDisplayObjectColorAdjustments` — a color transform is just one adjustment in the generic stack.
export function setDisplayObjectColorTransform(
  source: DisplayObject,
  colorTransform: Readonly<ColorTransform> | null,
): void {
  setDisplayObjectColorAdjustments(
    source,
    colorTransform === null ? null : [createColorTransformAdjustment(colorTransform)],
  );
}

// Fuses the runtime's color-adjustment stack once into its cached affine `resolvedColorTransform`, setting
// `colorAdjustmentsChannelMixing` when the fused stack has off-diagonal channel-mixing terms the 8-float
// fold cannot represent yet (the render walk reports that through the shakeable guard). Called by the
// accessors on change — the render walk only reads the cache, so no fuse math weighs on the base render
// path. The cached ColorTransform is reused in place across re-fuses to avoid per-set allocation churn.
function resolveDisplayObjectColorAdjustments(runtime: DisplayObjectRuntime): void {
  const adjustments = runtime.colorAdjustments;
  if (adjustments === null || adjustments.length === 0) {
    runtime.resolvedColorTransform = null;
    runtime.colorAdjustmentsChannelMixing = false;
    return;
  }
  const out = runtime.resolvedColorTransform ?? createColorTransform();
  const status = resolveColorAdjustmentsColorTransform(adjustments, out);
  if (status === COLOR_ADJUSTMENT_NONE) {
    runtime.resolvedColorTransform = null;
    runtime.colorAdjustmentsChannelMixing = false;
    return;
  }
  runtime.resolvedColorTransform = out;
  runtime.colorAdjustmentsChannelMixing = status === COLOR_ADJUSTMENT_CHANNEL_MIXING;
}
