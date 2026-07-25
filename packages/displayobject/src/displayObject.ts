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
  initBlendModeTrait,
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
  Node2D,
  Node2DDataFactory,
  Node2DRuntime,
  Node2DRuntimeFactory,
  Kind,
  MethodsOf,
  NodeAny,
  NodeRuntimeFactory,
  PartialNode,
} from '@flighthq/types';
import { Node2DTraitsKey } from '@flighthq/types';

// Appends one pointwise color adjustment to this object's stack (creating the stack if absent), re-fuses
// the resolved cache, and invalidates appearance so the render walk hands the fold the new value.
// Allocates a new array — the stack is a plain `readonly Adjustment[]`, never mutated in place.
export function addNode2DColorAdjustment(source: Node2D, adjustment: Adjustment): void {
  const runtime = getNodeRuntime(source) as Node2DRuntime;
  const current = runtime.colorAdjustments;
  runtime.colorAdjustments = current === null ? [adjustment] : [...current, adjustment];
  resolveNode2DColorAdjustments(runtime);
  invalidateNodeAppearance(source);
}

export function createNode2D<R extends Node2DRuntime>(
  kind: Kind,
  obj?: Readonly<PartialNode<Node2D>>,
  createData?: Node2DDataFactory,
  createNode2DRuntimeFactory?: Node2DRuntimeFactory<R>,
): Node2D {
  const out = createNode(
    kind,
    obj,
    createData,
    createNode2DRuntimeFactory ?? (createNode2DRuntime as unknown as NodeRuntimeFactory<R>),
  ) as Node2D;
  initTransform2DTrait(out, obj);
  initBoundsRectangleTrait(out, obj);
  initAppearanceTrait(out, obj);
  initBlendModeTrait(out, obj);
  initMaterialTrait(out, obj);
  initClipTrait(out, obj);
  return out;
}

export function createNode2DRuntime(methods?: Readonly<Partial<MethodsOf<Node2DRuntime>>>): Node2DRuntime {
  const out = createNodeRuntime(methods) as Node2DRuntime;
  out.traits = Node2DTraitsKey;
  out.stage = null;
  initTransform2DRuntimeTrait(out, methods);
  initBoundsRectangleRuntimeTrait(out, methods);
  return out;
}

// Returns this object's pointwise color-adjustment stack (the source of truth on the node runtime), or
// null when it carries none.
export function getNode2DColorAdjustments(source: Readonly<Node2D>): readonly Adjustment[] | null {
  return getNodeRuntime(source).colorAdjustments;
}

export function getNode2DRuntime(source: Readonly<Node2D>): Readonly<Node2DRuntime> {
  return getNodeRuntime(source) as Node2DRuntime;
}

export function isNode2D(node: NodeAny): node is Node2D {
  return getNodeRuntime(node).traits === Node2DTraitsKey;
}

export function setNode2DClip(source: Node2D, value: ClipRegion | null): void {
  source.clip = value;
  invalidateNodeAppearance(source);
}

// Sets (or clears with null) this object's pointwise color-adjustment stack — the generic replacement for
// the removed color-transform trait. A color transform is one member: `createColorTransformAdjustment`.
// Re-fuses the resolved cache once here (not per frame) and invalidates appearance so the render walk
// hands the fold the affine ColorTransform the stack resolves to. Null is the untinted default.
export function setNode2DColorAdjustments(source: Node2D, value: readonly Adjustment[] | null): void {
  const runtime = getNodeRuntime(source) as Node2DRuntime;
  runtime.colorAdjustments = value;
  resolveNode2DColorAdjustments(runtime);
  invalidateNodeAppearance(source);
}

// Convenience for the common single-tint path (the color-transform an agent looks for): sets this object's
// adjustment stack to one `ColorTransformAdjustment`, or clears it with null. Thin wrapper over
// `setNode2DColorAdjustments` — a color transform is just one adjustment in the generic stack.
export function setNode2DColorTransform(source: Node2D, colorTransform: Readonly<ColorTransform> | null): void {
  setNode2DColorAdjustments(source, colorTransform === null ? null : [createColorTransformAdjustment(colorTransform)]);
}

// Fuses the runtime's color-adjustment stack once into its cached affine `resolvedColorTransform`, setting
// `colorAdjustmentsChannelMixing` when the fused stack has off-diagonal channel-mixing terms the 8-float
// fold cannot represent yet (the render walk reports that through the shakeable guard). Called by the
// accessors on change — the render walk only reads the cache, so no fuse math weighs on the base render
// path. The cached ColorTransform is reused in place across re-fuses to avoid per-set allocation churn.
function resolveNode2DColorAdjustments(runtime: Node2DRuntime): void {
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

export { createDisplayObject } from './displayContainer';
