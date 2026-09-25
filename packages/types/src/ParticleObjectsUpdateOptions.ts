import type { ParticleEmitterCallbacks } from './ParticleEmitterCallbacks.ts';

export interface ParticleObjectsUpdateOptions {
  callbacks?: ParticleEmitterCallbacks;
  emitterX?: number;
  emitterY?: number;
}
