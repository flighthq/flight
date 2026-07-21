import { applyParticleCollisions, applyParticleForces } from '@flighthq/particles';
import type {
  ParticleCollider,
  ParticleEmitter2D,
  ParticleEmitterCallbacks,
  ParticleEmitterConfig,
  ParticleEmitterState,
  ParticleForce,
} from '@flighthq/types';

import { updateParticleEmitter2D } from './updateParticleEmitter2D';

/**
 * Convenience wrapper for the SoA typed-array emitter that folds the canonical three-step update
 * sequence — `applyParticleForces` → `updateParticleEmitter2D` → `applyParticleCollisions` — into a
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
 */
export function stepParticleEmitter2D(
  emitter: ParticleEmitter2D,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  deltaTime: number,
  forces?: ReadonlyArray<ParticleForce>,
  colliders?: ReadonlyArray<ParticleCollider>,
  callbacks?: ParticleEmitterCallbacks,
): void {
  if (forces != null && forces.length > 0) {
    applyParticleForces(emitter, state, forces, deltaTime);
  }
  updateParticleEmitter2D(emitter, state, config, deltaTime, callbacks);
  if (colliders != null && colliders.length > 0) {
    applyParticleCollisions(emitter, state, colliders);
  }
}
