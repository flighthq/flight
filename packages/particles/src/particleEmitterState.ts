import { reserveFloat32Array } from '@flighthq/geometry';

import type { RandomSource } from './random';

export interface ParticleEmitterState {
  burstTimer: number;
  // Per-particle randomised birth/death colors — only populated when colorVariance > 0
  colorBirth: Float32Array; // [r, g, b] × capacity
  colorDeath: Float32Array; // [r, g, b] × capacity
  // Seconds the emitter has been emitting; only advanced for finite, non-looping
  // emitters (config.duration > 0 && !config.loop) to drive auto-stop/completion.
  emitterAge: number;
  lifetimes: Float32Array; // [age, maxAge] × capacity
  prevX: number; // emitter x (or world tx) from previous frame; NaN = uninitialised
  prevY: number;
  // Source of randomness for spawning. Defaults to Math.random; pass a seeded
  // generator (see createSeededRandom) for deterministic simulation.
  random: RandomSource;
  rotationSpeeds: Float32Array; // rad/s × capacity
  scales: Float32Array; // spawn scale × capacity
  spawnAccumulator: number;
  velocities: Float32Array; // [vx, vy] × capacity
}

export function createParticleEmitterState(random: RandomSource = Math.random): ParticleEmitterState {
  return {
    burstTimer: 0,
    colorBirth: new Float32Array(),
    colorDeath: new Float32Array(),
    emitterAge: 0,
    lifetimes: new Float32Array(),
    prevX: NaN,
    prevY: NaN,
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
  state.velocities = reserveFloat32Array(state.velocities, capacity * 2);
  state.scales = reserveFloat32Array(state.scales, capacity);
  state.rotationSpeeds = reserveFloat32Array(state.rotationSpeeds, capacity);
  if (hasColorVariance) {
    state.colorBirth = reserveFloat32Array(state.colorBirth, capacity * 3);
    state.colorDeath = reserveFloat32Array(state.colorDeath, capacity * 3);
  }
}
