import type { ParticleEmitter, ParticleEmitterData } from '@flighthq/types';

import { applyParticleForces, applyParticleObjectForces } from './applyParticleForces';
import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState, ensureParticleEmitterStateCapacity } from './particleEmitterState';
import { createParticleObjectsState } from './particleObjectsState';
import type { ParticleObject } from './updateParticleObjects';
import { updateParticleObjects } from './updateParticleObjects';

// Node-free SoA emitter fixture: applyParticleForces reads only `emitter.data`, so the display
// node from @flighthq/particleemitter is not needed to unit-test the force pass. Keeping this
// fixture local preserves particles as a pure sim leaf.
function createEmitterFixture(capacity: number): ParticleEmitter {
  const data: ParticleEmitterData = {
    alphas: new Float32Array(capacity),
    atlas: null,
    colors: new Float32Array(capacity * 3),
    ids: new Uint16Array(capacity),
    particleCount: 0,
    transforms: new Float32Array(capacity * 4),
    velocities: new Float32Array(capacity * 2),
    worldSpace: false,
  };
  return { data, x: 0, y: 0 } as unknown as ParticleEmitter;
}

// A single stationary particle at the origin with zeroed velocity state.
function oneParticle() {
  const emitter = createEmitterFixture(1);
  const state = createParticleEmitterState();
  ensureParticleEmitterStateCapacity(state, 1, false);
  emitter.data.particleCount = 1;
  return { emitter, state };
}

describe('applyParticleForces', () => {
  it('attractor pulls velocity toward the point', () => {
    const { emitter, state } = oneParticle();
    emitter.data.transforms[0] = 0;
    emitter.data.transforms[1] = 0;
    applyParticleForces(emitter, state, [{ kind: 'AttractorForce', x: 100, y: 0, strength: 50 }], 1);
    expect(state.velocities[0]).toBeCloseTo(50); // accelerated +x toward (100,0)
    expect(state.velocities[1]).toBeCloseTo(0);
  });

  it('negative-strength attractor repels', () => {
    const { emitter, state } = oneParticle();
    applyParticleForces(emitter, state, [{ kind: 'AttractorForce', x: 100, y: 0, strength: -50 }], 1);
    expect(state.velocities[0]).toBeLessThan(0);
  });

  it('radius acts as a hard cutoff', () => {
    const { emitter, state } = oneParticle();
    emitter.data.transforms[0] = 0;
    emitter.data.transforms[1] = 0;
    state.velocities[0] = 42; // known baseline; an out-of-range force must not change it
    state.velocities[1] = 7;
    applyParticleForces(emitter, state, [{ kind: 'AttractorForce', x: 1000, y: 0, strength: 50, radius: 50 }], 1);
    expect(state.velocities[0]).toBe(42); // 1000 px away, outside 50px radius
    expect(state.velocities[1]).toBe(7);
  });

  it('vortex applies tangential velocity', () => {
    const { emitter, state } = oneParticle();
    emitter.data.transforms[0] = 10;
    emitter.data.transforms[1] = 0;
    applyParticleForces(emitter, state, [{ kind: 'VortexForce', x: 0, y: 0, strength: 20 }], 1);
    expect(state.velocities[0]).toBeCloseTo(0);
    expect(state.velocities[1]).toBeCloseTo(20); // perpendicular swirl
  });

  it('drag reduces existing velocity', () => {
    const { emitter, state } = oneParticle();
    state.velocities[0] = 100;
    state.velocities[1] = 0;
    applyParticleForces(emitter, state, [{ kind: 'DragForce', strength: 0.5 }], 1);
    expect(state.velocities[0]).toBeCloseTo(50); // 100 - 0.5*100
  });

  it('wind adds constant acceleration', () => {
    const { emitter, state } = oneParticle();
    applyParticleForces(emitter, state, [{ kind: 'WindForce', x: 5, y: -3 }], 2);
    expect(state.velocities[0]).toBeCloseTo(10); // 5 * deltaTime(2)
    expect(state.velocities[1]).toBeCloseTo(-6);
  });

  it('turbulence is finite and deterministic for a given position', () => {
    const a = oneParticle();
    a.emitter.data.transforms[0] = 12.5;
    a.emitter.data.transforms[1] = -7.5;
    applyParticleForces(a.emitter, a.state, [{ kind: 'TurbulenceForce', strength: 100, scale: 0.1 }], 1);
    const b = oneParticle();
    b.emitter.data.transforms[0] = 12.5;
    b.emitter.data.transforms[1] = -7.5;
    applyParticleForces(b.emitter, b.state, [{ kind: 'TurbulenceForce', strength: 100, scale: 0.1 }], 1);
    expect(Number.isFinite(a.state.velocities[0])).toBe(true);
    expect(a.state.velocities[0]).toBe(b.state.velocities[0]); // deterministic
    expect(a.state.velocities[1]).toBe(b.state.velocities[1]);
  });

  it('composes multiple forces additively', () => {
    const { emitter, state } = oneParticle();
    applyParticleForces(
      emitter,
      state,
      [
        { kind: 'WindForce', x: 10, y: 0 },
        { kind: 'WindForce', x: 5, y: 0 },
      ],
      1,
    );
    expect(state.velocities[0]).toBeCloseTo(15);
  });

  it('is a no-op for an empty force list or zero deltaTime', () => {
    const { emitter, state } = oneParticle();
    state.velocities[0] = 42;
    applyParticleForces(emitter, state, [], 1);
    applyParticleForces(emitter, state, [{ kind: 'WindForce', x: 5, y: 0 }], 0);
    expect(state.velocities[0]).toBe(42); // unchanged by either no-op call
  });
});

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

describe('applyParticleObjectForces', () => {
  it('applies forces only to live objects', () => {
    const objects = [makeObject(), makeObject()];
    const state = createParticleObjectsState(2);
    const config = createParticleEmitterConfig({
      spawnRate: 1,
      lifetimeMin: 100,
      lifetimeMax: 100,
      speedMin: 0,
      speedMax: 0,
    });
    updateParticleObjects(objects, state, config, 1); // spawn exactly one (spawnRate*deltaTime = 1)
    const liveIndex = objects.findIndex((o) => o.visible);
    const deadIndex = liveIndex === 0 ? 1 : 0;
    objects[liveIndex].x = 0;
    objects[liveIndex].y = 0;
    applyParticleObjectForces(objects, state, [{ kind: 'WindForce', x: 7, y: 0 }], 1);
    expect(state.velocities[liveIndex * 2]).toBeCloseTo(7);
    expect(state.velocities[deadIndex * 2]).toBe(0); // dead slot untouched
  });
});
