import { applyParticleCollisions, applyParticleForces } from '@flighthq/particles';
import type {
  ParticleCollider,
  ParticleEmitter,
  ParticleEmitter3D,
  ParticleEmitterCallbacks,
  ParticleEmitterConfig,
  ParticleEmitterState,
  ParticleForce,
} from '@flighthq/types';

import { updateParticleEmitter3D } from './updateParticleEmitter3D';

export function stepParticleEmitter3D(
  emitter: ParticleEmitter3D,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  deltaTime: number,
  forces?: ReadonlyArray<ParticleForce>,
  colliders?: ReadonlyArray<ParticleCollider>,
  callbacks?: ParticleEmitterCallbacks,
): void {
  // applyParticleForces/Collisions are typed against ParticleEmitter but only
  // access emitter.data (ParticleEmitterData), which ParticleEmitter3D shares.
  const asEmitter = emitter as unknown as ParticleEmitter;
  if (forces != null && forces.length > 0) {
    applyParticleForces(asEmitter, state, forces, deltaTime);
  }
  updateParticleEmitter3D(emitter, state, config, deltaTime, callbacks);
  if (colliders != null && colliders.length > 0) {
    applyParticleCollisions(asEmitter, state, colliders);
  }
}
