import { reserveFloat32Array } from '@flighthq/geometry';
import type { ParticleObjectsState, RandomSource } from '@flighthq/types';

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
