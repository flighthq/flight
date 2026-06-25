import type {
  ParticleCollider,
  ParticleEmitter,
  ParticleEmitterCallbacks,
  ParticleEmitterConfig,
  ParticleEmitterState,
  ParticleForce,
  ParticleObject,
  ParticleObjectsState,
  ParticleObjectsUpdateOptions,
  WorldTransform2D,
} from '@flighthq/types';

import { applyParticleCollisions, applyParticleObjectCollisions } from './applyParticleCollisions';
import { applyParticleForces, applyParticleObjectForces } from './applyParticleForces';
import { updateParticleEmitter } from './updateParticleEmitter';
import { updateParticleObjects } from './updateParticleObjects';

/**
 * Convenience wrapper for the SoA typed-array emitter that folds the canonical three-step update
 * sequence — `applyParticleForces` → `updateParticleEmitter` → `applyParticleCollisions` — into a
 * single call.
 *
 * The three primitives remain exported for advanced use (custom interleaving, per-force-group
 * timing, etc.). Use this function for the common case where all forces and colliders apply each
 * frame in the documented order.
 *
 * @param emitter - The SoA particle emitter node.
 * @param state - Mutable per-emitter simulation state.
 * @param config - Immutable emitter configuration.
 * @param deltaTime - Elapsed time in seconds since the last step.
 * @param forces - Optional force fields to apply before integration (e.g. wind, attractor).
 * @param colliders - Optional colliders to resolve after integration (e.g. plane, circle).
 * @param callbacks - Optional spawn/death callbacks.
 * @param worldTransform - World-space transform for world-space emitters.
 */
export function stepParticleEmitter(
  emitter: ParticleEmitter,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  deltaTime: number,
  forces?: ReadonlyArray<ParticleForce>,
  colliders?: ReadonlyArray<ParticleCollider>,
  callbacks?: ParticleEmitterCallbacks,
  worldTransform?: Readonly<WorldTransform2D>,
): void {
  if (forces != null && forces.length > 0) {
    applyParticleForces(emitter, state, forces, deltaTime);
  }
  updateParticleEmitter(emitter, state, config, deltaTime, callbacks, worldTransform);
  if (colliders != null && colliders.length > 0) {
    applyParticleCollisions(emitter, state, colliders);
  }
}

/**
 * Convenience wrapper for the object-pool path that folds the canonical three-step update sequence
 * — `applyParticleObjectForces` → `updateParticleObjects` → `applyParticleObjectCollisions` — into
 * a single call.
 *
 * The three primitives remain exported for advanced use. Use this function for the common case
 * where all forces and colliders apply each frame in the documented order.
 *
 * @param objects - The particle object pool (one display object per slot).
 * @param state - Mutable per-emitter simulation state.
 * @param config - Immutable emitter configuration.
 * @param deltaTime - Elapsed time in seconds since the last step.
 * @param forces - Optional force fields to apply before integration.
 * @param colliders - Optional colliders to resolve after integration.
 * @param updateOptions - Optional emitter position, callbacks, and other per-frame options.
 */
export function stepParticleObjects(
  objects: readonly ParticleObject[],
  state: ParticleObjectsState,
  config: Readonly<ParticleEmitterConfig>,
  deltaTime: number,
  forces?: ReadonlyArray<ParticleForce>,
  colliders?: ReadonlyArray<ParticleCollider>,
  updateOptions?: ParticleObjectsUpdateOptions,
): void {
  if (forces != null && forces.length > 0) {
    applyParticleObjectForces(objects, state, forces, deltaTime);
  }
  updateParticleObjects(objects, state, config, deltaTime, updateOptions);
  if (colliders != null && colliders.length > 0) {
    applyParticleObjectCollisions(objects, state, colliders);
  }
}
