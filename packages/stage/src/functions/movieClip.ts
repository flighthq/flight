import type { DisplayObjectContainer } from '@flighthq/types';

import { create as createDisplayObjectContainer } from './displayObjectContainer.js';

export {
  getBounds,
  getRect,
  globalToLocal,
  hitTestObject,
  hitTestPoint,
  invalidate,
  localToGlobal,
} from './displayObject.js';
export {
  addChild,
  addChildAt,
  removeChild,
  removeChildAt,
  removeChildren,
  setChildIndex,
  swapChildren,
  swapChildrenAt,
} from './displayObjectContainer.js';

export function create(obj: Partial<DisplayObjectContainer> = {}): DisplayObjectContainer {
  return createDisplayObjectContainer(obj);
}
