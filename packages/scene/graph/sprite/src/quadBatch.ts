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
    atlas: data?.atlas ?? null,
    indices: data?.indices ?? null,
    numQuads: data?.numQuads ?? 0,
    overrideRects: data?.overrideRects ?? null,
    transforms: data?.transforms ?? null,
    transformType: data?.transformType ?? 'vector2',
  };
}

export function createQuadBatchRuntime(): SpriteNodeRuntime {
  return createSpriteNodeRuntime(defaultMethods);
}

export function resizeQuadBatch(target: QuadBatch, numQuads: number): boolean {
  const data = target.data;
  if (numQuads <= data.numQuads) return false;
  const capacity = getQuadCapacity(data);
  if (capacity >= numQuads) {
    data.numQuads = numQuads;
    return false;
  }

  const newCapacity = growCapacity(capacity);
  if (data.overrideRects !== null) {
    data.overrideRects = resizeFloat32Array(data.overrideRects, newCapacity * 4);
  } else {
    data.indices = resizeInt16Array(data.indices, newCapacity);
  }
  data.transforms = resizeFloat32Array(data.transforms, newCapacity * quadTransformLength[data.transformType]);
  data.numQuads = numQuads;
  return true;
}

function getQuadCapacity(data: QuadBatchData): number {
  if (data.overrideRects !== null) return data.overrideRects.length >> 2;
  if (data.indices !== null) return data.indices.length;
  return 0;
}

function growCapacity(current: number): number {
  return ((current + 1) * 3) >> 1;
}

function resizeInt16Array(array: Int16Array | null, length: number): Int16Array {
  const out = new Int16Array(length);
  if (array) out.set(array);
  return out;
}

function resizeFloat32Array(array: Float32Array | null, length: number): Float32Array {
  const out = new Float32Array(length);
  if (array) out.set(array);
  return out;
}

const defaultMethods: Partial<SpriteNodeRuntime> = {
  computeLocalBoundsRect: computeQuadBatchLocalBoundsRect,
};

const quadTransformLength = {
  vector2: 2,
  matrix2x2: 4,
  matrix3x2: 6,
} as const;
