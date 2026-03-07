import type { SceneNodeDataFactory, SceneNodeRuntimeFactory } from '@flighthq/scene-graph-core';
import { createSceneNode } from '@flighthq/scene-graph-core';
import type { DisplayObject, DisplayObjectData, PartialWithData } from '@flighthq/types';
import { BlendMode, DisplayObjectKind } from '@flighthq/types';

import type { DisplayObjectInternal } from './internal';
import { createDisplayObjectRuntime } from './runtime';

export type DisplayObjectDataFactory = SceneNodeDataFactory<DisplayObjectData>;
export type DisplayObjectRuntimeFactory = SceneNodeRuntimeFactory<typeof DisplayObjectKind>;

export function createPrimitive(
  type: symbol,
  obj?: PartialWithData<DisplayObject>,
  createData?: DisplayObjectDataFactory,
  createRuntime?: DisplayObjectRuntimeFactory,
): DisplayObject {
  const out = createSceneNode(
    DisplayObjectKind,
    obj,
    createData,
    createRuntime ?? createDisplayObjectRuntime,
  ) as DisplayObject;
  out.alpha = obj?.alpha ?? 1;
  out.blendMode = obj?.blendMode ?? BlendMode.Normal;
  out.cacheAsBitmap = obj?.cacheAsBitmap ?? false;
  out.cacheAsBitmapMatrix = obj?.cacheAsBitmapMatrix ?? null;
  out.colorTransform = obj?.colorTransform ?? null;
  out.filters = obj?.filters ?? null;
  out.mask = obj?.mask ?? null;
  out.opaqueBackground = obj?.opaqueBackground ?? null;
  out.rotation = obj?.rotation ?? 0;
  out.scale9Grid = obj?.scale9Grid ?? null;
  out.scaleX = obj?.scaleX ?? 1;
  out.scaleY = obj?.scaleY ?? 1;
  out.scrollRect = obj?.scrollRect ?? null;
  out.shader = obj?.shader ?? null;
  (out as DisplayObjectInternal).stage = obj?.stage ?? null;
  out.type = obj?.type ?? type;
  out.x = obj?.x ?? 0;
  out.y = obj?.y ?? 0;
  return out;
}
