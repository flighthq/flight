import type { DisplayContainer, DisplayContainerRuntime, PartialNode } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function createDisplayContainer(obj?: Readonly<PartialNode<DisplayContainer>>): DisplayContainer {
  return createDisplayObjectGeneric(
    DisplayObjectKind,
    obj,
    undefined,
    createDisplayContainerRuntime,
  ) as DisplayContainer;
}

export function createDisplayContainerRuntime(): DisplayContainerRuntime {
  return createDisplayObjectRuntime() as DisplayContainerRuntime;
}

export function getDisplayContainerRuntime(source: Readonly<DisplayContainer>): Readonly<DisplayContainerRuntime> {
  return getDisplayObjectRuntime(source) as DisplayContainerRuntime;
}
