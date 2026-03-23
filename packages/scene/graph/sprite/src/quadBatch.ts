import type { GraphNode, PartialNode, QuadBatch, QuadBatchData, Rectangle, SpriteNodeRuntime } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import { createSpriteNode, createSpriteNodeRuntime } from './spriteBase';

export function computeQuadBatchLocalBoundsRect(_out: Rectangle, _source: Readonly<GraphNode>): void {
  // TODO
}

export function createQuadBatch(obj?: Readonly<PartialNode<QuadBatch>>): QuadBatch {
  return createSpriteNode(QuadBatchKind, obj, createQuadBatchData, createQuadBatchRuntime as any) as QuadBatch; // eslint-disable-line
}

export function createQuadBatchData(data?: Readonly<Partial<QuadBatchData>>): QuadBatchData {
  return {
    image: data?.image ?? null,
    indices: data?.indices ?? null,
    rects: data?.rects ?? null,
    transforms: data?.transforms ?? null,
  };
}

export function createQuadBatchRuntime(): SpriteNodeRuntime {
  return createSpriteNodeRuntime(defaultMethods);
}

const defaultMethods: Partial<SpriteNodeRuntime> = {
  computeLocalBoundsRect: computeQuadBatchLocalBoundsRect,
};
