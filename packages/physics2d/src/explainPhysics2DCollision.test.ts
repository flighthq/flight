import type { Physics2DWorld } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { updatePhysics2DColliderWorldShape } from './colliderTransform';
import { explainPhysics2DCollision } from './explainPhysics2DCollision';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function worldWith(...shapes: Parameters<typeof createPhysics2DCollider>[0][]): Physics2DWorld {
  const world = createPhysics2DWorld(0, -10);
  for (const shape of shapes) {
    const body = createRigidBody2D('dynamic', 0, 0);
    const collider = createPhysics2DCollider(shape, STONE);
    body.colliders.push(collider);
    addPhysics2DBody(world, body);
    updatePhysics2DColliderWorldShape(collider, body);
  }
  return world;
}

describe('explainPhysics2DCollision', () => {
  it('reports ready for a world of shapes the dispatcher answers for', () => {
    const world = worldWith(
      { kind: 'circle', x: 0, y: 0, radius: 1 },
      { kind: 'aabb', minX: -1, minY: -1, maxX: 1, maxY: 1 },
      { kind: 'polygon', points: [0, 0, 1, 0, 1, 1] },
    );
    expect(explainPhysics2DCollision(world)).toEqual({ status: 'ready', unsupportedKinds: [] });
  });

  it('reports ready for an empty world, which has nothing that can fail', () => {
    expect(explainPhysics2DCollision(createPhysics2DWorld(0, -10)).status).toBe('ready');
  });

  it('names a capsule, whose pair functions are not written yet', () => {
    const world = worldWith({ kind: 'capsule', x0: 0, y0: 0, x1: 1, y1: 0, radius: 0.5 });
    expect(explainPhysics2DCollision(world)).toEqual({
      status: 'missing-contact-support',
      unsupportedKinds: ['capsule'],
    });
  });

  it('names the area-less kinds too, since they are equally invisible to the solver', () => {
    const world = worldWith({ kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 0 }, { kind: 'point', x: 0, y: 0 });
    expect(explainPhysics2DCollision(world).unsupportedKinds).toEqual(['point', 'segment']);
  });

  it('reports each kind once however many colliders carry it, and in a stable order', () => {
    // A level with four hundred capsules is one mistake. Sorted so the answer does not depend on the
    // order bodies were added, which would make the same world report differently twice.
    const world = worldWith(
      { kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 0 },
      { kind: 'capsule', x0: 0, y0: 0, x1: 1, y1: 0, radius: 0.5 },
      { kind: 'capsule', x0: 2, y0: 0, x1: 3, y1: 0, radius: 0.5 },
      { kind: 'circle', x: 0, y: 0, radius: 1 },
    );
    expect(explainPhysics2DCollision(world).unsupportedKinds).toEqual(['capsule', 'segment']);
  });
});
