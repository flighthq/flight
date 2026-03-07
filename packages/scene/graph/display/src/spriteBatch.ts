import { DisplayObjectType, type PartialWithData, type SpriteBatch, type SpriteBatchData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createSpriteBatch(obj: PartialWithData<SpriteBatch> = {}): SpriteBatch {
  return createPrimitive(DisplayObjectType.SpriteBatch, obj, createSpriteBatchData) as SpriteBatch;
}

export function createSpriteBatchData(data?: Partial<SpriteBatchData>): SpriteBatchData {
  return {
    batch: data?.batch ?? null,
    smoothing: data?.smoothing ?? true,
  };
}
