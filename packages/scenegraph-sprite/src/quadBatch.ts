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
  Vector2Like,
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

export function hitTestQuadBatchPoint(source: Readonly<QuadBatch>, point: Readonly<Vector2Like>): number {
  return hitTestQuadBatchPointXY(source, point.x, point.y);
}

export function hitTestQuadBatchPointXY(source: Readonly<QuadBatch>, x: number, y: number): number {
  const { atlas, ids, instanceCount, transforms, transformType } = source.data;
  if (atlas === null || instanceCount === 0) return -1;
  const regions = atlas.regions;
  const numRegions = regions.length;
  if (transformType === 'vector2') {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      const dx = transforms[i * 2];
      const dy = transforms[i * 2 + 1];
      if (x >= dx && x < dx + region.width && y >= dy && y < dy + region.height) return i;
    }
  } else {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const o = i * 6;
      const a = transforms[o];
      const b = transforms[o + 1];
      const c = transforms[o + 2];
      const d = transforms[o + 3];
      const tx = transforms[o + 4];
      const ty = transforms[o + 5];
      const w = region.width;
      const h = region.height;
      const x0 = tx;
      const y0 = ty;
      const x1 = a * w + tx;
      const y1 = b * w + ty;
      const x2 = c * h + tx;
      const y2 = d * h + ty;
      const x3 = a * w + c * h + tx;
      const y3 = b * w + d * h + ty;
      const minX = Math.min(x0, x1, x2, x3);
      const minY = Math.min(y0, y1, y2, y3);
      const maxX = Math.max(x0, x1, x2, x3);
      const maxY = Math.max(y0, y1, y2, y3);
      if (x >= minX && x < maxX && y >= minY && y < maxY) return i;
    }
  }
  return -1;
}

export function measureQuadBatchBoundsRectangle(out: Rectangle, source: Readonly<QuadBatch>): void {
  const { atlas, ids, instanceCount, transforms, transformType } = source.data;
  if (atlas === null || instanceCount === 0) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
    return;
  }
  const regions = atlas.regions;
  const numRegions = regions.length;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  if (transformType === 'vector2') {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const dx = transforms[i * 2];
      const dy = transforms[i * 2 + 1];
      if (dx < minX) minX = dx;
      if (dy < minY) minY = dy;
      const rx = dx + region.width;
      const ry = dy + region.height;
      if (rx > maxX) maxX = rx;
      if (ry > maxY) maxY = ry;
    }
  } else {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const o = i * 6;
      const a = transforms[o];
      const b = transforms[o + 1];
      const c = transforms[o + 2];
      const d = transforms[o + 3];
      const tx = transforms[o + 4];
      const ty = transforms[o + 5];
      const w = region.width;
      const h = region.height;
      const x0 = tx;
      const y0 = ty;
      const x1 = a * w + tx;
      const y1 = b * w + ty;
      const x2 = c * h + tx;
      const y2 = d * h + ty;
      const x3 = a * w + c * h + tx;
      const y3 = b * w + d * h + ty;
      const qMinX = Math.min(x0, x1, x2, x3);
      const qMinY = Math.min(y0, y1, y2, y3);
      const qMaxX = Math.max(x0, x1, x2, x3);
      const qMaxY = Math.max(y0, y1, y2, y3);
      if (qMinX < minX) minX = qMinX;
      if (qMinY < minY) minY = qMinY;
      if (qMaxX > maxX) maxX = qMaxX;
      if (qMaxY > maxY) maxY = qMaxY;
    }
  }
  if (minX === Infinity) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
  } else {
    out.x = minX;
    out.y = minY;
    out.width = maxX - minX;
    out.height = maxY - minY;
  }
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
