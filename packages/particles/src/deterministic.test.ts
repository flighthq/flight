import { createRandomSource } from '@flighthq/math';
import { createParticleEmitter } from '@flighthq/sprite';
import type { TextureAtlas } from '@flighthq/types';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState } from './particleEmitterState';
import { stepParticleEmitter } from './stepParticleEmitter';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as unknown as TextureAtlas;
}

describe('deterministic replay', () => {
  it('produces byte-identical SoA buffers from two identically-seeded emitters', () => {
    const atlas = makeAtlas();
    const config = createParticleEmitterConfig({
      spawnRate: 20,
      maxParticles: 100,
      lifetimeMin: 0.5,
      lifetimeMax: 2,
      speedMin: 50,
      speedMax: 150,
      spread: Math.PI,
      gravityY: 100,
    });

    const emitterA = createParticleEmitter({ data: { atlas } });
    const stateA = createParticleEmitterState(createRandomSource(42));

    const emitterB = createParticleEmitter({ data: { atlas } });
    const stateB = createParticleEmitterState(createRandomSource(42));

    const steps = [0.016, 0.033, 0.016, 0.05, 0.016, 0.016, 0.033, 0.016];
    for (const dt of steps) {
      stepParticleEmitter(emitterA, stateA, config, dt);
      stepParticleEmitter(emitterB, stateB, config, dt);
    }

    expect(emitterA.data.particleCount).toBeGreaterThan(0);
    expect(emitterA.data.particleCount).toBe(emitterB.data.particleCount);

    const count = emitterA.data.particleCount;
    expect(emitterA.data.transforms.subarray(0, count * 4)).toEqual(emitterB.data.transforms.subarray(0, count * 4));
    expect(emitterA.data.alphas.subarray(0, count)).toEqual(emitterB.data.alphas.subarray(0, count));
    expect(emitterA.data.colors.subarray(0, count * 3)).toEqual(emitterB.data.colors.subarray(0, count * 3));
    expect(emitterA.data.velocities.subarray(0, count * 2)).toEqual(emitterB.data.velocities.subarray(0, count * 2));
    expect(stateA.lifetimes.subarray(0, count * 2)).toEqual(stateB.lifetimes.subarray(0, count * 2));
    expect(stateA.velocities.subarray(0, count * 2)).toEqual(stateB.velocities.subarray(0, count * 2));
    expect(stateA.scales.subarray(0, count)).toEqual(stateB.scales.subarray(0, count));
  });
});
