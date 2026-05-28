import {
  createGraphNode,
  createGraphNodeRuntime,
  getGraphNodeRuntime,
  initHasAppearance,
  initHasBoundsRect,
  initHasBoundsRectRuntime,
  initHasTransform2D,
  initHasTransform2DRuntime,
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
  createRuntime?: DisplayGraphNodeRuntimeFactory<R>,
): DisplayObject {
  const out = createGraphNode(
    DisplayGraph,
    kind,
    obj,
    createData,
    createRuntime ??
      (createDisplayObjectRuntime as GraphNodeRuntimeFactory<typeof DisplayGraph, DisplayObjectTraits, R>),
  ) as DisplayObject;
  initHasTransform2D(out, obj);
  initHasBoundsRect(out, obj);
  initHasAppearance(out, obj);
  out.filters = obj?.filters ?? null;
  out.mask = obj?.mask ?? null;
  out.scrollRect = obj?.scrollRect ?? null;
  return out;
}

export function createDisplayObjectRuntime(
  methods?: Readonly<Partial<MethodsOf<DisplayObjectRuntime>>>,
): DisplayObjectRuntime {
  const out = createGraphNodeRuntime(methods) as DisplayObjectRuntime;
  initHasTransform2DRuntime(out, methods);
  initHasBoundsRectRuntime(out, methods);
  out.interactionSignals = null;
  return out;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): Readonly<DisplayObjectRuntime> {
  return getGraphNodeRuntime(source) as DisplayObjectRuntime;
}

// eslint-disable-next-line
export function isDisplayObject(source: Readonly<GraphNode<any, any>>): boolean {
  return getGraphNodeRuntime(source).graph === DisplayGraph;
}

export function setFilters(source: DisplayObject, value: Filter[] | null): void {
  source.filters = value;
  invalidateAppearance(source);
}

export function setMask(source: DisplayObject, value: DisplayObject | null): void {
  source.mask = value;
  invalidateAppearance(source);
}

export function setScrollRect(source: DisplayObject, value: Rectangle | null): void {
  source.scrollRect = value;
  invalidateAppearance(source);
}
