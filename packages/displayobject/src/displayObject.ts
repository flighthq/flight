import {
  createSceneNode,
  createSceneNodeRuntime,
  getSceneNodeRuntime,
  initAppearanceTrait,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initTransformRuntimeTrait,
  initTransformTrait,
  invalidateAppearance,
} from '@flighthq/node';
import type {
  DisplayGraphNodeDataFactory,
  DisplayGraphNodeRuntimeFactory,
  DisplayObject,
  DisplayObjectRuntime,
  MethodsOf,
  PartialNode,
  Rectangle,
  SceneNode,
  SceneNodeRuntimeFactory,
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
  const out = createSceneNode(
    DisplayGraph,
    kind,
    obj,
    createData,
    createDisplayObjectRuntimeFactory ?? (createDisplayObjectRuntime as unknown as SceneNodeRuntimeFactory<R>),
  ) as DisplayObject;
  initTransformTrait(out, obj);
  initBoundsRectangleTrait(out, obj);
  initAppearanceTrait(out, obj);
  out.mask = obj?.mask ?? null;
  out.clipRectangle = obj?.clipRectangle ?? null;
  return out;
}

export function createDisplayObjectRuntime(
  methods?: Readonly<Partial<MethodsOf<DisplayObjectRuntime>>>,
): DisplayObjectRuntime {
  const out = createSceneNodeRuntime(methods) as DisplayObjectRuntime;
  initTransformRuntimeTrait(out, methods);
  initBoundsRectangleRuntimeTrait(out, methods);
  return out;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): Readonly<DisplayObjectRuntime> {
  return getSceneNodeRuntime(source) as DisplayObjectRuntime;
}

// eslint-disable-next-line
export function isDisplayObject(source: Readonly<SceneNode<any, any>>): boolean {
  return getSceneNodeRuntime(source).graph === DisplayGraph;
}

export function setDisplayObjectClipRectangle(source: DisplayObject, value: Rectangle | null): void {
  source.clipRectangle = value;
  invalidateAppearance(source);
}

export function setDisplayObjectMask(source: DisplayObject, value: DisplayObject | null): void {
  source.mask = value;
  invalidateAppearance(source);
}
