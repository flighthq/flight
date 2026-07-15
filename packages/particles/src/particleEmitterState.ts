import { reserveFloat32Array } from '@flighthq/geometry';
import type { ParticleEmitterState, RandomSource } from '@flighthq/types';

// Velocity stride: [vx, vy, vz] per particle.
export const PARTICLE_VELOCITY_STRIDE = 3;

export function createParticleEmitterState(random: RandomSource = Math.random): ParticleEmitterState {
  return {
    burstTimer: 0,
    colorBirth: new Float32Array(),
    colorDeath: new Float32Array(),
    emitterAge: 0,
    lifetimes: new Float32Array(),
    prevX: NaN,
    prevY: NaN,
    prevZ: NaN,
    random,
    rotationSpeeds: new Float32Array(),
    scales: new Float32Array(),
    spawnAccumulator: 0,
    velocities: new Float32Array(),
  };
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
