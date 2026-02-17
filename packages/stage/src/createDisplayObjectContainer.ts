import type { DisplayObject, DisplayObjectContainer } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';
import { getDerivedState } from './internal/derivedState';

export function createDisplayObjectContainer(obj: Partial<DisplayObjectContainer> = {}): DisplayObjectContainer {
  createDisplayObject(obj);
  // TODO: Construct later?
  const state = getDerivedState(obj as DisplayObject);
  if (state.children === null) state.children = [];
  return obj as DisplayObjectContainer;
}
