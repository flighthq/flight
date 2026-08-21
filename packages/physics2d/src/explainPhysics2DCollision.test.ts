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
      { kind: 'capsule', x0: 0, y0: 0, x1: 1, y1: 0, radius: 0.5 },
      { kind: 'polygon', points: [0, 0, 1, 0, 1, 1] },
    );
    expect(explainPhysics2DCollision(world)).toEqual({ status: 'ready', unsupportedKinds: [] });
  });

  it('reports ready for an empty world, which has nothing that can fail', () => {
    expect(explainPhysics2DCollision(createPhysics2DWorld(0, -10)).status).toBe('ready');
  });

  it('reports ready for a capsule, which the dispatcher now answers for', () => {
    // This test previously asserted the opposite, and the change is the point: the capsule was named
    // here while its pair functions were missing, and it stopped being named when they landed. That is
    // the seam doing its job in both directions rather than a list someone has to remember to edit.
    const world = worldWith({ kind: 'capsule', x0: 0, y0: 0, x1: 1, y1: 0, radius: 0.5 });
    expect(explainPhysics2DCollision(world)).toEqual({ status: 'ready', unsupportedKinds: [] });
  });

  it('names the area-less kinds too, since they are equally invisible to the solver', () => {
    const world = worldWith({ kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 0 }, { kind: 'point', x: 0, y: 0 });
    expect(explainPhysics2DCollision(world).unsupportedKinds).toEqual(['point', 'segment']);
  });

  it('reports each kind once however many colliders carry it, and in a stable order', () => {
    // A level with four hundred capsules is one mistake. Sorted so the answer does not depend on the
    // order bodies were added, which would make the same world report differently twice.
    const world = worldWith(
      { kind: 'point', x: 0, y: 0 },
      { kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 0 },
      { kind: 'segment', x0: 2, y0: 0, x1: 3, y1: 0 },
      { kind: 'circle', x: 0, y: 0, radius: 1 },
    );
    expect(explainPhysics2DCollision(world).unsupportedKinds).toEqual(['point', 'segment']);
  });
});
