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
  ClipRegion,
  DisplayObject,
  DisplayObjectDataFactory,
  DisplayObjectRuntime,
  DisplayObjectRuntimeFactory,
  MethodsOf,
  NodeAny,
  NodeRuntimeFactory,
  PartialNode,
} from '@flighthq/types';
import { DisplayObjectKind, DisplayObjectTraitsKey } from '@flighthq/types';

export function createDisplayObject(obj?: Readonly<PartialNode<DisplayObject>>): DisplayObject {
  return createDisplayObjectGeneric(DisplayObjectKind, obj);
}

export function createDisplayObjectGeneric<R extends DisplayObjectRuntime>(
  kind: symbol,
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
