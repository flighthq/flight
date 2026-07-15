import { createParticleEmitterConfig, createParticleEmitterState } from '@flighthq/particles';
import type { ParticleForce, PlaneCollider } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createParticleEmitter3D } from './particleEmitter3D';
import { stepParticleEmitter3D } from './stepParticleEmitter3D';
import { updateParticleEmitter3D } from './updateParticleEmitter3D';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('stepParticleEmitter3D', () => {
  it('spawns and moves particles like updateParticleEmitter3D', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({ spawnRate: 10, maxParticles: 50 });
    stepParticleEmitter3D(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(10);
  });

  it('applies forces before update', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 1,
      burstInterval: 0,
      gravityX: 0,
      gravityY: 0,
      gravityZ: 0,
      maxParticles: 10,
      spawnRate: 0,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter3D(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(1);

    const wind: ParticleForce = { kind: 'WindForce', x: 100, y: 0, z: 0 };
    stepParticleEmitter3D(emitter, state, config, 1, [wind]);
    expect(state.velocities[0]).toBeGreaterThan(50);
  });

  it('applies colliders after update', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 1,
      burstInterval: 0,
      gravityX: 0,
      gravityY: -100,
      gravityZ: 0,
      maxParticles: 10,
      spawnRate: 0,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter3D(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(1);

    const ground: PlaneCollider = {
      kind: 'PlaneCollider',
      nx: 0,
      ny: 1,
      distance: 0,
      restitution: 0.5,
    };
    stepParticleEmitter3D(emitter, state, config, 1, undefined, [ground]);
    expect(emitter.data.transforms[1]).toBeGreaterThanOrEqual(0);
  });
});
