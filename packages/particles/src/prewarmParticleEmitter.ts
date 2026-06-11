import type { ParticleEmitter } from '@flighthq/types';

import type { ParticleEmitterConfig } from './particleEmitterConfig';
import type { ParticleEmitterState } from './particleEmitterState';
import type { ParticleEmitterCallbacks, WorldTransform2D } from './updateParticleEmitter';
import { updateParticleEmitter } from './updateParticleEmitter';

export function prewarmParticleEmitter(
  emitter: ParticleEmitter,
  state: ParticleEmitterState,
  config: Readonly<ParticleEmitterConfig>,
  duration: number,
  stepDt = 1 / 60,
  callbacks?: ParticleEmitterCallbacks,
  worldTransform?: Readonly<WorldTransform2D>,
): void {
  // A non-positive step would never advance `elapsed`, spinning forever; fall back
  // to a single step covering the whole duration instead of hanging.
  const step = stepDt > 0 ? stepDt : duration;
  let elapsed = 0;
  while (elapsed < duration) {
    const dt = Math.min(step, duration - elapsed);
    updateParticleEmitter(emitter, state, config, dt, callbacks, worldTransform);
    elapsed += dt;
  }
}
