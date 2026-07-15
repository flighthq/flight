import type { RandomSource } from './RandomSource';

export interface ParticleEmitterState {
  burstTimer: number;
  colorBirth: Float32Array;
  colorDeath: Float32Array;
  emitterAge: number;
  lifetimes: Float32Array;
  prevX: number;
  prevY: number;
  prevZ: number;
  random: RandomSource;
  rotationSpeeds: Float32Array;
  scales: Float32Array;
  spawnAccumulator: number;
  velocities: Float32Array;
}
