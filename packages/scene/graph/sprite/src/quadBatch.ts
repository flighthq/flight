import type { GraphNode, PartialNode, QuadBatch, QuadBatchData, Rectangle, SpriteBaseRuntime } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import { createSpriteBase, createSpriteBaseRuntime } from './spriteBase';

export function computeQuadBatchLocalBoundsRect(_out: Rectangle, _source: Readonly<GraphNode>): void {
  // TODO
}

export function createQuadBatch(obj?: Readonly<PartialNode<QuadBatch>>): QuadBatch {
  return createSpriteBase(QuadBatchKind, obj, createQuadBatchData, createQuadBatchRuntime as any) as QuadBatch; // eslint-disable-line
}

export function createQuadBatchData(data?: Readonly<Partial<QuadBatchData>>): QuadBatchData {
  return {
    image: data?.image ?? null,
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
