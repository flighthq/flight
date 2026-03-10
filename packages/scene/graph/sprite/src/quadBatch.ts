import type {
  GraphNode,
  HasBoundsRect,
  PartialWithData,
  QuadBatch,
  QuadBatchData,
  Rectangle,
  SpriteBaseRuntime,
  SpriteGraph,
} from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import { createSpriteBase, createSpriteBaseRuntime } from './spriteBase';

export function computeQuadBatchLocalBoundsRect(
  _out: Rectangle,
  _source: Readonly<GraphNode<typeof SpriteGraph> & HasBoundsRect<typeof SpriteGraph>>,
): void {
  // TODO
}

export function createQuadBatch(obj?: Readonly<PartialWithData<QuadBatch>>): QuadBatch {
  return createSpriteBase(QuadBatchKind, obj, createQuadBatchData, createQuadBatchRuntime) as QuadBatch;
}

export function createQuadBatchData(data?: Readonly<Partial<QuadBatchData>>): QuadBatchData {
  return {
    indices: data?.indices ?? null,
    rects: data?.rects ?? null,
    transforms: data?.transforms ?? null,
  };
}

export function createQuadBatchRuntime(): SpriteBaseRuntime {
  return createSpriteBaseRuntime(defaultMethods);
}

const defaultMethods: Partial<SpriteBaseRuntime> = {
  computeLocalBoundsRect: computeQuadBatchLocalBoundsRect,
};
