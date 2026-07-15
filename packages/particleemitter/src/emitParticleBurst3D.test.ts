import { createParticleEmitterConfig, createParticleEmitterState } from '@flighthq/particles';
import { describe, expect, it } from 'vitest';

import { emitParticleBurst3D } from './emitParticleBurst3D';
import { createParticleEmitter3D } from './particleEmitter3D';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('emitParticleBurst3D', () => {
  it('spawns particles at the given 3D position', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      maxParticles: 100,
      speedMin: 0,
      speedMax: 0,
      emitterShape: 'point',
    });
    const spawned = emitParticleBurst3D(emitter, state, config, 5, 10, 20, 30);
    expect(spawned).toBe(5);
    expect(emitter.data.particleCount).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(emitter.data.transforms[i * 4]).toBe(10);
      expect(emitter.data.transforms[i * 4 + 1]).toBe(20);
      expect(emitter.data.positionsZ[i]).toBe(30);
    }
  });

  it('caps to maxParticles', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({ maxParticles: 3 });
    const spawned = emitParticleBurst3D(emitter, state, config, 10, 0, 0, 0);
    expect(spawned).toBe(3);
    expect(emitter.data.particleCount).toBe(3);
  });

  it('returns 0 when emitter is full', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({ maxParticles: 2 });
    emitParticleBurst3D(emitter, state, config, 2, 0, 0, 0);
    const spawned = emitParticleBurst3D(emitter, state, config, 5, 0, 0, 0);
    expect(spawned).toBe(0);
  });

  it('generates sphere velocity directions', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      maxParticles: 50,
      speedMin: 10,
      speedMax: 10,
      emitterShape: 'sphere',
    });
    emitParticleBurst3D(emitter, state, config, 50, 0, 0, 0);
    let hasPositiveZ = false;
    let hasNegativeZ = false;
    for (let i = 0; i < emitter.data.particleCount; i++) {
      if (state.velocities[i * 3 + 2] > 1) hasPositiveZ = true;
      if (state.velocities[i * 3 + 2] < -1) hasNegativeZ = true;
    }
    expect(hasPositiveZ).toBe(true);
    expect(hasNegativeZ).toBe(true);
  });

  it('applies box shape offsets relative to burst position', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      maxParticles: 50,
      emitterShape: 'box',
      emitterWidth: 10,
      emitterHeight: 10,
      emitterDepth: 10,
      speedMin: 0,
      speedMax: 0,
    });
    emitParticleBurst3D(emitter, state, config, 50, 100, 200, 300);
    let hasZOffset = false;
    for (let i = 0; i < emitter.data.particleCount; i++) {
      if (Math.abs(emitter.data.positionsZ[i] - 300) > 0.1) hasZOffset = true;
    }
    expect(hasZOffset).toBe(true);
  });

  it('sets initial alpha from config', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      maxParticles: 10,
      alphaStart: 0.5,
    });
    emitParticleBurst3D(emitter, state, config, 3, 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      expect(emitter.data.alphas[i]).toBeCloseTo(0.5);
    }
  });
});
