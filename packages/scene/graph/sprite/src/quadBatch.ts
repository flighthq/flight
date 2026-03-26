import { reserveFloat32Array, reserveUint16Array } from '@flighthq/core';
import type {
  GraphNode,
  PartialNode,
  QuadBatch,
  QuadBatchData,
  QuadTransformType,
  Rectangle,
  SpriteNodeRuntime,
} from '@flighthq/types';
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
    atlas: data?.atlas ?? null,
    ids: data?.ids ?? new Uint16Array(),
    instanceCount: data?.instanceCount ?? 0,
    transforms: data?.transforms ?? new Float32Array(),
    transformType: data?.transformType ?? 'vector2',
  };
}

export function createQuadBatchRuntime(): SpriteNodeRuntime {
  return createSpriteNodeRuntime(defaultMethods);
}

export function getQuadBatchCapacity(source: Readonly<QuadBatch>): number {
  const data = source.data;
  const stride = getQuadTransformStride(data.transformType);
  const transformCapacity = (data.transforms.length / stride) | 0;
  return Math.min(data.ids.length, transformCapacity);
}

export function getQuadTransformStride(transformType: QuadTransformType): number {
  return quadTransformStride[transformType];
}

export function reserveQuadBatch(target: QuadBatch, capacity: number): void {
  const currentCapacity = getQuadBatchCapacity(target);
  if (currentCapacity >= capacity) return;
  const data = target.data;
  data.ids = reserveUint16Array(data.ids, capacity);
  data.transforms = reserveFloat32Array(data.transforms, capacity * getQuadTransformStride(data.transformType));
}

export function resizeQuadBatch(target: QuadBatch, instanceCount: number): void {
  const data = target.data;
  const oldInstanceCount = data.instanceCount;
  data.instanceCount = instanceCount;
  if (oldInstanceCount >= instanceCount) return;
  const capacity = getQuadBatchCapacity(target);
  if (capacity < instanceCount) {
    const newCapacity = Math.max(instanceCount, capacity * 2);
    reserveQuadBatch(target, newCapacity);
  }
}

const defaultMethods: Partial<SpriteNodeRuntime> = {
  computeLocalBoundsRect: computeQuadBatchLocalBoundsRect,
};

const quadTransformStride = {
  vector2: 2,
  matrix3x2: 6,
} as const;
