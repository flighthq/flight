import type { Matrix4, ParticleEmitter3D } from '@flighthq/types';
import type { ParticleEmitterConfig, ParticleEmitterState } from '@flighthq/types';

import { updateParticleEmitter3D } from './updateParticleEmitter3D';

export function prewarmParticleEmitter3D(
  emitter: ParticleEmitter3D,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  duration: number,
  stepDeltaTime = 1 / 60,
  // Forwarded to updateParticleEmitter3D so world-space emitters bake spawns; see that function.
  worldTransform?: Readonly<Matrix4>,
): void {
  const step = stepDeltaTime > 0 ? stepDeltaTime : duration;
  let elapsed = 0;
  while (elapsed < duration) {
    const deltaTime = Math.min(step, duration - elapsed);
    updateParticleEmitter3D(emitter, state, config, deltaTime, worldTransform);
    elapsed += deltaTime;
  }
}
