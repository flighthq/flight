import { describe, expect, it } from 'vitest';

import {
  isPhysics2DPairJointSuppressed,
  rebuildPhysics2DJointCollisionSuppressions,
} from './jointCollisionSuppression';
import { registerPhysics2DJointSolver } from './jointRegistry';
import { createPhysics2DWorld } from './world';

describe('isPhysics2DPairJointSuppressed', () => {
  it('looks up either endpoint order and becomes false after the index is cleared', () => {
    const world = createPhysics2DWorld();
    world.jointCollisionSuppressions.set(2, new Map([[7, 1]]));
    expect(isPhysics2DPairJointSuppressed(world, 2, 7)).toBe(true);
    expect(isPhysics2DPairJointSuppressed(world, 7, 2)).toBe(true);
    world.jointCollisionSuppressions.clear();
    expect(isPhysics2DPairJointSuppressed(world, 2, 7)).toBe(false);
  });
});

describe('rebuildPhysics2DJointCollisionSuppressions', () => {
  it('counts every active suppressing joint while ignoring unknown and one-body kinds', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, 'two-body', { prepare: () => {}, solve: () => {} });
    registerPhysics2DJointSolver(world, 'one-body', { prepare: () => {}, solve: () => {}, usesBodyA: false });
    world.joints.push(
      { kind: 'two-body', bodyA: 9, bodyB: 3, collideConnected: false } as never,
      { kind: 'two-body', bodyA: 3, bodyB: 9, collideConnected: false } as never,
      { kind: 'two-body', bodyA: 3, bodyB: 9, collideConnected: true } as never,
      { kind: 'unknown', bodyA: 3, bodyB: 9, collideConnected: false } as never,
      { kind: 'one-body', bodyA: 3, bodyB: 9, collideConnected: false } as never,
    );

    rebuildPhysics2DJointCollisionSuppressions(world);

    expect(world.jointCollisionSuppressions.get(3)?.get(9)).toBe(2);
  });
});
