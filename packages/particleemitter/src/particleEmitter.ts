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
  ParticleEmitter2D,
  ParticleEmitterData,
  ParticleEmitter2DRuntime,
  Rectangle,
  Vector2Like,
} from '@flighthq/types';
import { ParticleEmitter2DKind } from '@flighthq/types';

// Internal stride constants. Hidden from callers so no raw array index math leaks out.
const PARTICLE_TRANSFORM_STRIDE = 4; // [x, y, rotation, scale] per particle
const PARTICLE_COLOR_STRIDE = 3; // [r, g, b] per particle
const PARTICLE_VELOCITY_STRIDE = 2; // [vx, vy] per particle

// Uint16Array sentinel marking a logically deleted slot in a particle emitter.
export const PARTICLE_EMITTER_DELETED_ID = 0xffff;

function copyLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const runtime = getDisplayObjectRuntime(source as DisplayObject) as ParticleEmitter2DRuntime;
  if (runtime.localBoundsRectangle !== null) copyRectangle(out, runtime.localBoundsRectangle);
}

/**
 * Appends a new particle at the end of `target`, auto-growing capacity via `reserveParticleEmitter2D`.
 * Returns the new particle index. Color defaults to white (1, 1, 1) and alpha to 1.0 unless
 * overridden with `setParticleEmitter2DParticleColor` / `setParticleEmitter2DParticleAlpha`.
 */
export function appendParticleEmitter2DParticle(
  target: ParticleEmitter2D,
  id: number,
  x: number,
  y: number,
  rotation: number,
  scale: number,
): number {
  const index = target.data.particleCount;
  const needed = index + 1;
  if (getParticleEmitter2DCapacity(target) < needed) {
    const newCapacity = Math.max(needed, target.data.particleCount * 2 || 8);
    reserveParticleEmitter2D(target, newCapacity);
  }
  target.data.particleCount = needed;
  target.data.ids[index] = id;
  const tt = index * PARTICLE_TRANSFORM_STRIDE;
  target.data.transforms[tt] = x;
  target.data.transforms[tt + 1] = y;
  target.data.transforms[tt + 2] = rotation;
  target.data.transforms[tt + 3] = scale;
  target.data.alphas[index] = 1;
  const ct = index * PARTICLE_COLOR_STRIDE;
  target.data.colors[ct] = 1;
  target.data.colors[ct + 1] = 1;
  target.data.colors[ct + 2] = 1;
  const vt = index * PARTICLE_VELOCITY_STRIDE;
  target.data.velocities[vt] = 0;
  target.data.velocities[vt + 1] = 0;
  target.data.positionsZ[index] = 0;
  return index;
}

/** Sets `target.data.particleCount = 0`, keeping allocated capacity. */
export function clearParticleEmitter2D(target: ParticleEmitter2D): void {
  target.data.particleCount = 0;
}

/**
 * Deep-copies `source` into a new `ParticleEmitter2D` with independent typed arrays and a fresh runtime.
 * The new emitter has the same `particleCount`, `atlas`, and `worldSpace` flag, but its
 * `transforms`, `alphas`, `colors`, `ids`, and `velocities` are cloned typed arrays.
 */
export function cloneParticleEmitter2D(source: Readonly<ParticleEmitter2D>): ParticleEmitter2D {
  const src = source.data;
  return createParticleEmitter2D({
    data: {
      alphas: src.alphas.slice(),
      atlas: src.atlas,
      colors: src.colors.slice(),
      ids: src.ids.slice(),
      particleCount: src.particleCount,
      positionsZ: src.positionsZ.slice(),
      transforms: src.transforms.slice(),
      velocities: src.velocities.slice(),
      worldSpace: src.worldSpace,
    },
  });
}

/**
 * Compacts the particle buffer by removing entries whose id equals `0xffff` (the Uint16Array
 * sentinel for logically deleted slots). Preserves the relative order of remaining entries.
 * After compaction, `particleCount` equals the number of non-sentinel entries.
 *
 * Use after a series of swap-removes with manual id-zeroing when stable iteration order is needed.
 * For simple swap-remove workflows, compaction is not required.
 */
export function compactParticleEmitter2D(target: ParticleEmitter2D): void {
  const data = target.data;
  if (data.particleCount === 0) return;
  let write = 0;
  for (let read = 0; read < data.particleCount; read++) {
    if (data.ids[read] === PARTICLE_EMITTER_DELETED_ID) continue;
    if (write !== read) {
      data.ids[write] = data.ids[read];
      const tt = write * PARTICLE_TRANSFORM_STRIDE;
      const tts = read * PARTICLE_TRANSFORM_STRIDE;
      data.transforms[tt] = data.transforms[tts];
      data.transforms[tt + 1] = data.transforms[tts + 1];
      data.transforms[tt + 2] = data.transforms[tts + 2];
      data.transforms[tt + 3] = data.transforms[tts + 3];
      data.alphas[write] = data.alphas[read];
      const ct = write * PARTICLE_COLOR_STRIDE;
      const cts = read * PARTICLE_COLOR_STRIDE;
      data.colors[ct] = data.colors[cts];
      data.colors[ct + 1] = data.colors[cts + 1];
      data.colors[ct + 2] = data.colors[cts + 2];
      const vt = write * PARTICLE_VELOCITY_STRIDE;
      const vts = read * PARTICLE_VELOCITY_STRIDE;
      data.velocities[vt] = data.velocities[vts];
      data.velocities[vt + 1] = data.velocities[vts + 1];
      data.positionsZ[write] = data.positionsZ[read];
    }
    write++;
  }
  data.particleCount = write;
}

export function computeParticleEmitter2DLocalBoundsRectangle(
  out: Rectangle,
  source: Readonly<ParticleEmitter2D>,
): void {
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

export function createParticleEmitter2D(obj?: Readonly<PartialNode<ParticleEmitter2D>>): ParticleEmitter2D {
  return createDisplayObjectGeneric(
    ParticleEmitter2DKind,
    obj,
    createParticleEmitterData,
    createParticleEmitter2DRuntime,
  ) as ParticleEmitter2D;
}

export function createParticleEmitter2DRuntime(): ParticleEmitter2DRuntime {
  const runtime = createDisplayObjectRuntime(defaultMethods) as ParticleEmitter2DRuntime;
  runtime.localBoundsRectangle = null;
  return runtime;
}

export function createParticleEmitterData(data?: Readonly<Partial<ParticleEmitterData>>): ParticleEmitterData {
  return {
    alphas: data?.alphas ?? new Float32Array(),
    atlas: data?.atlas ?? null,
    colors: data?.colors ?? new Float32Array(),
    ids: data?.ids ?? new Uint16Array(),
    particleCount: data?.particleCount ?? 0,
    positionsZ: data?.positionsZ ?? new Float32Array(),
    transforms: data?.transforms ?? new Float32Array(),
    velocities: data?.velocities ?? new Float32Array(),
    worldSpace: data?.worldSpace ?? false,
  };
}

export function getParticleEmitter2DCapacity(source: Readonly<ParticleEmitter2D>): number {
  const data = source.data;
  const transformCapacity = (data.transforms.length / PARTICLE_TRANSFORM_STRIDE) | 0;
  return Math.min(data.ids.length, data.alphas.length, transformCapacity);
}

/**
 * Returns the alpha of particle `index`, or -1 when `index` is out of range.
 * Bounds-checked against `particleCount`.
 */
export function getParticleEmitter2DParticleAlpha(source: Readonly<ParticleEmitter2D>, index: number): number {
  if (index < 0 || index >= source.data.particleCount) return -1;
  return source.data.alphas[index];
}

/**
 * Returns the region id of particle `index`, or -1 when `index` is out of range.
 * Bounds-checked against `particleCount`.
 */
export function getParticleEmitter2DParticleId(source: Readonly<ParticleEmitter2D>, index: number): number {
  if (index < 0 || index >= source.data.particleCount) return -1;
  return source.data.ids[index];
}

/**
 * Writes the velocity (vx, vy) of particle `index` into `out.x` and `out.y`.
 * Returns false and writes nothing when `index` is out of range.
 */
export function getParticleEmitter2DParticleVelocity(
  out: Vector2Like,
  source: Readonly<ParticleEmitter2D>,
  index: number,
): boolean {
  if (index < 0 || index >= source.data.particleCount) return false;
  const vt = index * PARTICLE_VELOCITY_STRIDE;
  out.x = source.data.velocities[vt];
  out.y = source.data.velocities[vt + 1];
  return true;
}

export function getParticleEmitter2DRuntime(source: Readonly<ParticleEmitter2D>): Readonly<ParticleEmitter2DRuntime> {
  return getDisplayObjectRuntime(source) as ParticleEmitter2DRuntime;
}

/**
 * Swap-removes particle `index` with the last particle (O(1)), decrementing `particleCount`.
 * Does not preserve order — the particle that was at `particleCount-1` moves to `index`.
 * No-ops when `index` is out of range.
 */
export function removeParticleEmitter2DParticle(target: ParticleEmitter2D, index: number): void {
  const data = target.data;
  const last = data.particleCount - 1;
  if (index < 0 || index > last) return;
  if (index < last) {
    // Swap all buffers: id, transform, alpha, color, velocity
    data.ids[index] = data.ids[last];
    const tt = index * PARTICLE_TRANSFORM_STRIDE;
    const tts = last * PARTICLE_TRANSFORM_STRIDE;
    data.transforms[tt] = data.transforms[tts];
    data.transforms[tt + 1] = data.transforms[tts + 1];
    data.transforms[tt + 2] = data.transforms[tts + 2];
    data.transforms[tt + 3] = data.transforms[tts + 3];
    data.alphas[index] = data.alphas[last];
    const ct = index * PARTICLE_COLOR_STRIDE;
    const cts = last * PARTICLE_COLOR_STRIDE;
    data.colors[ct] = data.colors[cts];
    data.colors[ct + 1] = data.colors[cts + 1];
    data.colors[ct + 2] = data.colors[cts + 2];
    const vt = index * PARTICLE_VELOCITY_STRIDE;
    const vts = last * PARTICLE_VELOCITY_STRIDE;
    data.velocities[vt] = data.velocities[vts];
    data.velocities[vt + 1] = data.velocities[vts + 1];
    data.positionsZ[index] = data.positionsZ[last];
  }
  data.particleCount = last;
}

export function reserveParticleEmitter2D(target: ParticleEmitter2D, capacity: number): void {
  if (getParticleEmitter2DCapacity(target) >= capacity) return;
  const data = target.data;
  data.alphas = reserveFloat32Array(data.alphas, capacity);
  data.colors = reserveFloat32Array(data.colors, capacity * 3);
  data.ids = reserveUint16Array(data.ids, capacity);
  data.positionsZ = reserveFloat32Array(data.positionsZ, capacity);
  data.transforms = reserveFloat32Array(data.transforms, capacity * PARTICLE_TRANSFORM_STRIDE);
  data.velocities = reserveFloat32Array(data.velocities, capacity * 2);
}

export function setParticleEmitter2DLocalBoundsRectangle(target: ParticleEmitter2D, rect: Readonly<Rectangle>): void {
  const runtime = getDisplayObjectRuntime(target) as ParticleEmitter2DRuntime;
  if (runtime.localBoundsRectangle === null) runtime.localBoundsRectangle = createRectangle();
  copyRectangle(runtime.localBoundsRectangle, rect);
  invalidateNodeLocalBounds(target);
}

/**
 * Sets the full transform and id for particle `index`.
 * No-ops when `index` is out of range (`[0, particleCount)`).
 */
export function setParticleEmitter2DParticle(
  target: ParticleEmitter2D,
  index: number,
  id: number,
  x: number,
  y: number,
  rotation: number,
  scale: number,
): void {
  const data = target.data;
  if (index < 0 || index >= data.particleCount) return;
  data.ids[index] = id;
  const tt = index * PARTICLE_TRANSFORM_STRIDE;
  data.transforms[tt] = x;
  data.transforms[tt + 1] = y;
  data.transforms[tt + 2] = rotation;
  data.transforms[tt + 3] = scale;
}

/**
 * Sets the alpha of particle `index`. No-ops when `index` is out of range.
 */
export function setParticleEmitter2DParticleAlpha(target: ParticleEmitter2D, index: number, alpha: number): void {
  if (index < 0 || index >= target.data.particleCount) return;
  target.data.alphas[index] = alpha;
}

/**
 * Sets the color (r, g, b, 0–1 normalized) of particle `index`. No-ops when `index` is out of range.
 */
export function setParticleEmitter2DParticleColor(
  target: ParticleEmitter2D,
  index: number,
  r: number,
  g: number,
  b: number,
): void {
  if (index < 0 || index >= target.data.particleCount) return;
  const ct = index * PARTICLE_COLOR_STRIDE;
  target.data.colors[ct] = r;
  target.data.colors[ct + 1] = g;
  target.data.colors[ct + 2] = b;
}

/**
 * Sets the velocity (vx, vy) of particle `index`. No-ops when `index` is out of range.
 */
export function setParticleEmitter2DParticleVelocity(
  target: ParticleEmitter2D,
  index: number,
  vx: number,
  vy: number,
): void {
  if (index < 0 || index >= target.data.particleCount) return;
  const vt = index * PARTICLE_VELOCITY_STRIDE;
  target.data.velocities[vt] = vx;
  target.data.velocities[vt + 1] = vy;
}

const defaultMethods: Partial<MethodsOf<ParticleEmitter2DRuntime>> = {
  computeLocalBoundsRectangle: copyLocalBoundsRectangle,
};
