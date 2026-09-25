import type { Entity } from './Entity.ts';
import type { RandomSource } from './RandomSource.ts';

export interface ParticleObjectsState extends Entity {
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
