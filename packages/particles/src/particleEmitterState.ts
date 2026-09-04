import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reserveFloat32Array } from '@flighthq/geometry/contract';
import type { ParticleEmitterState, RandomSource } from '@flighthq/types/contract';

// Velocity stride: [vx, vy, vz] per particle.
export const PARTICLE_VELOCITY_STRIDE = 3;

export function createParticleEmitterState(random: RandomSource = Math.random): ParticleEmitterState {
  const out = allocateEntity<ParticleEmitterState>();
  out.burstTimer = 0;
  out.colorBirth = new Float32Array();
  out.colorDeath = new Float32Array();
  out.emitterAge = 0;
  out.lifetimes = new Float32Array();
  out.prevX = NaN;
  out.prevY = NaN;
  out.prevZ = NaN;
  out.random = random;
  out.rotationSpeeds = new Float32Array();
  out.scales = new Float32Array();
  out.spawnAccumulator = 0;
  out.velocities = new Float32Array();
  return finishEntity(out);
}

/** Grow the per-particle state arrays to hold at least `capacity` particles.
 *  No-op when already large enough. `colorBirth`/`colorDeath` are only grown when
 *  the emitter uses color variance (they stay empty otherwise). */
export function ensureParticleEmitterStateCapacity(
  state: ParticleEmitterState,
  capacity: number,
  hasColorVariance: boolean,
): void {
  if (state.lifetimes.length >= capacity * 2) {
    if (hasColorVariance && state.colorBirth.length < capacity * 3) {
      state.colorBirth = reserveFloat32Array(state.colorBirth, capacity * 3);
      state.colorDeath = reserveFloat32Array(state.colorDeath, capacity * 3);
    }
    return;
  }
  state.lifetimes = reserveFloat32Array(state.lifetimes, capacity * 2);
  state.velocities = reserveFloat32Array(state.velocities, capacity * PARTICLE_VELOCITY_STRIDE);
  state.scales = reserveFloat32Array(state.scales, capacity);
  state.rotationSpeeds = reserveFloat32Array(state.rotationSpeeds, capacity);
  if (hasColorVariance) {
    state.colorBirth = reserveFloat32Array(state.colorBirth, capacity * 3);
    state.colorDeath = reserveFloat32Array(state.colorDeath, capacity * 3);
  }
}
