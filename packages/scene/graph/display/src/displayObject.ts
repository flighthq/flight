import type { GraphNodeDataFactory, GraphNodeRuntimeFactory } from '@flighthq/scene-graph-core';
import {
  createGraphNode,
  createGraphNodeRuntime,
  getGraphNodeRuntime,
  initHasAppearance,
  initHasBoundsRect,
  initHasBoundsRectRuntime,
  initHasTransform2D,
  initHasTransform2DRuntime,
} from '@flighthq/scene-graph-core';
import type {
  DisplayObject,
  DisplayObjectData,
  DisplayObjectRuntime,
  DisplayObjectTraits,
  GraphNode,
  MethodsOf,
  PartialNode,
} from '@flighthq/types';
import { DisplayGraph } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

export function createDisplayObject(obj?: Readonly<PartialNode<DisplayObject>>): DisplayObject {
  return createDisplayObjectGeneric(DisplayObjectKind, obj);
}

export type DisplayGraphNodeDataFactory = GraphNodeDataFactory<DisplayObjectData>;
export type DisplayGraphNodeRuntimeFactory<R extends DisplayObjectRuntime> = GraphNodeRuntimeFactory<
  typeof DisplayGraph,
  DisplayObjectTraits,
  R
>;

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
  out.cacheAsBitmap = obj?.cacheAsBitmap ?? false;
  out.cacheAsBitmapMatrix = obj?.cacheAsBitmapMatrix ?? null;
  out.filters = obj?.filters ?? null;
  out.mask = obj?.mask ?? null;
  out.opaqueBackground = obj?.opaqueBackground ?? null;
  out.scale9Grid = obj?.scale9Grid ?? null;
  out.scrollRect = obj?.scrollRect ?? null;
  return out;
}

export function createDisplayObjectRuntime(
  methods?: Readonly<Partial<MethodsOf<DisplayObjectRuntime>>>,
): DisplayObjectRuntime {
  const out = createGraphNodeRuntime(methods) as DisplayObjectRuntime;
  initHasTransform2DRuntime(out, methods);
  initHasBoundsRectRuntime(out, methods);
  return out;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): Readonly<DisplayObjectRuntime> {
  return getGraphNodeRuntime(source) as DisplayObjectRuntime;
}

// eslint-disable-next-line
export function isDisplayObject(source: Readonly<GraphNode<any, any>>): boolean {
  return getGraphNodeRuntime(source).graph === DisplayGraph;
}
