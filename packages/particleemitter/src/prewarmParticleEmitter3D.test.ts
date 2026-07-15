import { createParticleEmitterConfig, createParticleEmitterState } from '@flighthq/particles';
import { describe, expect, it } from 'vitest';

import { createParticleEmitter3D } from './particleEmitter3D';
import { prewarmParticleEmitter3D } from './prewarmParticleEmitter3D';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('prewarmParticleEmitter3D', () => {
  it('fast-forwards the emitter by the given duration', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      spawnRate: 60,
      maxParticles: 500,
      lifetimeMin: 2,
      lifetimeMax: 2,
    });
    prewarmParticleEmitter3D(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
  });

  it('handles zero stepDeltaTime by using duration as one step', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      spawnRate: 60,
      maxParticles: 500,
      lifetimeMin: 2,
      lifetimeMax: 2,
    });
    prewarmParticleEmitter3D(emitter, state, config, 1, 0);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
  });
});
