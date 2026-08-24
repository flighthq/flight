import type { RigidBody2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createDisplayObject } from './displayContainer';
import { syncPhysics2DBodyToNode2D } from './syncPhysics2DBodyToNode2D';

function stubBody(x: number, y: number, angle: number): RigidBody2D {
  return { x, y, angle } as RigidBody2D;
}

describe('syncPhysics2DBodyToNode2D', () => {
  it('copies position from body to node', () => {
    const body = stubBody(5, -3, 0);
    const node = createDisplayObject();
    syncPhysics2DBodyToNode2D(body, node);
    expect(node.x).toBe(5);
    expect(node.y).toBe(-3);
  });

  it('converts angle from radians to degrees', () => {
    const body = stubBody(0, 0, Math.PI);
    const node = createDisplayObject();
    syncPhysics2DBodyToNode2D(body, node);
    expect(node.rotation).toBeCloseTo(180, 10);
  });

  it('converts a quarter turn', () => {
    const body = stubBody(0, 0, Math.PI / 2);
    const node = createDisplayObject();
    syncPhysics2DBodyToNode2D(body, node);
    expect(node.rotation).toBeCloseTo(90, 10);
  });

  it('handles zero angle', () => {
    const body = stubBody(1, 2, 0);
    const node = createDisplayObject();
    node.rotation = 45;
    syncPhysics2DBodyToNode2D(body, node);
    expect(node.rotation).toBe(0);
  });
});
