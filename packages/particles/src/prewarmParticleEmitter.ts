import type { ParticleEmitter } from '@flighthq/types';

import type { ParticleEmitterConfig } from './particleEmitterConfig';
import type { ParticleEmitterState } from './particleEmitterState';
import type { ParticleEmitterCallbacks } from './updateParticleEmitter';
import { updateParticleEmitter } from './updateParticleEmitter';

export function prewarmParticleEmitter(
  emitter: ParticleEmitter,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  duration: number,
  stepDt = 1 / 60,
  callbacks?: ParticleEmitterCallbacks,
): void {
  let elapsed = 0;
  while (elapsed < duration) {
    const dt = Math.min(stepDt, duration - elapsed);
    updateParticleEmitter(emitter, state, config, dt, callbacks);
    elapsed += dt;
  }
}
