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
