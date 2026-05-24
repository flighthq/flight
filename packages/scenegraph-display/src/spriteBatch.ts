import type { PartialNode, SpriteBatch, SpriteBatchData, SpriteBatchRuntime } from '@flighthq/types';
import { SpriteBatchKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function createSpriteBatch(obj?: Readonly<PartialNode<SpriteBatch>>): SpriteBatch {
  return createDisplayObjectGeneric(
    SpriteBatchKind,
    obj,
    createSpriteBatchData,
    createSpriteBatchRuntime,
  ) as SpriteBatch;
}

export function createSpriteBatchData(data?: Readonly<Partial<SpriteBatchData>>): SpriteBatchData {
  return {
    graph: data?.graph ?? null,
    smoothing: data?.smoothing ?? true,
  };
}

export function createSpriteBatchRuntime(): SpriteBatchRuntime {
  return createDisplayObjectRuntime() as SpriteBatchRuntime;
}

export function getSpriteBatchRuntime(source: Readonly<SpriteBatch>): Readonly<SpriteBatchRuntime> {
  return getDisplayObjectRuntime(source) as SpriteBatchRuntime;
}
