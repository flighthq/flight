import {
  createGraphNode,
  createGraphNodeRuntime,
  getGraphNodeRuntime,
  initAppearanceTrait,
  initBoundsRectRuntimeTrait,
  initBoundsRectTrait,
  initTransformRuntimeTrait,
  initTransformTrait,
  invalidateAppearance,
} from '@flighthq/scenegraph-core';
import type {
  DisplayGraphNodeDataFactory,
  DisplayGraphNodeRuntimeFactory,
  DisplayObject,
  DisplayObjectRuntime,
  DisplayObjectTraits,
  Filter,
  GraphNode,
  GraphNodeRuntimeFactory,
  MethodsOf,
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
  const out = createGraphNode(
    DisplayGraph,
    kind,
    obj,
    createData,
    createDisplayObjectRuntimeFactory ??
      (createDisplayObjectRuntime as GraphNodeRuntimeFactory<typeof DisplayGraph, DisplayObjectTraits, R>),
  ) as DisplayObject;
  initTransformTrait(out, obj);
  initBoundsRectTrait(out, obj);
  initAppearanceTrait(out, obj);
  out.filters = obj?.filters ?? null;
  out.mask = obj?.mask ?? null;
  out.scrollRect = obj?.scrollRect ?? null;
  return out;
}

export function createDisplayObjectRuntime(
  methods?: Readonly<Partial<MethodsOf<DisplayObjectRuntime>>>,
): DisplayObjectRuntime {
  const out = createGraphNodeRuntime(methods) as DisplayObjectRuntime;
  initTransformRuntimeTrait(out, methods);
  initBoundsRectRuntimeTrait(out, methods);
  return out;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): Readonly<DisplayObjectRuntime> {
  return getGraphNodeRuntime(source) as DisplayObjectRuntime;
}

// eslint-disable-next-line
export function isDisplayObject(source: Readonly<GraphNode<any, any>>): boolean {
  return getGraphNodeRuntime(source).graph === DisplayGraph;
}

export function setDisplayObjectFilters(source: DisplayObject, value: Filter[] | null): void {
  source.filters = value;
  invalidateAppearance(source);
}

export function setDisplayObjectMask(source: DisplayObject, value: DisplayObject | null): void {
  source.mask = value;
  invalidateAppearance(source);
}

export function setDisplayObjectScrollRectangle(source: DisplayObject, value: Rectangle | null): void {
  source.scrollRect = value;
  invalidateAppearance(source);
}
