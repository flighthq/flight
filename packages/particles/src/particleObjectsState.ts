import { reserveFloat32Array } from '@flighthq/geometry';

import type { RandomSource } from './random';

export interface ParticleObjectsState {
  burstTimer: number;
  // Seconds the emitter has been emitting; only advanced for finite, non-looping
  // emitters (config.duration > 0 && !config.loop) to drive auto-stop/completion.
  emitterAge: number;
  lifetimes: Float32Array; // [age, maxAge] per slot — maxAge=0 means dead
  prevX: number; // emitter x from previous frame; NaN = uninitialised
  prevY: number;
  // Source of randomness for spawning. Defaults to Math.random; pass a seeded
  // generator (see createSeededRandom) for deterministic simulation.
  random: RandomSource;
  rotationSpeeds: Float32Array; // rad/s per slot
  scales: Float32Array; // spawn scale per slot
  spawnAccumulator: number;
  velocities: Float32Array; // [vx, vy] per slot
}

export function createParticleObjectsState(capacity: number, random: RandomSource = Math.random): ParticleObjectsState {
  return {
    burstTimer: 0,
    emitterAge: 0,
    lifetimes: new Float32Array(capacity * 2),
    prevX: NaN,
    prevY: NaN,
    random,
    rotationSpeeds: new Float32Array(capacity),
    scales: new Float32Array(capacity),
    spawnAccumulator: 0,
    velocities: new Float32Array(capacity * 2),
  };
}

export function ensureParticleObjectsStateCapacity(state: ParticleObjectsState, capacity: number): void {
  if (state.lifetimes.length >= capacity * 2) return;
  state.lifetimes = reserveFloat32Array(state.lifetimes, capacity * 2);
  state.velocities = reserveFloat32Array(state.velocities, capacity * 2);
  state.scales = reserveFloat32Array(state.scales, capacity);
  state.rotationSpeeds = reserveFloat32Array(state.rotationSpeeds, capacity);
}
