import { createRandomSource } from '@flighthq/math';
import {
  applyParticleCollisions,
  applyParticleForces,
  createParticleEmitterConfig,
  createParticleEmitterState,
  enableParticleEmitterSignals,
  normalizeParticleEmitterConfig,
} from '@flighthq/particles';
import type { TextureAtlas } from '@flighthq/types';

import { createParticleEmitter } from './particleEmitter';
import { updateParticleEmitter } from './updateParticleEmitter';

// Integration coverage for the node-driven sim: the pure primitives (forces, collisions, curves,
// config validation, state, signals) live in @flighthq/particles and are unit-tested there against
// node-free fixtures; these cases exercise them through the real ParticleEmitter node driven by
// updateParticleEmitter, which is only possible from this package.

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as unknown as TextureAtlas;
}

describe('attractor forces via updateParticleEmitter', () => {
  it('integrates with the core update so attractors curve trajectories', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const spawnConfig = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 100,
      lifetimeMax: 100,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter(emitter, state, spawnConfig, 1); // spawn one stationary particle at origin

    const config = createParticleEmitterConfig({
      spawnRate: 0,
      speedMin: 0,
      speedMax: 0,
      lifetimeMin: 100,
      lifetimeMax: 100,
    });
    const forces = [{ kind: 'AttractorForce' as const, x: 100, y: 0, strength: 200 }];
    const startX = emitter.data.transforms[0];
    for (let i = 0; i < 10; i++) {
      applyParticleForces(emitter, state, forces, 1 / 60);
      updateParticleEmitter(emitter, state, config, 1 / 60);
    }
    expect(emitter.data.transforms[0]).toBeGreaterThan(startX); // drifted toward the attractor
  });
});

describe('collision settling via updateParticleEmitter', () => {
  it('settles a falling particle onto a floor over multiple frames', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const spawnConfig = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 100,
      lifetimeMax: 100,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter(emitter, state, spawnConfig, 1); // spawn one particle
    emitter.data.transforms[0] = 0;
    emitter.data.transforms[1] = 480;
    state.velocities[0] = 0;
    state.velocities[1] = 0;

    const config = createParticleEmitterConfig({ spawnRate: 0, lifetimeMin: 100, lifetimeMax: 100, gravityY: 2000 });
    const floor = [{ kind: 'PlaneCollider' as const, nx: 0, ny: -1, distance: -500 }];
    for (let i = 0; i < 60; i++) {
      updateParticleEmitter(emitter, state, config, 1 / 60);
      applyParticleCollisions(emitter, state, floor);
    }
    expect(emitter.data.transforms[1]).toBeLessThanOrEqual(500 + 1e-3); // never falls through
    expect(emitter.data.transforms[1]).toBeCloseTo(500, 0); // resting on the floor
  });
});

describe('lifetime curves in updateParticleEmitter', () => {
  function spawnOne(configOverrides: Parameters<typeof createParticleEmitterConfig>[0]) {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      speedMin: 0,
      speedMax: 0,
      ...configOverrides,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn one particle
    return { emitter, state, config };
  }

  it('alphaCurve drives alpha non-linearly over lifetime', () => {
    // A curve that is 1 at birth, dips to 0 at mid-life, back to 1 at death.
    const { emitter, state, config } = spawnOne({ alphaCurve: [1, 0, 1] });
    updateParticleEmitter(emitter, state, config, 0.5); // → mid-life
    expect(emitter.data.alphas[0]).toBeCloseTo(0, 2);
  });

  it('colorCurve overrides the start/end gradient', () => {
    // green at birth, red at death (interleaved RGB).
    const { emitter, state, config } = spawnOne({
      colorCurve: [0, 1, 0, 1, 0, 0],
      colorStartR: 0.123, // would be used by the linear path; curve must win
    });
    updateParticleEmitter(emitter, state, config, 0.5);
    expect(emitter.data.colors[0]).toBeCloseTo(0.5); // R halfway
    expect(emitter.data.colors[1]).toBeCloseTo(0.5); // G halfway
  });

  it('scaleCurve multiplies the spawn scale', () => {
    const { emitter, state, config } = spawnOne({
      scaleMin: 2,
      scaleMax: 2,
      scaleCurve: [1, 0.5, 0], // shrink to nothing
    });
    updateParticleEmitter(emitter, state, config, 0.5); // mid-life → factor 0.5
    expect(emitter.data.transforms[3]).toBeCloseTo(1, 2); // 2 * 0.5
  });

  it('sets curve-driven values at spawn time (t=0)', () => {
    const { emitter } = spawnOne({ alphaCurve: [0.25, 1] });
    expect(emitter.data.alphas[0]).toBeCloseTo(0.25, 2);
  });
});

describe('normalized config simulates via updateParticleEmitter', () => {
  it('produces a config that simulates without NaN poisoning', () => {
    // A pathologically corrupt config that would otherwise inject NaN everywhere.
    const corrupt = createParticleEmitterConfig({
      spawnRate: NaN,
      lifetimeMin: NaN,
      lifetimeMax: NaN,
      gravityY: Infinity,
      speedMin: NaN,
      speedMax: NaN,
    });
    const safe = normalizeParticleEmitterConfig(corrupt);
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    for (let i = 0; i < 30; i++) updateParticleEmitter(emitter, state, safe, 1 / 60);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
    for (let i = 0; i < emitter.data.particleCount * 4; i++) {
      expect(Number.isFinite(emitter.data.transforms[i])).toBe(true);
    }
  });
});

describe('onEmitterComplete signal', () => {
  it('fires once when a finite non-looping emitter completes', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      duration: 0.5,
      loop: false,
      spawnRate: 1,
      lifetimeMin: 0.1,
      lifetimeMax: 0.1,
      speedMin: 0,
      speedMax: 0,
    });
    const signals = enableParticleEmitterSignals(state);
    const completes: number[] = [];
    signals.onEmitterComplete.emit = () => completes.push(1);
    updateParticleEmitter(emitter, state, config, 1); // spawn + age past duration
    updateParticleEmitter(emitter, state, config, 1); // particles die → complete
    expect(completes.length).toBeGreaterThan(0);
  });

  it('does not fire for infinite emitters', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      duration: 0,
      loop: true,
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      speedMin: 0,
      speedMax: 0,
    });
    const signals = enableParticleEmitterSignals(state);
    const completes: number[] = [];
    signals.onEmitterComplete.emit = () => completes.push(1);
    for (let i = 0; i < 10; i++) updateParticleEmitter(emitter, state, config, 1);
    expect(completes.length).toBe(0);
  });
});

describe('onParticleDeath signal', () => {
  it('fires with the particle position when a particle dies', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      speedMin: 0,
      speedMax: 0,
    });
    const signals = enableParticleEmitterSignals(state);
    const deaths: Array<[number, number, number]> = [];
    signals.onParticleDeath.emit = (x: number, y: number, z: number) => deaths.push([x, y, z]);
    updateParticleEmitter(emitter, state, config, 1); // spawn
    updateParticleEmitter(emitter, state, config, 1.1); // age past lifetime → death
    expect(deaths.length).toBe(1);
    expect(Number.isFinite(deaths[0][0])).toBe(true);
    // 2D emitters carry a zero z in the shared 3D-capable signal payload.
    expect(deaths[0][2]).toBe(0);
  });
});

describe('onParticleSpawn signal', () => {
  it('fires with spawn position and velocity when a particle is spawned', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      speedMin: 50,
      speedMax: 50,
    });
    const signals = enableParticleEmitterSignals(state);
    const spawns: Array<[number, number, number, number, number, number]> = [];
    signals.onParticleSpawn.emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number) =>
      spawns.push([x, y, z, vx, vy, vz]);
    updateParticleEmitter(emitter, state, config, 1);
    expect(spawns.length).toBe(1);
    const [, , z, vx, vy, vz] = spawns[0];
    // Speed must match config (allow sign variations by checking magnitude).
    expect(Math.sqrt(vx * vx + vy * vy)).toBeCloseTo(50, 0);
    // 2D emitters carry zero on the z axis of the shared 3D-capable signal payload.
    expect(z).toBe(0);
    expect(vz).toBe(0);
  });
});

describe('seeded state determinism via updateParticleEmitter', () => {
  // Runs a short emitter simulation seeded from `seed` and returns the live particle transforms, so
  // a seeded state can be shown to simulate reproducibly (the seeded RNG lives in @flighthq/math).
  function simulate(seed: number): number[] {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState(createRandomSource(seed));
    const config = createParticleEmitterConfig({
      spawnRate: 20,
      maxParticles: 100,
      lifetimeMin: 0.5,
      lifetimeMax: 1.5,
      speedMin: 10,
      speedMax: 200,
      spread: Math.PI,
      emitterShape: 'circle',
      emitterRadius: 25,
      colorStartVarianceR: 0.5,
    });
    for (let f = 0; f < 30; f++) updateParticleEmitter(emitter, state, config, 1 / 60);
    return Array.from(emitter.data.transforms.slice(0, emitter.data.particleCount * 4));
  }

  it('seeded identically, two states simulate bit-for-bit identically', () => {
    expect(simulate(42)).toEqual(simulate(42));
  });

  it('diverges under different seeds', () => {
    expect(simulate(42)).not.toEqual(simulate(43));
  });
});
