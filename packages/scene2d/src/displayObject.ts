import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createNodeRuntime,
  getNodeRuntime,
  initAppearanceTrait,
  initBlendModeTrait,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initClipTrait,
  initializeNode,
  initMaterialTrait,
  initTransform2DRuntimeTrait,
  initTransform2DTrait,
  invalidateNodeAppearance,
} from '@flighthq/node/contract';
import type {
  ClipRegion,
  DisplayObject,
  DisplayObjectRuntime,
  Node2D,
  Node2DDataFactory,
  Node2DRuntime,
  Node2DRuntimeFactory,
  Kind,
  MethodsOf,
  NodeAny,
  NodeRuntimeFactory,
  PartialNode,
} from '@flighthq/types/contract';
import { DisplayObjectKind, Node2DTraitsKey } from '@flighthq/types/contract';

export function createDisplayObject(obj?: Readonly<PartialNode<DisplayObject>>): DisplayObject {
  return createNode2D(DisplayObjectKind, obj, undefined, createDisplayObjectRuntime) as DisplayObject;
}

export function createDisplayObjectRuntime(): DisplayObjectRuntime {
  return createNode2DRuntime() as DisplayObjectRuntime;
}

export function createNode2D<R extends Node2DRuntime>(
  kind: Kind,
  obj?: Readonly<PartialNode<Node2D>>,
  createData?: Node2DDataFactory,
  createNode2DRuntimeFactory?: Node2DRuntimeFactory<R>,
): Node2D {
  const out = allocateEntity<Node2D>();
  initializeNode(
    out,
    kind,
    obj,
    createData,
    createNode2DRuntimeFactory ?? (createNode2DRuntime as unknown as NodeRuntimeFactory<R>),
  );
  initTransform2DTrait(out, obj);
  initBoundsRectangleTrait(out, obj);
  initAppearanceTrait(out, obj);
  initBlendModeTrait(out, obj);
  initMaterialTrait(out, obj);
  initClipTrait(out, obj);
  return finishEntity(out);
}

export function createNode2DRuntime(
  methods?: Readonly<Partial<MethodsOf<Node2DRuntime> & Pick<Node2DRuntime, 'isLocalBoundsRectangleValid'>>>,
): Node2DRuntime {
  const out = createNodeRuntime(methods) as Node2DRuntime;
  out.traits = Node2DTraitsKey;
  out.scene2d = null;
  initTransform2DRuntimeTrait(out, methods);
  initBoundsRectangleRuntimeTrait(out, methods);
  return out;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): Readonly<DisplayObjectRuntime> {
  return getNode2DRuntime(source) as DisplayObjectRuntime;
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
