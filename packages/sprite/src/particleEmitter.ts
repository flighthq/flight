import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { copyRectangle, createRectangle, reserveFloat32Array, reserveUint16Array } from '@flighthq/geometry';
import { invalidateNodeLocalBounds } from '@flighthq/node';
import type {
  DisplayObject,
  MethodsOf,
  Node,
  PartialNode,
  ParticleEmitter,
  ParticleEmitterData,
  ParticleEmitterRuntime,
  Rectangle,
} from '@flighthq/types';
import { ParticleEmitterKind } from '@flighthq/types';

const PARTICLE_TRANSFORM_STRIDE = 4; // [x, y, rotation, scale] per particle

function copyLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const runtime = getDisplayObjectRuntime(source as DisplayObject) as ParticleEmitterRuntime;
  if (runtime.localBoundsRectangle !== null) copyRectangle(out, runtime.localBoundsRectangle);
}

export function computeParticleEmitterLocalBoundsRectangle(out: Rectangle, source: Readonly<ParticleEmitter>): void {
  const { atlas, ids, particleCount, transforms } = source.data;
  if (atlas === null || particleCount === 0) {
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
  for (let i = 0; i < particleCount; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;
    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) continue;
    const tt = i * PARTICLE_TRANSFORM_STRIDE;
    const px = transforms[tt];
    const py = transforms[tt + 1];
    const rotation = transforms[tt + 2];
    const scale = transforms[tt + 3];
    const cosR = Math.cos(rotation) * scale;
    const sinR = Math.sin(rotation) * scale;
    const w = region.width;
    const h = region.height;
    // Four corners of the quad at local (0,0)-(w,h) after rotate+scale+translate
    const x0 = px;
    const y0 = py;
    const x1 = cosR * w + px;
    const y1 = sinR * w + py;
    const x2 = cosR * w - sinR * h + px;
    const y2 = sinR * w + cosR * h + py;
    const x3 = -sinR * h + px;
    const y3 = cosR * h + py;
    const qMinX = Math.min(x0, x1, x2, x3);
    const qMinY = Math.min(y0, y1, y2, y3);
    const qMaxX = Math.max(x0, x1, x2, x3);
    const qMaxY = Math.max(y0, y1, y2, y3);
    if (qMinX < minX) minX = qMinX;
    if (qMinY < minY) minY = qMinY;
    if (qMaxX > maxX) maxX = qMaxX;
    if (qMaxY > maxY) maxY = qMaxY;
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

export function createParticleEmitter(obj?: Readonly<PartialNode<ParticleEmitter>>): ParticleEmitter {
  return createDisplayObjectGeneric(
    ParticleEmitterKind,
    obj,
    createParticleEmitterData,
    createParticleEmitterRuntime,
  ) as ParticleEmitter;
}

export function createParticleEmitterData(data?: Readonly<Partial<ParticleEmitterData>>): ParticleEmitterData {
  return {
    alphas: data?.alphas ?? new Float32Array(),
    atlas: data?.atlas ?? null,
    colors: data?.colors ?? new Float32Array(),
    ids: data?.ids ?? new Uint16Array(),
    particleCount: data?.particleCount ?? 0,
    transforms: data?.transforms ?? new Float32Array(),
    velocities: data?.velocities ?? new Float32Array(),
    worldSpace: data?.worldSpace ?? false,
  };
}

export function createParticleEmitterRuntime(): ParticleEmitterRuntime {
  const runtime = createDisplayObjectRuntime(defaultMethods) as ParticleEmitterRuntime;
  runtime.localBoundsRectangle = null;
  return runtime;
}

export function getParticleEmitterCapacity(source: Readonly<ParticleEmitter>): number {
  const data = source.data;
  const transformCapacity = (data.transforms.length / PARTICLE_TRANSFORM_STRIDE) | 0;
  return Math.min(data.ids.length, data.alphas.length, transformCapacity);
}

export function getParticleEmitterRuntime(source: Readonly<ParticleEmitter>): Readonly<ParticleEmitterRuntime> {
  return getDisplayObjectRuntime(source) as ParticleEmitterRuntime;
}

export function reserveParticleEmitter(target: ParticleEmitter, capacity: number): void {
  if (getParticleEmitterCapacity(target) >= capacity) return;
  const data = target.data;
  data.alphas = reserveFloat32Array(data.alphas, capacity);
  data.colors = reserveFloat32Array(data.colors, capacity * 3);
  data.ids = reserveUint16Array(data.ids, capacity);
  data.transforms = reserveFloat32Array(data.transforms, capacity * PARTICLE_TRANSFORM_STRIDE);
  data.velocities = reserveFloat32Array(data.velocities, capacity * 2);
}

export function setParticleEmitterLocalBoundsRectangle(target: ParticleEmitter, rect: Readonly<Rectangle>): void {
  const runtime = getDisplayObjectRuntime(target) as ParticleEmitterRuntime;
  if (runtime.localBoundsRectangle === null) runtime.localBoundsRectangle = createRectangle();
  copyRectangle(runtime.localBoundsRectangle, rect);
  invalidateNodeLocalBounds(target);
}

const defaultMethods: Partial<MethodsOf<ParticleEmitterRuntime>> = {
  computeLocalBoundsRectangle: copyLocalBoundsRectangle,
};
