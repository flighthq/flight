import { createMatrix4, scaleMatrix4, translateMatrix4 } from '@flighthq/geometry';
import { createParticleEmitterConfig, createParticleEmitterState } from '@flighthq/particles';
import { describe, expect, it } from 'vitest';

import { createParticleEmitter3D } from './particleEmitter3D';
import { isParticleEmitter3DComplete, updateParticleEmitter3D } from './updateParticleEmitter3D';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('isParticleEmitter3DComplete', () => {
  it('returns false for infinite emitter', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ duration: 0, loop: false });
    expect(isParticleEmitter3DComplete(emitter, state, config)).toBe(false);
  });

  it('returns false for looping emitter', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ duration: 1, loop: true });
    state.emitterAge = 2;
    expect(isParticleEmitter3DComplete(emitter, state, config)).toBe(false);
  });

  it('returns true when finite emitter is past duration and all particles dead', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ duration: 1, loop: false });
    state.emitterAge = 2;
    emitter.data.particleCount = 0;
    expect(isParticleEmitter3DComplete(emitter, state, config)).toBe(true);
  });

  it('returns false when particles are still alive', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ duration: 1, loop: false });
    state.emitterAge = 2;
    emitter.data.particleCount = 3;
    expect(isParticleEmitter3DComplete(emitter, state, config)).toBe(false);
  });
});

describe('updateParticleEmitter3D', () => {
  it('does nothing for zero deltaTime', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState();
    const config = createParticleEmitterConfig({ spawnRate: 100 });
    updateParticleEmitter3D(emitter, state, config, 0);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('spawns particles based on spawnRate', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({ spawnRate: 10, maxParticles: 100 });
    updateParticleEmitter3D(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(10);
  });

  it('applies gravity to particle velocities', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 1,
      burstInterval: 0,
      gravityX: 0,
      gravityY: -10,
      gravityZ: 0,
      lifetimeMin: 10,
      lifetimeMax: 10,
      maxParticles: 10,
      spawnRate: 0,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter3D(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(1);
    updateParticleEmitter3D(emitter, state, config, 1);
    expect(state.velocities[1]).toBeCloseTo(-10, 0);
  });

  it('moves particles by velocity * deltaTime', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 1,
      burstInterval: 0,
      emitterShape: 'sphere',
      gravityX: 0,
      gravityY: 0,
      gravityZ: 0,
      maxParticles: 10,
      spawnRate: 0,
      speedMin: 100,
      speedMax: 100,
    });
    updateParticleEmitter3D(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(1);
    const x0 = emitter.data.transforms[0];
    const y0 = emitter.data.transforms[1];
    const z0 = emitter.data.positionsZ[0];
    updateParticleEmitter3D(emitter, state, config, 0.1);
    const dx = emitter.data.transforms[0] - x0;
    const dy = emitter.data.transforms[1] - y0;
    const dz = emitter.data.positionsZ[0] - z0;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(dist).toBeCloseTo(10, 0);
  });

  it('removes dead particles when lifetime expires', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 5,
      burstInterval: 0,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
      maxParticles: 10,
      spawnRate: 0,
    });
    updateParticleEmitter3D(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(5);
    updateParticleEmitter3D(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(0);
  });

  it('interpolates alpha over lifetime', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      alphaEnd: 0,
      alphaStart: 1,
      burstCount: 1,
      burstInterval: 0,
      lifetimeMin: 1,
      lifetimeMax: 1,
      maxParticles: 10,
      spawnRate: 0,
    });
    updateParticleEmitter3D(emitter, state, config, 0.01);
    expect(emitter.data.particleCount).toBe(1);
    updateParticleEmitter3D(emitter, state, config, 0.5);
    expect(emitter.data.alphas[0]).toBeCloseTo(0.51, 1);
  });

  it('interpolates color over lifetime', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 1,
      burstInterval: 0,
      colorEndB: 0,
      colorEndG: 1,
      colorEndR: 0,
      colorStartB: 0,
      colorStartG: 0,
      colorStartR: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      maxParticles: 10,
      spawnRate: 0,
    });
    updateParticleEmitter3D(emitter, state, config, 0.01);
    expect(emitter.data.particleCount).toBe(1);
    updateParticleEmitter3D(emitter, state, config, 0.5);
    expect(emitter.data.colors[0]).toBeCloseTo(0.49, 1);
    expect(emitter.data.colors[1]).toBeCloseTo(0.51, 1);
  });

  it('respects maxParticles cap', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({ spawnRate: 100, maxParticles: 5 });
    updateParticleEmitter3D(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBe(5);
  });

  it('uses sphere spawn shape for 3D velocity directions', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      emitterShape: 'sphere',
      maxParticles: 50,
      spawnRate: 50,
      speedMin: 10,
      speedMax: 10,
    });
    updateParticleEmitter3D(emitter, state, config, 1);
    let hasPositiveZ = false;
    let hasNegativeZ = false;
    for (let i = 0; i < emitter.data.particleCount; i++) {
      if (state.velocities[i * 3 + 2] > 1) hasPositiveZ = true;
      if (state.velocities[i * 3 + 2] < -1) hasNegativeZ = true;
    }
    expect(hasPositiveZ).toBe(true);
    expect(hasNegativeZ).toBe(true);
  });

  it('leaves worldSpace false for a local-space emitter', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({ spawnRate: 1, maxParticles: 10 });
    updateParticleEmitter3D(emitter, state, config, 0.1);
    expect(emitter.data.worldSpace).toBe(false);
  });

  it('leaves worldSpace false and does not bake when config.worldSpace is set but no worldTransform is given', () => {
    // Guards the trap: claiming world-space without a matrix would tell the renderer to skip the node
    // transform while spawns were never baked. Without a transform the spawn stays at the local origin.
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 1,
      burstInterval: 0,
      maxParticles: 10,
      spawnRate: 0,
      speedMin: 0,
      speedMax: 0,
      worldSpace: true,
    });
    updateParticleEmitter3D(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(1);
    expect(emitter.data.worldSpace).toBe(false);
    expect(emitter.data.transforms[0]).toBeCloseTo(0);
    expect(emitter.data.transforms[1]).toBeCloseTo(0);
    expect(emitter.data.positionsZ[0]).toBeCloseTo(0);
  });

  it('bakes the spawn position through the world transform when world-space', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 1,
      burstInterval: 0,
      maxParticles: 10,
      spawnRate: 0,
      speedMin: 0,
      speedMax: 0,
      worldSpace: true,
    });
    const worldTransform = createMatrix4();
    translateMatrix4(worldTransform, worldTransform, 5, 7, 9);
    updateParticleEmitter3D(emitter, state, config, 0.1, worldTransform);
    expect(emitter.data.particleCount).toBe(1);
    expect(emitter.data.worldSpace).toBe(true);
    // point-shape spawn at the local origin, translated into world space by the transform.
    expect(emitter.data.transforms[0]).toBeCloseTo(5);
    expect(emitter.data.transforms[1]).toBeCloseTo(7);
    expect(emitter.data.positionsZ[0]).toBeCloseTo(9);
  });

  it('bakes velocity through the world transform rotation and scale when world-space', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      emitterShape: 'sphere',
      maxParticles: 10,
      spawnRate: 10,
      speedMin: 10,
      speedMax: 10,
      worldSpace: true,
    });
    // Uniform scale of 2 leaves velocity direction alone but doubles its magnitude, independent of the
    // random sphere direction — so a local speed of 10 must become a world speed of 20.
    const worldTransform = createMatrix4();
    scaleMatrix4(worldTransform, worldTransform, 2, 2, 2);
    updateParticleEmitter3D(emitter, state, config, 0.1, worldTransform);
    expect(emitter.data.particleCount).toBeGreaterThan(0);
    const vx = state.velocities[0];
    const vy = state.velocities[1];
    const vz = state.velocities[2];
    expect(Math.hypot(vx, vy, vz)).toBeCloseTo(20, 4);
  });

  it('stops spawning when finite duration elapses', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      duration: 0.5,
      lifetimeMin: 0.1,
      lifetimeMax: 0.1,
      loop: false,
      maxParticles: 100,
      spawnRate: 10,
    });
    updateParticleEmitter3D(emitter, state, config, 0.6);
    const countAfterDuration = emitter.data.particleCount;
    updateParticleEmitter3D(emitter, state, config, 1);
    expect(emitter.data.particleCount).toBeLessThanOrEqual(countAfterDuration);
  });

  it('spawns burst particles', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      burstCount: 20,
      burstInterval: 0,
      maxParticles: 100,
      spawnRate: 0,
    });
    updateParticleEmitter3D(emitter, state, config, 0.1);
    expect(emitter.data.particleCount).toBe(20);
  });

  it('uses box spawn shape with 3D offsets', () => {
    const emitter = createParticleEmitter3D();
    const state = createParticleEmitterState(seededRandom(42));
    const config = createParticleEmitterConfig({
      emitterDepth: 10,
      emitterHeight: 10,
      emitterShape: 'box',
      emitterWidth: 10,
      maxParticles: 50,
      spawnRate: 50,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleEmitter3D(emitter, state, config, 1);
    let hasNonZeroZ = false;
    for (let i = 0; i < emitter.data.particleCount; i++) {
      if (Math.abs(emitter.data.positionsZ[i]) > 0.1) hasNonZeroZ = true;
    }
    expect(hasNonZeroZ).toBe(true);
  });
});
