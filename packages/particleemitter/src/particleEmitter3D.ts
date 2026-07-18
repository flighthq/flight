import { reserveFloat32Array, reserveUint16Array } from '@flighthq/geometry';
import { createSceneNode, getSceneNodeRuntime } from '@flighthq/scene';
import type {
  ParticleEmitter3D,
  ParticleEmitter3DRuntime,
  ParticleEmitterData,
  PartialNode,
  SceneNode,
  Vector3Like,
} from '@flighthq/types';
import { ParticleEmitter3DKind } from '@flighthq/types';

import { createParticleEmitterData } from './particleEmitter';

const PARTICLE_TRANSFORM_STRIDE = 4;
const PARTICLE_COLOR_STRIDE = 3;
// 3D particle velocities are (vx, vy, vz) — matching @flighthq/particles PARTICLE_VELOCITY_STRIDE. The Z
// lane must be carried by every entity op below or manual add/remove/compact silently drops it.
const PARTICLE_VELOCITY_STRIDE = 3;

export const PARTICLE_EMITTER_3D_DELETED_ID = 0xffff;

export function appendParticleEmitter3DParticle(
  target: ParticleEmitter3D,
  id: number,
  x: number,
  y: number,
  z: number,
  rotation: number,
  scale: number,
): number {
  const index = target.data.particleCount;
  const needed = index + 1;
  if (getParticleEmitter3DCapacity(target) < needed) {
    const newCapacity = Math.max(needed, target.data.particleCount * 2 || 8);
    reserveParticleEmitter3D(target, newCapacity);
  }
  target.data.particleCount = needed;
  target.data.ids[index] = id;
  const tt = index * PARTICLE_TRANSFORM_STRIDE;
  target.data.transforms[tt] = x;
  target.data.transforms[tt + 1] = y;
  target.data.transforms[tt + 2] = rotation;
  target.data.transforms[tt + 3] = scale;
  target.data.positionsZ[index] = z;
  target.data.alphas[index] = 1;
  const ct = index * PARTICLE_COLOR_STRIDE;
  target.data.colors[ct] = 1;
  target.data.colors[ct + 1] = 1;
  target.data.colors[ct + 2] = 1;
  const vt = index * PARTICLE_VELOCITY_STRIDE;
  target.data.velocities[vt] = 0;
  target.data.velocities[vt + 1] = 0;
  target.data.velocities[vt + 2] = 0;
  return index;
}

export function clearParticleEmitter3D(target: ParticleEmitter3D): void {
  target.data.particleCount = 0;
}

export function compactParticleEmitter3D(target: ParticleEmitter3D): void {
  const data = target.data;
  if (data.particleCount === 0) return;
  let write = 0;
  for (let read = 0; read < data.particleCount; read++) {
    if (data.ids[read] === PARTICLE_EMITTER_3D_DELETED_ID) continue;
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
      data.velocities[vt + 2] = data.velocities[vts + 2];
      data.positionsZ[write] = data.positionsZ[read];
    }
    write++;
  }
  data.particleCount = write;
}

export function createParticleEmitter3D(obj?: Readonly<PartialNode<ParticleEmitter3D>>): ParticleEmitter3D {
  const node = createSceneNode(ParticleEmitter3DKind, obj) as unknown as ParticleEmitter3D;
  node.data = createParticleEmitterData(obj?.data as Readonly<Partial<ParticleEmitterData>> | undefined);
  node.blendMode = obj?.blendMode ?? 'normal';
  return node;
}

export function getParticleEmitter3DCapacity(source: Readonly<ParticleEmitter3D>): number {
  const data = source.data;
  const transformCapacity = (data.transforms.length / PARTICLE_TRANSFORM_STRIDE) | 0;
  return Math.min(data.ids.length, data.alphas.length, transformCapacity);
}

export function getParticleEmitter3DParticleAlpha(source: Readonly<ParticleEmitter3D>, index: number): number {
  if (index < 0 || index >= source.data.particleCount) return -1;
  return source.data.alphas[index];
}

export function getParticleEmitter3DParticleId(source: Readonly<ParticleEmitter3D>, index: number): number {
  if (index < 0 || index >= source.data.particleCount) return -1;
  return source.data.ids[index];
}

export function getParticleEmitter3DParticleVelocity(
  out: Vector3Like,
  source: Readonly<ParticleEmitter3D>,
  index: number,
): boolean {
  if (index < 0 || index >= source.data.particleCount) return false;
  const vt = index * PARTICLE_VELOCITY_STRIDE;
  out.x = source.data.velocities[vt];
  out.y = source.data.velocities[vt + 1];
  out.z = source.data.velocities[vt + 2];
  return true;
}

export function getParticleEmitter3DRuntime(source: Readonly<ParticleEmitter3D>): Readonly<ParticleEmitter3DRuntime> {
  return getSceneNodeRuntime(source as unknown as SceneNode) as ParticleEmitter3DRuntime;
}

export function isParticleEmitter3D(node: Readonly<{ kind: string }>): node is ParticleEmitter3D {
  return node.kind === ParticleEmitter3DKind;
}

export function removeParticleEmitter3DParticle(target: ParticleEmitter3D, index: number): void {
  const data = target.data;
  const last = data.particleCount - 1;
  if (index < 0 || index > last) return;
  if (index < last) {
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
    data.velocities[vt + 2] = data.velocities[vts + 2];
    data.positionsZ[index] = data.positionsZ[last];
  }
  data.particleCount = last;
}

export function reserveParticleEmitter3D(target: ParticleEmitter3D, capacity: number): void {
  if (getParticleEmitter3DCapacity(target) >= capacity) return;
  const data = target.data;
  data.alphas = reserveFloat32Array(data.alphas, capacity);
  data.colors = reserveFloat32Array(data.colors, capacity * PARTICLE_COLOR_STRIDE);
  data.ids = reserveUint16Array(data.ids, capacity);
  data.positionsZ = reserveFloat32Array(data.positionsZ, capacity);
  data.transforms = reserveFloat32Array(data.transforms, capacity * PARTICLE_TRANSFORM_STRIDE);
  data.velocities = reserveFloat32Array(data.velocities, capacity * PARTICLE_VELOCITY_STRIDE);
}

export function setParticleEmitter3DParticle(
  target: ParticleEmitter3D,
  index: number,
  id: number,
  x: number,
  y: number,
  z: number,
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
  data.positionsZ[index] = z;
}

export function setParticleEmitter3DParticleAlpha(target: ParticleEmitter3D, index: number, alpha: number): void {
  if (index < 0 || index >= target.data.particleCount) return;
  target.data.alphas[index] = alpha;
}

export function setParticleEmitter3DParticleColor(
  target: ParticleEmitter3D,
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

export function setParticleEmitter3DParticleVelocity(
  target: ParticleEmitter3D,
  index: number,
  vx: number,
  vy: number,
  vz: number,
): void {
  if (index < 0 || index >= target.data.particleCount) return;
  const vt = index * PARTICLE_VELOCITY_STRIDE;
  target.data.velocities[vt] = vx;
  target.data.velocities[vt + 1] = vy;
  target.data.velocities[vt + 2] = vz;
}
