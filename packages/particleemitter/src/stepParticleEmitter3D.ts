import { applyParticleCollisions, applyParticleForces } from '@flighthq/particles';
import type {
  Matrix4,
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
  // Forwarded to updateParticleEmitter3D so world-space emitters bake spawns; see that function.
  worldMatrix?: Readonly<Matrix4>,
): void {
  // applyParticleForces/Collisions are typed against ParticleEmitter but only
  // access emitter.data (ParticleEmitterData), which ParticleEmitter3D shares.
  const asEmitter = emitter as unknown as ParticleEmitter;
  if (forces != null && forces.length > 0) {
    applyParticleForces(asEmitter, state, forces, deltaTime);
  }
  updateParticleEmitter3D(emitter, state, config, deltaTime, callbacks, worldMatrix);
  if (colliders != null && colliders.length > 0) {
    applyParticleCollisions(asEmitter, state, colliders);
  }
}
