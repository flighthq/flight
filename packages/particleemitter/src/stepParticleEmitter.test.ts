import { createParticleEmitterConfig, createParticleEmitterState } from '@flighthq/particles';
import type { ParticleCollider, ParticleForce, TextureAtlas } from '@flighthq/types';

import { createParticleEmitter } from './particleEmitter';
import { stepParticleEmitter } from './stepParticleEmitter';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as unknown as TextureAtlas;
}

describe('stepParticleEmitter', () => {
  it('spawns particles when called with no forces or colliders', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, maxParticles: 100 });
    stepParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(10);
  });

  it('applies wind force before update — particle receives velocity from wind', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      spread: 0,
      directionX: 0,
      directionY: -1,
    });
    // Spawn one particle first
    stepParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(1);
    // Now step with a wind force pushing right
    const wind: ParticleForce = { kind: 'WindForce', x: 200, y: 0 };
    stepParticleEmitter(emitter, state, config, 1, [wind]);
    // After wind: vx starts at 0, gets +200 from wind in applyForces, then particle moves right
    const x = emitter.data.transforms[0];
    expect(x).toBeGreaterThan(0);
  });

  it('resolves collisions after update — particle stays above a plane at y=0', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 100,
      speedMax: 100,
      spread: 0,
      directionX: 0,
      directionY: 1, // moving downward
      gravityY: 0,
    });
    stepParticleEmitter(emitter, state, config, 1);
    // Particle moves down; plane at y=0 (normal pointing up = (0,-1), distance 0)
    const plane: ParticleCollider = { kind: 'PlaneCollider', nx: 0, ny: -1, distance: 0, restitution: 1, friction: 0 };
    stepParticleEmitter(emitter, state, config, 1, undefined, [plane]);
    // Particle should be reflected above y=0
    const y = emitter.data.transforms[1];
    expect(y).toBeGreaterThanOrEqual(-1e-4); // at or above plane
  });

  it('passes callbacks down to updateParticleEmitter', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 3, lifetimeMin: 10, lifetimeMax: 10 });
    let spawnCount = 0;
    stepParticleEmitter(emitter, state, config, 1, undefined, undefined, { onSpawn: () => spawnCount++ });
    expect(spawnCount).toBe(3);
  });

  it('is a no-op for zero deltaTime', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, lifetimeMin: 10, lifetimeMax: 10 });
    stepParticleEmitter(emitter, state, config, 0);
    expect(emitter.data.particleCount).toBe(0);
  });
});
