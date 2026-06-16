import {
  createNode,
  createNodeRuntime,
  getNodeRuntime,
  initAppearanceTrait,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initMaterialTrait,
  initTransform2DRuntimeTrait,
  initTransform2DTrait,
  invalidateNodeAppearance,
} from '@flighthq/node';
import type {
  DisplayGraphNodeDataFactory,
  DisplayGraphNodeRuntimeFactory,
  DisplayObject,
  DisplayObjectRuntime,
  MethodsOf,
  Node,
  NodeRuntimeFactory,
  PartialNode,
  Rectangle,
} from '@flighthq/types';
import { DisplayGraph } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

export function createDisplayObject(obj?: Readonly<PartialNode<DisplayObject>>): DisplayObject {
  return createDisplayObjectGeneric(DisplayObjectKind, obj);
}

export function createDisplayObjectGeneric<R extends DisplayObjectRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<DisplayObject>>,
  createData?: DisplayGraphNodeDataFactory,
  createDisplayObjectRuntimeFactory?: DisplayGraphNodeRuntimeFactory<R>,
): DisplayObject {
  const out = createNode(
    DisplayGraph,
    kind,
    obj,
    createData,
    createDisplayObjectRuntimeFactory ?? (createDisplayObjectRuntime as unknown as NodeRuntimeFactory<R>),
  ) as DisplayObject;
  initTransform2DTrait(out, obj);
  initBoundsRectangleTrait(out, obj);
  initAppearanceTrait(out, obj);
  initMaterialTrait(out, obj);
  out.mask = obj?.mask ?? null;
  out.clipRectangle = obj?.clipRectangle ?? null;
  return out;
}

export function createDisplayObjectRuntime(
  methods?: Readonly<Partial<MethodsOf<DisplayObjectRuntime>>>,
): DisplayObjectRuntime {
  const out = createNodeRuntime(methods) as DisplayObjectRuntime;
  initTransform2DRuntimeTrait(out, methods);
  initBoundsRectangleRuntimeTrait(out, methods);
  return out;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): Readonly<DisplayObjectRuntime> {
  return getNodeRuntime(source) as DisplayObjectRuntime;
}

// eslint-disable-next-line
export function isDisplayObject(source: Readonly<Node<any, any>>): boolean {
  return getNodeRuntime(source).graph === DisplayGraph;
}

export function setDisplayObjectClipRectangle(source: DisplayObject, value: Rectangle | null): void {
  source.clipRectangle = value;
  invalidateNodeAppearance(source);
}

export function setDisplayObjectMask(source: DisplayObject, value: DisplayObject | null): void {
  source.mask = value;
  invalidateNodeAppearance(source);
}
