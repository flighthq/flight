import type { PartialWithData, SpriteBatch, SpriteBatchData } from '@flighthq/types';
import { SpriteBatchKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createSpriteBatch(obj?: Readonly<PartialWithData<SpriteBatch>>): SpriteBatch {
  return createDisplayObjectGeneric(SpriteBatchKind, obj, createSpriteBatchData) as SpriteBatch;
}

export function createSpriteBatchData(data?: Readonly<Partial<SpriteBatchData>>): SpriteBatchData {
  return {
    batch: data?.batch ?? null,
    smoothing: data?.smoothing ?? true,
  };
}
