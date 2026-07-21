import type { ParticleEmitter2D } from '@flighthq/types';
import type { ParticleEmitterConfig, ParticleEmitterState } from '@flighthq/types';

import type { ParticleEmitterCallbacks } from './updateParticleEmitter2D';
import { updateParticleEmitter2D } from './updateParticleEmitter2D';

export function prewarmParticleEmitter2D(
  emitter: ParticleEmitter2D,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  duration: number,
  stepDeltaTime = 1 / 60,
  callbacks?: ParticleEmitterCallbacks,
): void {
  // A non-positive step would never advance `elapsed`, spinning forever; fall back
  // to a single step covering the whole duration instead of hanging.
  const step = stepDeltaTime > 0 ? stepDeltaTime : duration;
  let elapsed = 0;
  while (elapsed < duration) {
    const deltaTime = Math.min(step, duration - elapsed);
    updateParticleEmitter2D(emitter, state, config, deltaTime, callbacks);
    elapsed += deltaTime;
  }
}
