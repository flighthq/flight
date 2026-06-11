import { createParticleEmitter, reserveParticleEmitter } from '@flighthq/scene-sprite';
import type { TextureAtlas } from '@flighthq/types';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState } from './particleEmitterState';
import { prewarmParticleEmitter } from './prewarmParticleEmitter';
import { isEmitterComplete, updateParticleEmitter } from './updateParticleEmitter';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as TextureAtlas;
}

describe('isEmitterComplete', () => {
  it('isEmitterComplete is true once a one-shot emitter has finished and all particles died', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 10,
      maxParticles: 1000,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
      duration: 1,
      loop: false,
    });
    expect(isEmitterComplete(emitter, state, config)).toBe(false);
    // Emit for 1s.
    for (let i = 0; i < 10; i++) updateParticleEmitter(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
    expect(isEmitterComplete(emitter, state, config)).toBe(false); // particles still alive
    // Let every particle die out (lifetime 0.5s).
    for (let i = 0; i < 10; i++) updateParticleEmitter(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(0);
    expect(isEmitterComplete(emitter, state, config)).toBe(true);
  });

  it('isEmitterComplete is always false for infinite or looping emitters', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const infinite = createParticleEmitterConfig({ spawnRate: 0, duration: 0 });
    expect(isEmitterComplete(emitter, state, infinite)).toBe(false);
    const looping = createParticleEmitterConfig({ spawnRate: 0, duration: 1, loop: true });
    expect(isEmitterComplete(emitter, state, looping)).toBe(false);
  });
});

describe('updateParticleEmitter', () => {
  it('spawns particles up to spawnRate × dt', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, maxParticles: 100 });
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(10);
  });

  it('respects maxParticles limit', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 100, maxParticles: 5 });
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(5);
  });

  it('ages particles over time', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn 1 particle (spawnRate*dt=1)
    expect(emitter.data.particleCount).toBe(1);
    updateParticleEmitter(emitter, state, config, 0.1); // age by 0.1
    expect(state.lifetimes[0]).toBeCloseTo(0.1);
  });

  it('removes particles when lifetime expires', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
    });
    // Spawn one particle
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(1);
    // Advance past lifetime
    updateParticleEmitter(emitter, state, config, 0.6);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('integrates velocity with gravity', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      gravityX: 100,
      gravityY: 0,
      spread: 0,
      directionX: 0,
      directionY: -1,
    });
    updateParticleEmitter(emitter, state, config, 1);
    // After spawn, position is (0,0). After next update with gravity...
    updateParticleEmitter(emitter, state, config, 1);
    // vx = 100*1 = 100, x += 100*1 = 100 (gravity applied to velocity then integrated)
    const x = emitter.data.transforms[0];
    expect(x).toBeGreaterThan(0);
  });

  it('interpolates alpha from alphaStart to alphaEnd over lifetime', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      alphaStart: 1,
      alphaEnd: 0,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn 1 particle
    updateParticleEmitter(emitter, state, config, 0.5); // advance to half lifetime
    expect(emitter.data.alphas[0]).toBeCloseTo(0.5, 1);
  });

  it('accumulates fractional spawn debt across frames', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 10,
      lifetimeMin: 10,
      lifetimeMax: 10,
      maxParticles: 100,
    });
    // 10 frames of dt=0.05 → total dt=0.5 → 5 particles
    for (let i = 0; i < 10; i++) updateParticleEmitter(emitter, state, config, 0.05);
    expect(emitter.data.particleCount).toBe(5);
  });

  it('grows emitter arrays as needed', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 100,
      maxParticles: 50,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(50);
    expect(emitter.data.transforms.length).toBeGreaterThanOrEqual(50 * 4);
  });

  it('pre-reserved emitters do not allocate during update', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    reserveParticleEmitter(emitter, 100);
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, maxParticles: 100 });
    const { transforms } = emitter.data;
    updateParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.transforms).toBe(transforms);
  });

  it('interpolates color from colorStart to colorEnd over lifetime', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      speedMin: 0,
      speedMax: 0,
      colorStartR: 1,
      colorStartG: 0,
      colorStartB: 0,
      colorEndR: 0,
      colorEndG: 0,
      colorEndB: 1,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn
    updateParticleEmitter(emitter, state, config, 0.5); // half-life
    expect(emitter.data.colors[0]).toBeCloseTo(0.5, 1); // R
    expect(emitter.data.colors[1]).toBeCloseTo(0, 1); // G
    expect(emitter.data.colors[2]).toBeCloseTo(0.5, 1); // B
  });

  it('animates scale over lifetime when scaleEnd differs from 1', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      speedMin: 0,
      speedMax: 0,
      scaleMin: 2,
      scaleMax: 2,
      scaleEnd: 0,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn with scale=2
    updateParticleEmitter(emitter, state, config, 0.5); // half-life → scale=1
    expect(emitter.data.transforms[3]).toBeCloseTo(1, 1);
  });

  it('rotates particles at their individual rotation speed', () => {
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
      rotationSpeedMin: Math.PI,
      rotationSpeedMax: Math.PI,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn
    const rotBefore = emitter.data.transforms[2];
    updateParticleEmitter(emitter, state, config, 1); // advance 1s at π rad/s
    const rotAfter = emitter.data.transforms[2];
    expect(rotAfter - rotBefore).toBeCloseTo(Math.PI, 3);
  });

  it('spawns particles within the circle radius', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 50,
      maxParticles: 50,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      emitterShape: 'circle',
      emitterRadius: 100,
    });
    updateParticleEmitter(emitter, state, config, 1);
    for (let i = 0; i < emitter.data.particleCount; i++) {
      const x = emitter.data.transforms[i * 4];
      const y = emitter.data.transforms[i * 4 + 1];
      expect(Math.sqrt(x * x + y * y)).toBeLessThanOrEqual(100 + 1e-4);
    }
  });

  it('spawns particles within the rect bounds', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 50,
      maxParticles: 50,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      emitterShape: 'rect',
      emitterWidth: 200,
      emitterHeight: 100,
    });
    updateParticleEmitter(emitter, state, config, 1);
    for (let i = 0; i < emitter.data.particleCount; i++) {
      const x = emitter.data.transforms[i * 4];
      const y = emitter.data.transforms[i * 4 + 1];
      expect(Math.abs(x)).toBeLessThanOrEqual(100 + 1e-4);
      expect(Math.abs(y)).toBeLessThanOrEqual(50 + 1e-4);
    }
  });

  it('fires a one-shot burst on the first frame', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 0,
      burstCount: 20,
      burstInterval: 0,
      maxParticles: 100,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleEmitter(emitter, state, config, 1 / 60);
    expect(emitter.data.particleCount).toBe(20);
    updateParticleEmitter(emitter, state, config, 1 / 60);
    expect(emitter.data.particleCount).toBe(20); // no second burst
  });

  it('fires repeated bursts at the configured interval', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 0,
      burstCount: 5,
      burstInterval: 1,
      maxParticles: 100,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleEmitter(emitter, state, config, 0.01); // burst 1 fires (burstTimer=0)
    expect(emitter.data.particleCount).toBe(5);
    updateParticleEmitter(emitter, state, config, 1.0); // burst 2 fires after 1s
    expect(emitter.data.particleCount).toBe(10);
  });

  it('advances flipbook frame based on age and frameRate', () => {
    const atlas = {
      image: null,
      regions: [
        { id: 0, x: 0, y: 0, width: 16, height: 16, pivotX: null, pivotY: null },
        { id: 1, x: 16, y: 0, width: 16, height: 16, pivotX: null, pivotY: null },
        { id: 2, x: 32, y: 0, width: 16, height: 16, pivotX: null, pivotY: null },
      ],
    } as TextureAtlas;
    const emitter = createParticleEmitter({ data: { atlas } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      regionIdMin: 0,
      frameCount: 3,
      frameRate: 1,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn → frame 0
    expect(emitter.data.ids[0]).toBe(0);
    updateParticleEmitter(emitter, state, config, 1); // +1s → frame 1
    expect(emitter.data.ids[0]).toBe(1);
    updateParticleEmitter(emitter, state, config, 1); // +1s → frame 2
    expect(emitter.data.ids[0]).toBe(2);
    updateParticleEmitter(emitter, state, config, 1); // +1s → frame 0 (wraps)
    expect(emitter.data.ids[0]).toBe(0);
  });

  it('fires onSpawn callback for each spawned particle', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 3, lifetimeMin: 10, lifetimeMax: 10 });
    let spawnCount = 0;
    updateParticleEmitter(emitter, state, config, 1, {
      onSpawn: () => {
        spawnCount++;
      },
    });
    expect(spawnCount).toBe(3);
  });

  it('fires onDeath callback with particle position when it expires', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter(emitter, state, config, 1); // spawn
    let deathFired = false;
    updateParticleEmitter(emitter, state, config, 0.6, {
      onDeath: () => {
        deathFired = true;
      },
    });
    expect(deathFired).toBe(true);
  });

  it('prewarm produces a non-empty particle state', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, lifetimeMin: 2, lifetimeMax: 2 });
    prewarmParticleEmitter(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
  });

  it('applies color variance — each particle gets its own birth/death color', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 5,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      colorStartR: 0.5,
      colorStartVarianceR: 0.5,
      colorEndR: 0.5,
      colorEndVarianceR: 0.5,
    });
    updateParticleEmitter(emitter, state, config, 1);
    // With full variance all born-red channels should be in [0, 1]
    for (let i = 0; i < emitter.data.particleCount; i++) {
      expect(state.colorBirth[i * 3]).toBeGreaterThanOrEqual(0);
      expect(state.colorBirth[i * 3]).toBeLessThanOrEqual(1);
    }
  });

  it('world-space flag is synced to emitter.data.worldSpace', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ worldSpace: true, spawnRate: 0 });
    updateParticleEmitter(emitter, state, config, 1 / 60);
    expect(emitter.data.worldSpace).toBe(true);
  });

  it('world-space: spawned particle position is transformed to world space', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      worldSpace: true,
    });
    const worldTransform = { a: 1, b: 0, c: 0, d: 1, tx: 200, ty: 300 };
    updateParticleEmitter(emitter, state, config, 1, undefined, worldTransform);
    expect(emitter.data.particleCount).toBe(1);
    // Particle origin should be at world position (200, 300), not (0, 0)
    expect(emitter.data.transforms[0]).toBeCloseTo(200);
    expect(emitter.data.transforms[1]).toBeCloseTo(300);
  });

  it('trail interpolation: particles spawned at interpolated positions along path', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    // spawnRate=5 with dt=1 → 5 particles per frame; maxParticles=10 leaves room for frame 2
    const config = createParticleEmitterConfig({
      spawnRate: 5,
      maxParticles: 10,
      lifetimeMin: 100,
      lifetimeMax: 100,
      speedMin: 0,
      speedMax: 0,
      worldSpace: true,
    });
    // Frame 1: emitter at (0, 0)
    const wt1 = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    updateParticleEmitter(emitter, state, config, 1, undefined, wt1);
    const countAfterFrame1 = emitter.data.particleCount;
    expect(countAfterFrame1).toBe(5);

    // Frame 2: emitter moves to (100, 0) — trail interpolates spawn positions
    const wt2 = { a: 1, b: 0, c: 0, d: 1, tx: 100, ty: 0 };
    updateParticleEmitter(emitter, state, config, 1, undefined, wt2);
    expect(emitter.data.particleCount).toBe(10);

    // The 5 new particles should span the path from x=0 to x=100
    let minX = Infinity,
      maxX = -Infinity;
    for (let i = countAfterFrame1; i < emitter.data.particleCount; i++) {
      const x = emitter.data.transforms[i * 4];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    expect(maxX - minX).toBeGreaterThan(10);
  });

  it('velocity inheritance: new particles receive fraction of emitter velocity', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 0,
      burstCount: 1,
      burstInterval: 0,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      spread: 0,
      directionX: 0,
      directionY: -1,
      velocityInheritance: 1,
    });
    // Establish prev position
    emitter.x = 0;
    updateParticleEmitter(emitter, state, config, 1 / 60);

    // Move emitter, trigger burst
    state.burstTimer = 0;
    emitter.x = 100;
    updateParticleEmitter(emitter, state, config, 1 / 60);
    // Emitter moved 100px in 1/60s → velocity ≈ 6000 px/s
    // With inheritance=1, vx of new particle should be ≈ 6000
    const vx = state.velocities[(emitter.data.particleCount - 1) * 2];
    expect(vx).toBeGreaterThan(100);
  });

  it('ignores a zero-dt frame: no spawning, aging, or velocity corruption', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 0,
      burstCount: 1,
      burstInterval: 0,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      spread: 0,
      velocityInheritance: 1,
    });
    // Establish a previous position, then move the emitter and step with dt=0.
    emitter.x = 0;
    updateParticleEmitter(emitter, state, config, 1 / 60);
    const countBefore = emitter.data.particleCount;
    state.burstTimer = 0; // arm a burst that would otherwise fire on the next step
    emitter.x = 100;
    updateParticleEmitter(emitter, state, config, 0);
    // No new particles spawned on a zero-dt frame...
    expect(emitter.data.particleCount).toBe(countBefore);
    // ...and existing particle velocities remain finite (no divide-by-dt poisoning).
    for (let i = 0; i < emitter.data.particleCount; i++) {
      expect(Number.isFinite(state.velocities[i * 2])).toBe(true);
      expect(Number.isFinite(state.velocities[i * 2 + 1])).toBe(true);
    }
  });

  it('ignores a negative-dt frame', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 10, lifetimeMin: 10, lifetimeMax: 10 });
    updateParticleEmitter(emitter, state, config, 1); // spawn 10
    const countBefore = emitter.data.particleCount;
    const accBefore = state.spawnAccumulator;
    updateParticleEmitter(emitter, state, config, -1);
    expect(emitter.data.particleCount).toBe(countBefore);
    expect(state.spawnAccumulator).toBe(accBefore); // accumulator not driven negative
  });

  it('still syncs the world-space flag on a zero-dt frame', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ worldSpace: true, spawnRate: 10 });
    updateParticleEmitter(emitter, state, config, 0);
    expect(emitter.data.worldSpace).toBe(true);
  });

  it('a finite, non-looping emitter stops spawning after its duration', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 10,
      maxParticles: 1000,
      lifetimeMin: 100, // long-lived so none die during the test window
      lifetimeMax: 100,
      duration: 1,
      loop: false,
    });
    // Step well past the 1s duration so emission has definitely stopped.
    for (let i = 0; i < 20; i++) updateParticleEmitter(emitter, state, config, 0.1);
    const countAfterDuration = emitter.data.particleCount;
    expect(countAfterDuration).toBeGreaterThan(0);
    expect(countAfterDuration).toBeLessThan(15); // ~10 particles, not unbounded
    // Stepping further spawns nothing more (and nothing dies yet).
    for (let i = 0; i < 20; i++) updateParticleEmitter(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(countAfterDuration);
  });

  it('a looping emitter keeps spawning past its duration', () => {
    const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({
      spawnRate: 10,
      maxParticles: 1000,
      lifetimeMin: 100,
      lifetimeMax: 100,
      duration: 1,
      loop: true,
    });
    for (let i = 0; i < 30; i++) updateParticleEmitter(emitter, state, config, 0.1);
    // 3 seconds at rate 10 → ~30 particles, well past the 1s duration.
    expect(emitter.data.particleCount).toBeGreaterThan(20);
  });
});
