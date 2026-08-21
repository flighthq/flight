import { registerBuiltInCollisionSupports3D } from '@flighthq/collision/contract';
import { describe, expect, it } from 'vitest';

import { explainPhysics3DCollision } from './explainPhysics3DCollision';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
} from './world';

// This file asserts the state of the collision support registry BEFORE anything registers, which is the
// exact state a caller who forgot to register is in — and the state that presents as bodies falling
// through floors with no error anywhere. That claim only holds in a process nobody else has touched, so
// the file runs isolated; see `scripts/registryIsolatedTests.ts`. The registering tests come last on
// purpose: registration is process-global and cannot be undone.

function addSphereBody(world: ReturnType<typeof createPhysics3DWorld>, radius = 1): void {
  const body = createRigidBody3D('dynamic');
  addPhysics3DBody(world, body);
  addPhysics3DCollider(world, body, createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius }));
}

describe('explainPhysics3DCollision', () => {
  it('names the kinds with no registered support', () => {
    const world = createPhysics3DWorld();
    addSphereBody(world);

    const explanation = explainPhysics3DCollision(world);
    expect(explanation.status).toBe('missing-support');
    expect(explanation.unsupportedKinds).toEqual(['sphere']);
  });

  it('reports ready for an empty world, which cannot fail to detect anything', () => {
    expect(explainPhysics3DCollision(createPhysics3DWorld())).toEqual({ unsupportedKinds: [], status: 'ready' });
  });

  it('deduplicates and sorts, so the value is stable however the bodies were inserted', () => {
    const world = createPhysics3DWorld();
    addSphereBody(world, 1);
    const capsule = createRigidBody3D('dynamic');
    addPhysics3DBody(world, capsule);
    addPhysics3DCollider(
      world,
      capsule,
      createPhysics3DCollider({ kind: 'capsule', x0: 0, y0: 0, z0: 0, x1: 0, y1: 1, z1: 0, radius: 1 }),
    );
    addSphereBody(world, 2);

    expect(explainPhysics3DCollision(world).unsupportedKinds).toEqual(['capsule', 'sphere']);
  });

  it('reads the WORLD kind, which is what the narrow phase is actually handed', () => {
    // An `aabb` local shape carries a `box` world shape, so a world of aabb colliders needs the BOX
    // support registered. Asking about the local kind would report a world ready that is not.
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    addPhysics3DBody(world, body);
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 }),
    );

    expect(explainPhysics3DCollision(world).unsupportedKinds).toEqual(['box']);
  });

  it('reports ready once the built-in supports are registered', () => {
    const world = createPhysics3DWorld();
    addSphereBody(world);
    expect(explainPhysics3DCollision(world).status).toBe('missing-support');

    registerBuiltInCollisionSupports3D();

    expect(explainPhysics3DCollision(world)).toEqual({ unsupportedKinds: [], status: 'ready' });
  });
});
