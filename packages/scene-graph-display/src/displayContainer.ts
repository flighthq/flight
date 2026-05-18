import type { DisplayContainer, PartialNode } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createDisplayContainer(obj?: Readonly<PartialNode<DisplayContainer>>): DisplayContainer {
  return createDisplayObjectGeneric(DisplayObjectKind, obj) as DisplayContainer;
}
