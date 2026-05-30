import { reserveFloat32Array, reserveUint16Array } from '@flighthq/geometry';
import type {
  GraphNode,
  MethodsOf,
  PartialNode,
  QuadBatch,
  QuadBatchData,
  QuadBatchRuntime,
  QuadTransformType,
  Rectangle,
} from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import { createSpriteNode, createSpriteNodeRuntime, getSpriteNodeRuntime } from './spriteNode';

export function computeQuadBatchLocalBoundsRectangle(_out: Rectangle, _source: Readonly<GraphNode>): void {
  // TODO
}

export function createQuadBatch(obj?: Readonly<PartialNode<QuadBatch>>): QuadBatch {
  return createSpriteNode(QuadBatchKind, obj, createQuadBatchData, createQuadBatchRuntime) as QuadBatch;
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

export function createQuadBatchRuntime(): QuadBatchRuntime {
  return createSpriteNodeRuntime(defaultMethods) as QuadBatchRuntime;
}

export function getQuadBatchCapacity(source: Readonly<QuadBatch>): number {
  const data = source.data;
  const stride = getQuadTransformStride(data.transformType);
  const transformCapacity = (data.transforms.length / stride) | 0;
  return Math.min(data.ids.length, transformCapacity);
}

export function getQuadBatchRuntime(source: Readonly<QuadBatch>): Readonly<QuadBatchRuntime> {
  return getSpriteNodeRuntime(source) as QuadBatchRuntime;
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

const defaultMethods: Partial<MethodsOf<QuadBatchRuntime>> = {
  computeLocalBoundsRect: computeQuadBatchLocalBoundsRectangle,
};

const quadTransformStride = {
  vector2: 2,
  matrix3x2: 6,
} as const;
