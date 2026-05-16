import type { PartialNode, SpriteBatch, SpriteBatchData } from '@flighthq/types';
import { SpriteBatchKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createSpriteBatch(obj?: Readonly<PartialNode<SpriteBatch>>): SpriteBatch {
  return createDisplayObjectGeneric(SpriteBatchKind, obj, createSpriteBatchData) as SpriteBatch;
}

export function createSpriteBatchData(data?: Readonly<Partial<SpriteBatchData>>): SpriteBatchData {
  return {
    graph: data?.graph ?? null,
    smoothing: data?.smoothing ?? true,
  };
}
