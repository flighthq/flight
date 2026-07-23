import type {
  ForceFalloff,
  ParticleEmitter2D,
  ParticleEmitterState,
  ParticleForce,
  ParticleObject,
  ParticleObjectsState,
} from '@flighthq/types';

import { PARTICLE_VELOCITY_STRIDE } from './particleEmitterState';

// Per-particle acceleration scratch, reused across the loop to avoid allocation.
const accel: [number, number, number] = [0, 0, 0];

/** Apply force fields to a typed-array particle emitter, integrating the
 *  resulting acceleration into per-particle velocity. Call this BEFORE
 *  updateParticleEmitter2D each frame so the velocity change is integrated into
 *  position the same frame.
 *
 *  This is a fully opt-in pass: import it only for emitters that need forces.
 *  The core update path is unaware of it. */
export function applyParticleForces(
  emitter: ParticleEmitter2D,
  state: ParticleEmitterState,
  forces: ReadonlyArray<ParticleForce>,
  deltaTime: number,
): void {
  if (deltaTime <= 0 || forces.length === 0) return;
  const data = emitter.data;
  const count = data.particleCount;
  const transforms = data.transforms;
  const positionsZ = data.positionsZ;
  const velocities = state.velocities;

  for (let i = 0; i < count; i++) {
    const tt = i * 4;
    const vt = i * PARTICLE_VELOCITY_STRIDE;
    accel[0] = 0;
    accel[1] = 0;
    accel[2] = 0;
    const pz = positionsZ.length > i ? positionsZ[i] : 0;
    accumulateForces(
      forces,
      transforms[tt],
      transforms[tt + 1],
      pz,
      velocities[vt],
      velocities[vt + 1],
      velocities[vt + 2],
      accel,
    );
    velocities[vt] += accel[0] * deltaTime;
    velocities[vt + 1] += accel[1] * deltaTime;
    velocities[vt + 2] += accel[2] * deltaTime;
  }
}

/** Force-field pass for the object-pool path. Call BEFORE updateParticleObjects. */
export function applyParticleObjectForces(
  objects: readonly ParticleObject[],
  state: ParticleObjectsState,
  forces: ReadonlyArray<ParticleForce>,
  deltaTime: number,
): void {
  if (deltaTime <= 0 || forces.length === 0) return;
  const velocities = state.velocities;
  const lifetimes = state.lifetimes;
  for (let i = 0; i < objects.length; i++) {
    if (lifetimes[i * 2 + 1] <= 0) continue; // dead slot
    const vt = i * 2;
    accel[0] = 0;
    accel[1] = 0;
    accel[2] = 0;
    accumulateForces(forces, objects[i].x, objects[i].y, 0, velocities[vt], velocities[vt + 1], 0, accel);
    velocities[vt] += accel[0] * deltaTime;
    velocities[vt + 1] += accel[1] * deltaTime;
  }
}

function accumulateForces(
  forces: ReadonlyArray<ParticleForce>,
  px: number,
  py: number,
  pz: number,
  vx: number,
  vy: number,
  vz: number,
  out: [number, number, number],
): void {
  for (let f = 0; f < forces.length; f++) {
    const force = forces[f];
    switch (force.kind) {
      case 'WindForce':
        out[0] += force.x;
        out[1] += force.y;
        out[2] += force.z ?? 0;
        break;
      case 'DragForce':
        out[0] -= force.strength * vx;
        out[1] -= force.strength * vy;
        out[2] -= force.strength * vz;
        break;
      case 'AttractorForce': {
        const fz = force.z ?? 0;
        const dx = force.x - px;
        const dy = force.y - py;
        const dz = fz - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= 1e-6) break;
        const mag = force.strength * falloffFactor(force.falloff, dist, force.radius);
        if (mag === 0) break;
        out[0] += (dx / dist) * mag;
        out[1] += (dy / dist) * mag;
        out[2] += (dz / dist) * mag;
        break;
      }
      case 'VortexForce': {
        const fz = force.z ?? 0;
        const dx = px - force.x;
        const dy = py - force.y;
        const dz = pz - fz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= 1e-6) break;
        const mag = force.strength * falloffFactor(force.falloff, dist, force.radius);
        if (mag === 0) break;
        // Vortex axis (defaults to [0, 0, 1] for 2D-compatible rotation in the XY plane).
        const ax = force.axisX ?? 0;
        const ay = force.axisY ?? 0;
        const az = force.axisZ ?? 1;
        // Tangent = axis cross radial direction, scaled by mag / dist.
        const invDist = 1 / dist;
        const rx = dx * invDist;
        const ry = dy * invDist;
        const rz = dz * invDist;
        out[0] += (ay * rz - az * ry) * mag;
        out[1] += (az * rx - ax * rz) * mag;
        out[2] += (ax * ry - ay * rx) * mag;
        break;
      }
      case 'TurbulenceForce': {
        const s = force.scale;
        out[0] += (valueNoise(px * s, py * s, 0) * 2 - 1) * force.strength;
        out[1] += (valueNoise(px * s, py * s, 1) * 2 - 1) * force.strength;
        out[2] += (valueNoise(px * s, pz * s, 2) * 2 - 1) * force.strength;
        break;
      }
    }
  }
}

function falloffFactor(falloff: ForceFalloff | undefined, dist: number, radius: number | undefined): number {
  if (radius != null && radius > 0 && dist > radius) return 0; // hard cutoff
  switch (falloff) {
    case 'linear':
      return radius != null && radius > 0 ? Math.max(0, 1 - dist / radius) : 1;
    case 'inverseSquare': {
      const d = dist < 1 ? 1 : dist; // clamp near the source to avoid a singularity
      return 1 / (d * d);
    }
    default:
      return 1;
  }
}

// Cheap deterministic 2-D value noise in [0, 1): hash the integer lattice and
// smoothstep-interpolate. Good enough for VFX turbulence, and fully reproducible.
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed + 1, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
