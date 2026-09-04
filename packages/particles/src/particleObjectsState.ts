import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reserveFloat32Array } from '@flighthq/geometry/contract';
import type { ParticleObjectsState, RandomSource, EntityConstruction } from '@flighthq/types/contract';

export function createParticleObjectsState(capacity: number, random: RandomSource = Math.random): ParticleObjectsState {
  const out = allocateEntity<ParticleObjectsState>();
  initializeParticleObjectsState(out, capacity, random);
  return finishEntity(out);
}

export function ensureParticleObjectsStateCapacity(state: ParticleObjectsState, capacity: number): void {
  if (state.lifetimes.length >= capacity * 2) return;
  state.lifetimes = reserveFloat32Array(state.lifetimes, capacity * 2);
  state.velocities = reserveFloat32Array(state.velocities, capacity * 2);
  state.scales = reserveFloat32Array(state.scales, capacity);
  state.rotationSpeeds = reserveFloat32Array(state.rotationSpeeds, capacity);
}

export function initializeParticleObjectsState(
  out: EntityConstruction<ParticleObjectsState>,
  capacity: number,
  random: RandomSource = Math.random,
): void {
  out.burstTimer = 0;
  out.emitterAge = 0;
  out.lifetimes = new Float32Array(capacity * 2);
  out.prevX = NaN;
  out.prevY = NaN;
  out.random = random;
  out.rotationSpeeds = new Float32Array(capacity);
  out.scales = new Float32Array(capacity);
  out.spawnAccumulator = 0;
  out.velocities = new Float32Array(capacity * 2);
}
