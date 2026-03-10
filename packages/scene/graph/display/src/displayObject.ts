import type { GraphNodeRuntimeFactory, NodeDataFactory } from '@flighthq/scene-graph-core';
import {
  createGraphNode,
  createGraphNodeRuntime,
  getRuntime,
  initHasBoundsRect,
  initHasBoundsRectRuntime,
  initHasTransform2D,
  initHasTransform2DRuntime,
} from '@flighthq/scene-graph-core';
import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime, PartialWithData } from '@flighthq/types';
import { BlendMode, DisplayGraph, DisplayObjectKind } from '@flighthq/types';

export function createDisplayObject(obj?: Readonly<PartialWithData<DisplayObject>>): DisplayObject {
  return createDisplayObjectGeneric(DisplayObjectKind, obj);
}

export type DisplayGraphNodeDataFactory = NodeDataFactory<DisplayObjectData>;
export type DisplayGraphNodeRuntimeFactory<R extends DisplayObjectRuntime> = GraphNodeRuntimeFactory<
  typeof DisplayGraph,
  R
>;

export function createDisplayObjectGeneric<R extends DisplayObjectRuntime>(
  kind: symbol,
  obj?: Readonly<PartialWithData<DisplayObject>>,
  createData?: DisplayGraphNodeDataFactory,
  createRuntime?: DisplayGraphNodeRuntimeFactory<R>,
): DisplayObject {
  const out = createGraphNode(
    DisplayGraph,
    kind,
    obj,
    createData,
    createRuntime ?? (createDisplayObjectRuntime as GraphNodeRuntimeFactory<typeof DisplayGraph, R>),
  ) as DisplayObject;
  initHasTransform2D(out, obj);
  initHasBoundsRect(out, obj);
  out.alpha = obj?.alpha ?? 1;
  out.blendMode = obj?.blendMode ?? BlendMode.Normal;
  out.cacheAsBitmap = obj?.cacheAsBitmap ?? false;
  out.cacheAsBitmapMatrix = obj?.cacheAsBitmapMatrix ?? null;
  out.colorTransform = obj?.colorTransform ?? null;
  out.filters = obj?.filters ?? null;
  out.mask = obj?.mask ?? null;
  out.opaqueBackground = obj?.opaqueBackground ?? null;
  out.scale9Grid = obj?.scale9Grid ?? null;
  out.scrollRect = obj?.scrollRect ?? null;
  out.shader = obj?.shader ?? null;
  return out;
}

export function createDisplayObjectRuntime(methods?: Readonly<Partial<DisplayObjectRuntime>>): DisplayObjectRuntime {
  const out = createGraphNodeRuntime(methods) as DisplayObjectRuntime;
  initHasTransform2DRuntime(out, methods);
  initHasBoundsRectRuntime(out, methods);
  return out;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): DisplayObjectRuntime {
  return getRuntime(source) as DisplayObjectRuntime;
}
