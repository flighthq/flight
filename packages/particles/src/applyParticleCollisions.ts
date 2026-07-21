import type {
  CircleCollider,
  ParticleCollider,
  ParticleEmitter2D,
  ParticleEmitterState,
  ParticleObject,
  ParticleObjectsState,
  PlaneCollider,
  RectangleCollider,
  SphereCollider,
} from '@flighthq/types';

import { PARTICLE_VELOCITY_STRIDE } from './particleEmitterState';

export type { CircleCollider, ParticleCollider, PlaneCollider, RectangleCollider, SphereCollider };

// [px, py, pz, vx, vy, vz] scratch reused across particles to avoid per-iteration allocation.
const s: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

/** Resolve particle/collider collisions for a typed-array emitter, correcting
 *  position and velocity in place. Call this AFTER updateParticleEmitter2D so it
 *  fixes up penetration produced by the frame's integration.
 *
 *  Fully opt-in: import it only for emitters that collide. The core update path
 *  is unaware of it. */
export function applyParticleCollisions(
  emitter: ParticleEmitter2D,
  state: ParticleEmitterState,
  colliders: ReadonlyArray<ParticleCollider>,
): void {
  if (colliders.length === 0) return;
  const data = emitter.data;
  const count = data.particleCount;
  const transforms = data.transforms;
  const positionsZ = data.positionsZ;
  const velocities = state.velocities;
  for (let i = 0; i < count; i++) {
    const tt = i * 4;
    const vt = i * PARTICLE_VELOCITY_STRIDE;
    s[0] = transforms[tt];
    s[1] = transforms[tt + 1];
    s[2] = positionsZ.length > i ? positionsZ[i] : 0;
    s[3] = velocities[vt];
    s[4] = velocities[vt + 1];
    s[5] = velocities[vt + 2];
    if (resolveColliders(colliders, s)) {
      transforms[tt] = s[0];
      transforms[tt + 1] = s[1];
      if (positionsZ.length > i) positionsZ[i] = s[2];
      velocities[vt] = s[3];
      velocities[vt + 1] = s[4];
      velocities[vt + 2] = s[5];
    }
  }
}

/** Collision pass for the object-pool path. Call AFTER updateParticleObjects. */
export function applyParticleObjectCollisions(
  objects: readonly ParticleObject[],
  state: ParticleObjectsState,
  colliders: ReadonlyArray<ParticleCollider>,
): void {
  if (colliders.length === 0) return;
  const velocities = state.velocities;
  const lifetimes = state.lifetimes;
  for (let i = 0; i < objects.length; i++) {
    if (lifetimes[i * 2 + 1] <= 0) continue; // dead slot
    const vt = i * 2;
    s[0] = objects[i].x;
    s[1] = objects[i].y;
    s[2] = 0;
    s[3] = velocities[vt];
    s[4] = velocities[vt + 1];
    s[5] = 0;
    if (resolveColliders(colliders, s)) {
      objects[i].x = s[0];
      objects[i].y = s[1];
      velocities[vt] = s[3];
      velocities[vt + 1] = s[4];
    }
  }
}

function resolveColliders(
  colliders: ReadonlyArray<ParticleCollider>,
  p: [number, number, number, number, number, number],
): boolean {
  let hit = false;
  for (let c = 0; c < colliders.length; c++) {
    const collider = colliders[c];
    switch (collider.kind) {
      case 'PlaneCollider':
        hit = resolvePlane(collider, p) || hit;
        break;
      case 'CircleCollider':
        hit = resolveCircle(collider, p) || hit;
        break;
      case 'RectangleCollider':
        hit = resolveRect(collider, p) || hit;
        break;
      case 'SphereCollider':
        hit = resolveSphere(collider, p) || hit;
        break;
    }
  }
  return hit;
}

function resolvePlane(c: PlaneCollider, p: [number, number, number, number, number, number]): boolean {
  const nz = c.nz ?? 0;
  const depth = c.nx * p[0] + c.ny * p[1] + nz * p[2] - c.distance;
  if (depth >= 0) return false;
  p[0] -= c.nx * depth; // push back onto the surface
  p[1] -= c.ny * depth;
  p[2] -= nz * depth;
  reflect3(p, c.nx, c.ny, nz, c.restitution ?? 0, c.friction ?? 0);
  return true;
}

function resolveCircle(c: CircleCollider, p: [number, number, number, number, number, number]): boolean {
  const dx = p[0] - c.x;
  const dy = p[1] - c.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (c.mode === 'exclude') {
    if (dist >= c.radius || dist <= 1e-6) return false;
    const nx = dx / dist;
    const ny = dy / dist;
    p[0] = c.x + nx * c.radius;
    p[1] = c.y + ny * c.radius;
    reflect3(p, nx, ny, 0, c.restitution ?? 0, c.friction ?? 0);
    return true;
  }
  // contain
  if (dist <= c.radius) return false;
  const nx = dist <= 1e-6 ? 0 : -dx / dist; // inward normal
  const ny = dist <= 1e-6 ? -1 : -dy / dist;
  p[0] = c.x - nx * c.radius;
  p[1] = c.y - ny * c.radius;
  reflect3(p, nx, ny, 0, c.restitution ?? 0, c.friction ?? 0);
  return true;
}

function resolveRect(c: RectangleCollider, p: [number, number, number, number, number, number]): boolean {
  const hw = c.width / 2;
  const hh = c.height / 2;
  const minX = c.x - hw;
  const maxX = c.x + hw;
  const minY = c.y - hh;
  const maxY = c.y + hh;
  const restitution = c.restitution ?? 0;
  const friction = c.friction ?? 0;

  if (c.mode === 'contain') {
    let hit = false;
    if (p[0] < minX) {
      p[0] = minX;
      reflect3(p, 1, 0, 0, restitution, friction);
      hit = true;
    } else if (p[0] > maxX) {
      p[0] = maxX;
      reflect3(p, -1, 0, 0, restitution, friction);
      hit = true;
    }
    if (p[1] < minY) {
      p[1] = minY;
      reflect3(p, 0, 1, 0, restitution, friction);
      hit = true;
    } else if (p[1] > maxY) {
      p[1] = maxY;
      reflect3(p, 0, -1, 0, restitution, friction);
      hit = true;
    }
    return hit;
  }

  // exclude: only if the point is inside the box, push out along the shallowest axis.
  if (p[0] <= minX || p[0] >= maxX || p[1] <= minY || p[1] >= maxY) return false;
  const left = p[0] - minX;
  const right = maxX - p[0];
  const top = p[1] - minY;
  const bottom = maxY - p[1];
  const minPen = Math.min(left, right, top, bottom);
  if (minPen === left) {
    p[0] = minX;
    reflect3(p, -1, 0, 0, restitution, friction);
  } else if (minPen === right) {
    p[0] = maxX;
    reflect3(p, 1, 0, 0, restitution, friction);
  } else if (minPen === top) {
    p[1] = minY;
    reflect3(p, 0, -1, 0, restitution, friction);
  } else {
    p[1] = maxY;
    reflect3(p, 0, 1, 0, restitution, friction);
  }
  return true;
}

function resolveSphere(c: SphereCollider, p: [number, number, number, number, number, number]): boolean {
  const dx = p[0] - c.x;
  const dy = p[1] - c.y;
  const dz = p[2] - c.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (c.mode === 'exclude') {
    if (dist >= c.radius || dist <= 1e-6) return false;
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;
    p[0] = c.x + nx * c.radius;
    p[1] = c.y + ny * c.radius;
    p[2] = c.z + nz * c.radius;
    reflect3(p, nx, ny, nz, c.restitution ?? 0, c.friction ?? 0);
    return true;
  }
  // contain
  if (dist <= c.radius) return false;
  const nx = dist <= 1e-6 ? 0 : -dx / dist;
  const ny = dist <= 1e-6 ? 0 : -dy / dist;
  const nz = dist <= 1e-6 ? -1 : -dz / dist;
  p[0] = c.x - nx * c.radius;
  p[1] = c.y - ny * c.radius;
  p[2] = c.z - nz * c.radius;
  reflect3(p, nx, ny, nz, c.restitution ?? 0, c.friction ?? 0);
  return true;
}

// Reflect the velocity in p[3],p[4],p[5] about a surface with unit normal (nx, ny, nz):
// bounce the inward normal component by `restitution` and damp the tangential
// component by `friction`. Only acts when the particle is moving into the surface.
function reflect3(
  p: [number, number, number, number, number, number],
  nx: number,
  ny: number,
  nz: number,
  restitution: number,
  friction: number,
): void {
  const vn = p[3] * nx + p[4] * ny + p[5] * nz;
  if (vn >= 0) return; // already separating
  const tvx = p[3] - vn * nx;
  const tvy = p[4] - vn * ny;
  const tvz = p[5] - vn * nz;
  p[3] = tvx * (1 - friction) - restitution * vn * nx;
  p[4] = tvy * (1 - friction) - restitution * vn * ny;
  p[5] = tvz * (1 - friction) - restitution * vn * nz;
}
