import { createRandomSource } from '@flighthq/math';

import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleObjectsState } from './particleObjectsState';
import type { ParticleObject } from './updateParticleObjects';
import { isParticleObjectsComplete, updateParticleObjects } from './updateParticleObjects';

function makeObject(): ParticleObject {
  return {
    alpha: 1,
    blendMode: null,
    colorTransform: null,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    visible: false,
    x: 0,
    y: 0,
  } as unknown as ParticleObject;
}

describe('updateParticleObjects', () => {
  it('does nothing when objects array is empty', () => {
    const state = createParticleObjectsState(0);
    const config = createParticleEmitterConfig();
    expect(() => updateParticleObjects([], state, config, 1)).not.toThrow();
  });

  it('spawns objects from the pool', () => {
    const objects = [makeObject(), makeObject(), makeObject()];
    const state = createParticleObjectsState(3);
    const config = createParticleEmitterConfig({ spawnRate: 2, lifetimeMin: 10, lifetimeMax: 10 });
    updateParticleObjects(objects, state, config, 1);
    const liveCount = objects.filter((o) => o.visible).length;
    expect(liveCount).toBe(2);
  });

  it('sets spawned objects to visible and positions them at origin', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1);
    expect(objects[0].visible).toBe(true);
    expect(objects[0].x).toBe(0);
    expect(objects[0].y).toBe(0);
  });

  it('kills objects when their lifetime expires', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 0.5,
      lifetimeMax: 0.5,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn (spawnRate*deltaTime=1)
    expect(objects[0].visible).toBe(true);
    updateParticleObjects(objects, state, config, 0.6); // advance past lifetime
    expect(objects[0].visible).toBe(false);
  });

  it('moves objects according to velocity and gravity', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      gravityX: 100,
      gravityY: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn at (0,0)
    updateParticleObjects(objects, state, config, 1); // integrate gravity
    expect(objects[0].x).toBeGreaterThan(0);
  });

  it('fades alpha from alphaStart to alphaEnd over lifetime', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      alphaStart: 1,
      alphaEnd: 0,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn 1 particle
    updateParticleObjects(objects, state, config, 0.5); // advance to half lifetime
    expect(objects[0].alpha).toBeCloseTo(0.5, 1);
  });

  it('respects maxParticles — does not exceed pool size', () => {
    const objects = [makeObject(), makeObject()];
    const state = createParticleObjectsState(2);
    const config = createParticleEmitterConfig({
      spawnRate: 100,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleObjects(objects, state, config, 1);
    const liveCount = objects.filter((o) => o.visible).length;
    expect(liveCount).toBeLessThanOrEqual(objects.length);
  });

  it('can re-use dead slots for new spawns', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 2,
      lifetimeMin: 0.1,
      lifetimeMax: 0.1,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn (kills immediately in next frame)
    updateParticleObjects(objects, state, config, 1); // kills expired, spawns fresh one
    expect(objects[0].visible).toBe(true);
  });

  it('animates scale over lifetime when scaleEnd differs from 1', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
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
    updateParticleObjects(objects, state, config, 1); // spawn
    updateParticleObjects(objects, state, config, 0.5); // half-life → scale=1
    expect(objects[0].scaleX).toBeCloseTo(1, 1);
  });

  it('rotates objects at their per-particle rotation speed', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
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
    updateParticleObjects(objects, state, config, 1); // spawn
    const rotBefore = objects[0].rotation;
    updateParticleObjects(objects, state, config, 1); // advance 1s
    expect(objects[0].rotation - rotBefore).toBeCloseTo(Math.PI, 3);
  });

  it('spawns objects within circle emitter shape', () => {
    const objects = Array.from({ length: 20 }, makeObject);
    const state = createParticleObjectsState(20);
    const config = createParticleEmitterConfig({
      spawnRate: 20,
      maxParticles: 20,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 0,
      speedMax: 0,
      emitterShape: 'circle',
      emitterRadius: 50,
    });
    updateParticleObjects(objects, state, config, 1);
    for (const obj of objects.filter((o) => o.visible)) {
      expect(Math.sqrt(obj.x * obj.x + obj.y * obj.y)).toBeLessThanOrEqual(50 + 1e-4);
    }
  });

  it('fires a one-shot burst on first frame', () => {
    const objects = Array.from({ length: 30 }, makeObject);
    const state = createParticleObjectsState(30);
    const config = createParticleEmitterConfig({
      spawnRate: 0,
      burstCount: 10,
      burstInterval: 0,
      lifetimeMin: 10,
      lifetimeMax: 10,
    });
    updateParticleObjects(objects, state, config, 1 / 60);
    expect(objects.filter((o) => o.visible).length).toBe(10);
    updateParticleObjects(objects, state, config, 1 / 60);
    expect(objects.filter((o) => o.visible).length).toBe(10); // no second burst
  });

  it('fires onSpawn callback for each spawned object', () => {
    const objects = [makeObject(), makeObject()];
    const state = createParticleObjectsState(2);
    const config = createParticleEmitterConfig({ spawnRate: 2, lifetimeMin: 10, lifetimeMax: 10 });
    let count = 0;
    updateParticleObjects(objects, state, config, 1, {
      callbacks: {
        onSpawn: () => {
          count++;
        },
      },
    });
    expect(count).toBe(2);
  });

  it('ignores a zero-deltaTime frame: no spawning or velocity corruption', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
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
    // Establish a previous emitter position, then move it and step with deltaTime=0.
    updateParticleObjects(objects, state, config, 1 / 60, { emitterX: 0, emitterY: 0 });
    const liveBefore = objects.filter((o) => o.visible).length;
    state.burstTimer = 0; // arm a burst that would otherwise fire next step
    updateParticleObjects(objects, state, config, 0, { emitterX: 100, emitterY: 0 });
    expect(objects.filter((o) => o.visible).length).toBe(liveBefore); // nothing new spawned
    expect(Number.isFinite(state.velocities[0])).toBe(true);
    expect(Number.isFinite(state.velocities[1])).toBe(true);
  });

  it('ignores a negative-deltaTime frame', () => {
    const objects = [makeObject(), makeObject()];
    const state = createParticleObjectsState(2);
    const config = createParticleEmitterConfig({ spawnRate: 10, lifetimeMin: 10, lifetimeMax: 10 });
    updateParticleObjects(objects, state, config, 1); // spawn
    const liveBefore = objects.filter((o) => o.visible).length;
    updateParticleObjects(objects, state, config, -1);
    expect(objects.filter((o) => o.visible).length).toBe(liveBefore);
  });

  it('a finite, non-looping object emitter stops spawning after its duration', () => {
    const objects = Array.from({ length: 50 }, makeObject);
    const state = createParticleObjectsState(50);
    const config = createParticleEmitterConfig({
      spawnRate: 10,
      lifetimeMin: 100, // long-lived so none die during the test window
      lifetimeMax: 100,
      duration: 1,
      loop: false,
    });
    // Step well past the 1s duration so emission has definitely stopped.
    for (let i = 0; i < 20; i++) updateParticleObjects(objects, state, config, 0.1);
    const liveAfterDuration = objects.filter((o) => o.visible).length;
    expect(liveAfterDuration).toBeGreaterThan(0);
    // Stepping further spawns nothing more (and nothing dies yet).
    for (let i = 0; i < 20; i++) updateParticleObjects(objects, state, config, 0.1);
    expect(objects.filter((o) => o.visible).length).toBe(liveAfterDuration);
  });

  describe('isParticleObjectsComplete', () => {
    it('is true once finished and all objects are dead', () => {
      const objects = Array.from({ length: 50 }, makeObject);
      const state = createParticleObjectsState(50);
      const config = createParticleEmitterConfig({
        spawnRate: 10,
        lifetimeMin: 0.5,
        lifetimeMax: 0.5,
        duration: 1,
        loop: false,
      });
      expect(isParticleObjectsComplete(objects, state, config)).toBe(false);
      for (let i = 0; i < 10; i++) updateParticleObjects(objects, state, config, 0.1); // emit 1s
      expect(isParticleObjectsComplete(objects, state, config)).toBe(false); // still alive
      for (let i = 0; i < 10; i++) updateParticleObjects(objects, state, config, 0.1); // let them die
      expect(objects.some((o) => o.visible)).toBe(false);
      expect(isParticleObjectsComplete(objects, state, config)).toBe(true);
    });

    it('is always false for infinite or looping emitters', () => {
      const objects = [makeObject()];
      const state = createParticleObjectsState(1);
      expect(isParticleObjectsComplete(objects, state, createParticleEmitterConfig({ duration: 0 }))).toBe(false);
      expect(isParticleObjectsComplete(objects, state, createParticleEmitterConfig({ duration: 1, loop: true }))).toBe(
        false,
      );
    });
  });

  it('applies alpha and scale curves over lifetime', () => {
    const objects = [makeObject()];
    const state = createParticleObjectsState(1);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 1,
      lifetimeMax: 1,
      speedMin: 0,
      speedMax: 0,
      scaleMin: 4,
      scaleMax: 4,
      alphaCurve: [1, 0, 1],
      scaleCurve: [1, 0.5, 0],
    });
    updateParticleObjects(objects, state, config, 1); // spawn
    updateParticleObjects(objects, state, config, 0.5); // mid-life
    expect(objects[0].alpha).toBeCloseTo(0, 2); // alpha curve dips to 0
    expect(objects[0].scaleX).toBeCloseTo(2, 2); // 4 * 0.5
  });

  it('uses the injected RNG for deterministic spawning', () => {
    const config = createParticleEmitterConfig({
      spawnRate: 5,
      lifetimeMin: 10,
      lifetimeMax: 10,
      speedMin: 10,
      speedMax: 200,
      spread: Math.PI,
    });
    const run = (): number[] => {
      const objects = Array.from({ length: 20 }, makeObject);
      const state = createParticleObjectsState(20, createRandomSource(12345));
      updateParticleObjects(objects, state, config, 1);
      return objects.map((o) => o.rotation);
    };
    expect(run()).toEqual(run());
  });
});
