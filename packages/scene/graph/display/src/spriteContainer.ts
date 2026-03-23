import type { PartialNode, SpriteContainer, SpriteContainerData } from '@flighthq/types';
import { SpriteContainerKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createSpriteContainer(obj?: Readonly<PartialNode<SpriteContainer>>): SpriteContainer {
  return createDisplayObjectGeneric(SpriteContainerKind, obj, createSpriteContainerData) as SpriteContainer;
}

export function createSpriteContainerData(data?: Readonly<Partial<SpriteContainerData>>): SpriteContainerData {
  return {
    graph: data?.graph ?? null,
    smoothing: data?.smoothing ?? true,
  };
}
