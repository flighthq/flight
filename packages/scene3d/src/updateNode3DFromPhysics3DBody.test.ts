import { getNodeLocalMatrix4 } from '@flighthq/node/contract';
import type { RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createNode3D } from './sceneNode';
import { updateNode3DFromPhysics3DBody } from './updateNode3DFromPhysics3DBody';

function stubBody(x: number, y: number, z: number, qx: number, qy: number, qz: number, qw: number): RigidBody3D {
  return {
    x,
    y,
    z,
    orientationX: qx,
    orientationY: qy,
    orientationZ: qz,
    orientationW: qw,
  } as RigidBody3D;
}

describe('updateNode3DFromPhysics3DBody', () => {
  it('copies position from body to node', () => {
    const body = stubBody(3, 7, -2, 0, 0, 0, 1);
    const node = createNode3D();
    updateNode3DFromPhysics3DBody(body, node);
    expect(node.position.x).toBe(3);
    expect(node.position.y).toBe(7);
    expect(node.position.z).toBe(-2);
  });

  it('copies orientation quaternion from body to node', () => {
    const body = stubBody(0, 0, 0, 0.5, 0.5, 0.5, 0.5);
    const node = createNode3D();
    updateNode3DFromPhysics3DBody(body, node);
    expect(node.rotation.x).toBe(0.5);
    expect(node.rotation.y).toBe(0.5);
    expect(node.rotation.z).toBe(0.5);
    expect(node.rotation.w).toBe(0.5);
  });

  it('invalidates the local matrix so the next world-transform read recomputes', () => {
    const node = createNode3D();
    const matrixBefore = getNodeLocalMatrix4(node);
    const m12Before = matrixBefore.m[12];
    const body = stubBody(10, 0, 0, 0, 0, 0, 1);
    updateNode3DFromPhysics3DBody(body, node);
    const matrixAfter = getNodeLocalMatrix4(node);
    expect(matrixAfter.m[12]).toBe(10);
    expect(matrixAfter.m[12]).not.toBe(m12Before);
  });
});
