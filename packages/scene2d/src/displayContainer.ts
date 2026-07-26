import type { DisplayObject, DisplayObjectRuntime, PartialNode } from '@flighthq/types/contract';
import { DisplayObjectKind } from '@flighthq/types/contract';

import { createNode2D, createNode2DRuntime, getNode2DRuntime } from './displayObject';

export function createDisplayObject(obj?: Readonly<PartialNode<DisplayObject>>): DisplayObject {
  return createNode2D(DisplayObjectKind, obj, undefined, createDisplayObjectRuntime) as DisplayObject;
}

export function createDisplayObjectRuntime(): DisplayObjectRuntime {
  return createNode2DRuntime() as DisplayObjectRuntime;
}

export function getDisplayObjectRuntime(source: Readonly<DisplayObject>): Readonly<DisplayObjectRuntime> {
  return getNode2DRuntime(source) as DisplayObjectRuntime;
}
