import type { RandomSource } from './RandomSource';

export interface ParticleObjectsState {
  burstTimer: number;
  emitterAge: number;
  lifetimes: Float32Array;
  prevX: number;
  prevY: number;
  random: RandomSource;
  rotationSpeeds: Float32Array;
  scales: Float32Array;
  spawnAccumulator: number;
  velocities: Float32Array;
}
