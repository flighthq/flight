import { reserveFloat32Array } from '@flighthq/geometry';

export interface ParticleObjectsState {
  lifetimes: Float32Array; // [age, maxAge] per slot — maxAge=0 means dead
  spawnAccumulator: number;
  velocities: Float32Array; // [vx, vy] per slot
}

export function createParticleObjectsState(capacity: number): ParticleObjectsState {
  return {
    lifetimes: new Float32Array(capacity * 2),
    spawnAccumulator: 0,
    velocities: new Float32Array(capacity * 2),
  };
}

export function ensureParticleObjectsStateCapacity(state: ParticleObjectsState, capacity: number): void {
  if (state.lifetimes.length >= capacity * 2) return;
  state.lifetimes = reserveFloat32Array(state.lifetimes, capacity * 2);
  state.velocities = reserveFloat32Array(state.velocities, capacity * 2);
}
