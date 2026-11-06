import type { ParticleEmitterConfig } from '@flighthq/particles/contract';
import type { ParticleEmitterState } from '@flighthq/types/contract';

import type { ParticleEmitter3D, ParticleEmitterCallbacks } from './types.ts';
import { updateParticleEmitter3D } from './updateParticleEmitter3D.ts';

export function prewarmParticleEmitter3D(
  emitter: ParticleEmitter3D,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  duration: number,
  stepDeltaTime = 1 / 60,
  callbacks?: ParticleEmitterCallbacks,
): void {
  const step = stepDeltaTime > 0 ? stepDeltaTime : duration;
  let elapsed = 0;
  while (elapsed < duration) {
    const deltaTime = Math.min(step, duration - elapsed);
    updateParticleEmitter3D(emitter, state, config, deltaTime, callbacks);
    elapsed += deltaTime;
  }
}
