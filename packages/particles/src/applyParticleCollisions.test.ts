import { createParticleEmitter } from '@flighthq/sprite';
import type { TextureAtlas } from '@flighthq/types';

import { applyParticleCollisions, applyParticleObjectCollisions } from './applyParticleCollisions';
import { createParticleEmitterConfig } from './particleEmitterConfig';
import { createParticleEmitterState } from './particleEmitterState';
import { createParticleObjectsState } from './particleObjectsState';
import { updateParticleEmitter } from './updateParticleEmitter';
import type { ParticleObject } from './updateParticleObjects';

function makeAtlas(): TextureAtlas {
  return {
    image: null,
    regions: [{ id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null }],
  } as TextureAtlas;
}

// Spawn one particle, then place it at a known position with a known velocity.
function place(px: number, py: number, vx: number, vy: number) {
  const emitter = createParticleEmitter({ data: { atlas: makeAtlas() } });
  const state = createParticleEmitterState();
  const config = createParticleEmitterConfig({
    spawnRate: 1,
    lifetimeMin: 100,
    lifetimeMax: 100,
    speedMin: 0,
    speedMax: 0,
  });
  updateParticleEmitter(emitter, state, config, 1);
  emitter.data.transforms[0] = px;
  emitter.data.transforms[1] = py;
  state.velocities[0] = vx;
  state.velocities[1] = vy;
  return { emitter, state };
}

describe('applyParticleCollisions', () => {
  describe('circle', () => {
    it('exclude mode keeps a particle outside the disc', () => {
      const { emitter, state } = place(5, 0, -10, 0); // inside radius-10 disc at origin, moving inward
      applyParticleCollisions(emitter, state, [
        { kind: 'CircleCollider', x: 0, y: 0, radius: 10, mode: 'exclude', restitution: 1 },
      ]);
      const d = Math.hypot(emitter.data.transforms[0], emitter.data.transforms[1]);
      expect(d).toBeCloseTo(10); // pushed to the surface
      expect(state.velocities[0]).toBeCloseTo(10); // bounced outward
    });

    it('contain mode keeps a particle inside the boundary', () => {
      const { emitter, state } = place(20, 0, 10, 0); // outside radius-10 boundary, moving further out
      applyParticleCollisions(emitter, state, [{ kind: 'CircleCollider', x: 0, y: 0, radius: 10, mode: 'contain' }]);
      const d = Math.hypot(emitter.data.transforms[0], emitter.data.transforms[1]);
      expect(d).toBeCloseTo(10);
    });
  });

  describe('integration', () => {
    it('settles a falling particle onto a floor over multiple frames', () => {
      const { emitter, state } = place(0, 480, 0, 0);
      const config = createParticleEmitterConfig({ spawnRate: 0, lifetimeMin: 100, lifetimeMax: 100, gravityY: 2000 });
      const floor = [{ kind: 'PlaneCollider' as const, nx: 0, ny: -1, distance: -500 }];
      for (let i = 0; i < 60; i++) {
        updateParticleEmitter(emitter, state, config, 1 / 60);
        applyParticleCollisions(emitter, state, floor);
      }
      expect(emitter.data.transforms[1]).toBeLessThanOrEqual(500 + 1e-3); // never falls through
      expect(emitter.data.transforms[1]).toBeCloseTo(500, 0); // resting on the floor
    });

    it('is a no-op with no colliders', () => {
      const { emitter, state } = place(0, 520, 0, 100);
      applyParticleCollisions(emitter, state, []);
      expect(emitter.data.transforms[1]).toBe(520);
    });
  });

  describe('plane (floor)', () => {
    it('pushes a penetrating particle back to the surface and stops it (restitution 0)', () => {
      // Floor at y = 500, valid region is y <= 500 (normal points up = -y).
      const { emitter, state } = place(0, 520, 0, 100); // 20px below floor, moving down
      applyParticleCollisions(emitter, state, [{ kind: 'PlaneCollider', nx: 0, ny: -1, distance: -500 }]);
      expect(emitter.data.transforms[1]).toBeCloseTo(500); // snapped to surface
      expect(state.velocities[1]).toBeCloseTo(0); // normal velocity killed
    });

    it('bounces with restitution', () => {
      const { emitter, state } = place(0, 520, 0, 100);
      applyParticleCollisions(emitter, state, [
        { kind: 'PlaneCollider', nx: 0, ny: -1, distance: -500, restitution: 0.5 },
      ]);
      expect(state.velocities[1]).toBeCloseTo(-50); // 100 down → 50 up
    });

    it('applies friction to the tangential component', () => {
      const { emitter, state } = place(0, 520, 80, 100);
      applyParticleCollisions(emitter, state, [
        { kind: 'PlaneCollider', nx: 0, ny: -1, distance: -500, friction: 0.25 },
      ]);
      expect(state.velocities[0]).toBeCloseTo(60); // 80 * (1 - 0.25)
    });

    it('leaves particles above the floor untouched', () => {
      const { emitter, state } = place(0, 100, 0, 100);
      applyParticleCollisions(emitter, state, [{ kind: 'PlaneCollider', nx: 0, ny: -1, distance: -500 }]);
      expect(emitter.data.transforms[1]).toBe(100);
      expect(state.velocities[1]).toBe(100);
    });
  });

  describe('rect', () => {
    it('contain mode clamps particles to the bounds and reflects velocity', () => {
      // Box centered (0,0), 100×100 → bounds ±50.
      const { emitter, state } = place(80, 0, 30, 0);
      applyParticleCollisions(emitter, state, [
        { kind: 'RectangleCollider', x: 0, y: 0, width: 100, height: 100, mode: 'contain', restitution: 1 },
      ]);
      expect(emitter.data.transforms[0]).toBeCloseTo(50);
      expect(state.velocities[0]).toBeCloseTo(-30);
    });

    it('exclude mode pushes a particle out of a solid box along the shallowest axis', () => {
      // Particle just inside the right edge of a box centered (0,0), 100×100.
      const { emitter, state } = place(40, 0, 0, 0);
      applyParticleCollisions(emitter, state, [
        { kind: 'RectangleCollider', x: 0, y: 0, width: 100, height: 100, mode: 'exclude' },
      ]);
      expect(emitter.data.transforms[0]).toBeCloseTo(50); // pushed out the near (right) edge
    });
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
    visible: true,
    x: 0,
    y: 0,
  } as unknown as ParticleObject;
}

// Build an object-pool collision scenario: a single live object at (px,py) with
// velocity (vx,vy) in slot 0; slot 1 is left dead.
function placeObject(px: number, py: number, vx: number, vy: number) {
  const objects = [makeObject(), makeObject()];
  const state = createParticleObjectsState(2);
  state.lifetimes[1] = 0; // slot 0 age
  state.lifetimes[1 * 2 + 1] = 0; // slot 1 maxAge = 0 → dead
  state.lifetimes[0 * 2 + 1] = 100; // slot 0 maxAge > 0 → alive
  objects[0].x = px;
  objects[0].y = py;
  state.velocities[0] = vx;
  state.velocities[1] = vy;
  return { objects, state };
}

describe('applyParticleObjectCollisions', () => {
  it('pushes a live object back onto a floor plane and kills its normal velocity', () => {
    const { objects, state } = placeObject(0, 520, 0, 100); // below floor y=500, moving down
    applyParticleObjectCollisions(objects, state, [{ kind: 'PlaneCollider', nx: 0, ny: -1, distance: -500 }]);
    expect(objects[0].y).toBeCloseTo(500); // snapped to surface
    expect(state.velocities[1]).toBeCloseTo(0); // normal velocity killed
  });

  it('bounces a live object with restitution', () => {
    const { objects, state } = placeObject(0, 520, 0, 100);
    applyParticleObjectCollisions(objects, state, [
      { kind: 'PlaneCollider', nx: 0, ny: -1, distance: -500, restitution: 0.5 },
    ]);
    expect(state.velocities[1]).toBeCloseTo(-50); // 100 down → 50 up
  });

  it('skips dead slots', () => {
    const { objects, state } = placeObject(0, 100, 0, 0); // slot 0 above the floor → untouched
    objects[1].x = 0;
    objects[1].y = 520; // dead slot 1 is below the floor but must be ignored
    applyParticleObjectCollisions(objects, state, [{ kind: 'PlaneCollider', nx: 0, ny: -1, distance: -500 }]);
    expect(objects[1].y).toBe(520); // dead object left where it was
  });

  it('is a no-op with no colliders', () => {
    const { objects, state } = placeObject(0, 520, 0, 100);
    applyParticleObjectCollisions(objects, state, []);
    expect(objects[0].y).toBe(520);
    expect(state.velocities[1]).toBe(100);
  });
});
