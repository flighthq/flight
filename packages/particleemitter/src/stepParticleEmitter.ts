import { applyParticleCollisions, applyParticleForces } from '@flighthq/particles';
import type {
  ParticleCollider,
  ParticleEmitter,
  ParticleEmitterCallbacks,
  ParticleEmitterConfig,
  ParticleEmitterState,
  ParticleForce,
  WorldTransform2D,
} from '@flighthq/types';

import { updateParticleEmitter } from './updateParticleEmitter';

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
