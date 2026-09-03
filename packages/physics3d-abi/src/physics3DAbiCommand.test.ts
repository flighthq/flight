import { createEntity } from '@flighthq/entity/contract';
import {
  createPhysics3DBallAndSocketJoint,
  createPhysics3DCollider,
  createPhysics3DConeTwistJoint,
  createPhysics3DDistanceJoint,
  createPhysics3DFixedJoint,
  createPhysics3DGeneric6DofJoint,
  createPhysics3DHingeJoint,
  createPhysics3DSliderJoint,
  createPhysics3DSolverConfig,
  createRigidBody3D,
} from '@flighthq/physics3d/contract';
import type { CollisionColliderShape3D, Physics3DAbiCommandBuffer, Physics3DJoint } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { clearPhysics3DAbiCommandBuffer, createPhysics3DAbiCommandBuffer } from './physics3DAbiBuffer';
import {
  getPhysics3DAbiSetColliderCommandByteLength,
  writePhysics3DAbiApplyForceAtPointCommand,
  writePhysics3DAbiApplyForceCommand,
  writePhysics3DAbiApplyLinearImpulseAtPointCommand,
  writePhysics3DAbiApplyLinearImpulseCommand,
  writePhysics3DAbiApplyTorqueCommand,
  writePhysics3DAbiDestroyBodyCommand,
  writePhysics3DAbiDestroyColliderCommand,
  writePhysics3DAbiDestroyJointCommand,
  writePhysics3DAbiSetBodyCommand,
  writePhysics3DAbiSetColliderCommand,
  writePhysics3DAbiSetGravityCommand,
  writePhysics3DAbiSetJointCommand,
  writePhysics3DAbiSetSolverConfigCommand,
  writePhysics3DAbiWakeBodyCommand,
} from './physics3DAbiCommand';
import {
  Physics3DAbiBodyType,
  Physics3DAbiCommandByteLength,
  Physics3DAbiCommandHeaderByteLength,
  Physics3DAbiCommandKind,
  Physics3DAbiCommandRecordHeaderByteLength,
  Physics3DAbiJointKind,
  Physics3DAbiSetColliderPayloadOffset,
  Physics3DAbiShapeKind,
} from './physics3DAbiLayout';

describe('getPhysics3DAbiSetColliderCommandByteLength', () => {
  it('matches exactly the number of bytes the collider writer publishes', () => {
    const collider = createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 2 });
    const out = createPhysics3DAbiCommandBuffer(1024);
    const before = out.byteLength;

    expect(writePhysics3DAbiSetColliderCommand(out, 4, 3, collider)).toBe(true);
    expect(out.byteLength - before).toBe(getPhysics3DAbiSetColliderCommandByteLength(collider));
  });
});

describe('writePhysics3DAbiApplyForceAtPointCommand', () => {
  it('writes all six vector components into one body-action record', () => {
    expectBodyAction(writePhysics3DAbiApplyForceAtPointCommand, Physics3DAbiCommandKind.ApplyForceAtPoint, true);
  });
});

describe('writePhysics3DAbiApplyForceCommand', () => {
  it('writes a force and zeroes the unused point slots', () => {
    expectBodyAction(writePhysics3DAbiApplyForceCommand, Physics3DAbiCommandKind.ApplyForce, false);
  });
});

describe('writePhysics3DAbiApplyLinearImpulseAtPointCommand', () => {
  it('writes all six impulse and point components', () => {
    expectBodyAction(
      writePhysics3DAbiApplyLinearImpulseAtPointCommand,
      Physics3DAbiCommandKind.ApplyLinearImpulseAtPoint,
      true,
    );
  });
});

describe('writePhysics3DAbiApplyLinearImpulseCommand', () => {
  it('writes an impulse and zeroes the unused point slots', () => {
    expectBodyAction(writePhysics3DAbiApplyLinearImpulseCommand, Physics3DAbiCommandKind.ApplyLinearImpulse, false);
  });
});

describe('writePhysics3DAbiApplyTorqueCommand', () => {
  it('writes a torque and zeroes the unused point slots', () => {
    expectBodyAction(writePhysics3DAbiApplyTorqueCommand, Physics3DAbiCommandKind.ApplyTorque, false);
  });
});

describe('writePhysics3DAbiDestroyBodyCommand', () => {
  it('writes an empty body record with a stable caller id', () => {
    expectEmptyCommand(writePhysics3DAbiDestroyBodyCommand, Physics3DAbiCommandKind.DestroyBody);
  });
});

describe('writePhysics3DAbiDestroyColliderCommand', () => {
  it('writes an empty collider record with a stable caller id', () => {
    expectEmptyCommand(writePhysics3DAbiDestroyColliderCommand, Physics3DAbiCommandKind.DestroyCollider);
  });
});

describe('writePhysics3DAbiDestroyJointCommand', () => {
  it('writes an empty joint record with a stable caller id', () => {
    expectEmptyCommand(writePhysics3DAbiDestroyJointCommand, Physics3DAbiCommandKind.DestroyJoint);
  });
});

describe('writePhysics3DAbiSetBodyCommand', () => {
  it('encodes the complete authored and dynamic body record', () => {
    const body = createRigidBody3D('kinematic');
    body.x = 3;
    body.velocityZ = -4;
    body.gravityScale = 0.25;
    body.fixedRotation = true;
    const out = createPhysics3DAbiCommandBuffer();

    expect(writePhysics3DAbiSetBodyCommand(out, 9, body)).toBe(true);

    const view = commandView(out);
    expect(view.getUint32(0, true)).toBe(Physics3DAbiCommandKind.SetBody);
    expect(view.getUint32(4, true)).toBe(Physics3DAbiCommandByteLength.SetBody);
    expect(view.getUint32(8, true)).toBe(9);
    expect(view.getUint32(16, true) & 0b11).toBe(Physics3DAbiBodyType.Kinematic);
    expect(view.getFloat64(24, true)).toBe(3);
    expect(view.getFloat64(24 + 9 * 8, true)).toBe(-4);
    expect(view.getFloat64(24 + 31 * 8, true)).toBe(0.25);
  });

  it('does not publish or overwrite bytes when the record does not fit', () => {
    const out = createPhysics3DAbiCommandBuffer(Physics3DAbiCommandHeaderByteLength);
    const before = [...out.data];

    expect(writePhysics3DAbiSetBodyCommand(out, 1, createRigidBody3D())).toBe(false);
    expect([...out.data]).toEqual(before);
    expect(out.commandCount).toBe(0);
  });
});

describe('writePhysics3DAbiSetColliderCommand', () => {
  it.each(getColliderShapeCases())('encodes and aligns the $name shape', ({ shape, code }) => {
    const collider = createPhysics3DCollider(shape);
    const out = createPhysics3DAbiCommandBuffer(16384);
    out.data.fill(0xff);
    clearPhysics3DAbiCommandBuffer(out);

    expect(writePhysics3DAbiSetColliderCommand(out, 12, 8, collider)).toBe(true);

    const view = commandView(out);
    expect(view.getUint32(0, true)).toBe(Physics3DAbiCommandKind.SetCollider);
    expect(view.getUint32(8, true)).toBe(12);
    expect(view.getUint32(12, true)).toBe(8);
    expect(
      view.getUint32(Physics3DAbiCommandRecordHeaderByteLength + Physics3DAbiSetColliderPayloadOffset.Shape, true),
    ).toBe(code);
    expect(view.getUint32(4, true) % 8).toBe(0);
    expect(out.data[out.byteLength - 1]).not.toBe(0xff);
  });
});

describe('writePhysics3DAbiSetGravityCommand', () => {
  it('writes three little-endian Float64 components', () => {
    const out = createPhysics3DAbiCommandBuffer();
    expect(writePhysics3DAbiSetGravityCommand(out, 1.5, -2.5, 3.5)).toBe(true);
    const view = commandView(out);
    expect(view.getUint32(0, true)).toBe(Physics3DAbiCommandKind.SetGravity);
    expect([view.getFloat64(16, true), view.getFloat64(24, true), view.getFloat64(32, true)]).toEqual([1.5, -2.5, 3.5]);
  });

  it('leaves a corrupted stream untouched instead of appending behind an invalid header', () => {
    const out = createPhysics3DAbiCommandBuffer();
    out.data[0] = 0;
    const before = [...out.data];
    expect(writePhysics3DAbiSetGravityCommand(out, 1, 2, 3)).toBe(false);
    expect([...out.data]).toEqual(before);
  });
});

describe('writePhysics3DAbiSetJointCommand', () => {
  it.each(getJointCases())('encodes the $name joint under its fixed wire kind', ({ joint, code }) => {
    const out = createPhysics3DAbiCommandBuffer();
    expect(writePhysics3DAbiSetJointCommand(out, 77, joint)).toBe(true);
    const view = commandView(out);
    expect(view.getUint32(0, true)).toBe(Physics3DAbiCommandKind.SetJoint);
    expect(view.getUint32(16, true)).toBe(code);
    expect(view.getUint32(20, true)).toBe(10);
    expect(view.getUint32(24, true)).toBe(20);
  });
});

describe('writePhysics3DAbiSetSolverConfigCommand', () => {
  it('encodes every iteration, CCD, sleep, and warm-start setting', () => {
    const config = createPhysics3DSolverConfig();
    config.substeps = 3;
    config.maxCcdSubsteps = 7;
    config.maxCcdRotationSubsteps = 9;
    config.sequentialImpulse.velocityIterations = 11;
    config.sequentialImpulse.positionIterations = 13;
    config.sequentialImpulse.warmStarting = false;
    const out = createPhysics3DAbiCommandBuffer();

    expect(writePhysics3DAbiSetSolverConfigCommand(out, config)).toBe(true);

    const view = commandView(out);
    expect(view.getUint32(20, true)).toBe(3);
    expect(view.getUint32(24, true)).toBe(7);
    expect(view.getUint32(28, true)).toBe(9);
    expect(view.getUint32(32, true)).toBe(11);
    expect(view.getUint32(36, true)).toBe(13);
    expect(view.getUint32(16, true) & (1 << 2)).toBe(0);
  });
});

describe('writePhysics3DAbiWakeBodyCommand', () => {
  it('writes an empty wake record', () => {
    expectEmptyCommand(writePhysics3DAbiWakeBodyCommand, Physics3DAbiCommandKind.WakeBody);
  });
});

function commandView(out: Readonly<Physics3DAbiCommandBuffer>): DataView {
  return new DataView(
    out.data.buffer,
    out.data.byteOffset + Physics3DAbiCommandHeaderByteLength,
    out.byteLength - Physics3DAbiCommandHeaderByteLength,
  );
}

function expectBodyAction(
  write: (out: Physics3DAbiCommandBuffer, id: number, ...values: number[]) => boolean,
  kind: number,
  hasPoint: boolean,
): void {
  const out = createPhysics3DAbiCommandBuffer();
  expect(write(out, 42, 1, 2, 3, 4, 5, 6)).toBe(true);
  const view = commandView(out);
  expect(view.getUint32(0, true)).toBe(kind);
  expect(view.getUint32(4, true)).toBe(Physics3DAbiCommandByteLength.BodyAction);
  expect(view.getUint32(8, true)).toBe(42);
  expect(Array.from({ length: 6 }, (_, i) => view.getFloat64(16 + i * 8, true))).toEqual(
    hasPoint ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 0, 0, 0],
  );
}

function expectEmptyCommand(write: (out: Physics3DAbiCommandBuffer, id: number) => boolean, kind: number): void {
  const out = createPhysics3DAbiCommandBuffer();
  expect(write(out, 0)).toBe(false);
  expect(write(out, 55)).toBe(true);
  const view = commandView(out);
  expect(view.getUint32(0, true)).toBe(kind);
  expect(view.getUint32(4, true)).toBe(Physics3DAbiCommandRecordHeaderByteLength);
  expect(view.getUint32(8, true)).toBe(55);
}

function getColliderShapeCases(): ReadonlyArray<{
  name: string;
  shape: CollisionColliderShape3D;
  code: number;
}> {
  return [
    { name: 'sphere', shape: { kind: 'sphere', x: 0, y: 0, z: 0, radius: 1 }, code: Physics3DAbiShapeKind.Sphere },
    { name: 'aabb', shape: unitAabb(), code: Physics3DAbiShapeKind.Aabb },
    {
      name: 'box',
      shape: {
        kind: 'box',
        x: 0,
        y: 0,
        z: 0,
        halfX: 1,
        halfY: 2,
        halfZ: 3,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        rotationW: 1,
      },
      code: Physics3DAbiShapeKind.Box,
    },
    {
      name: 'capsule',
      shape: { kind: 'capsule', x0: 0, y0: -1, z0: 0, x1: 0, y1: 1, z1: 0, radius: 0.5 },
      code: Physics3DAbiShapeKind.Capsule,
    },
    {
      name: 'cylinder',
      shape: { kind: 'cylinder', x0: 0, y0: -1, z0: 0, x1: 0, y1: 1, z1: 0, radius: 0.5 },
      code: Physics3DAbiShapeKind.Cylinder,
    },
    {
      name: 'cone',
      shape: { kind: 'cone', apexX: 0, apexY: 1, apexZ: 0, baseX: 0, baseY: -1, baseZ: 0, radius: 1 },
      code: Physics3DAbiShapeKind.Cone,
    },
    {
      name: 'convex',
      shape: { kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
      code: Physics3DAbiShapeKind.Convex,
    },
    {
      name: 'triangle mesh',
      shape: createEntity({
        kind: 'triangle-mesh',
        version: 2,
        x: 0,
        y: 0,
        z: 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        rotationW: 1,
        points: [0, 0, 0, 1, 0, 0, 0, 0, 1],
        indices: [0, 1, 2],
      }),
      code: Physics3DAbiShapeKind.TriangleMesh,
    },
    {
      name: 'heightfield',
      shape: createEntity({
        kind: 'heightfield',
        columns: 2,
        rows: 2,
        version: 3,
        cellSizeX: 1,
        cellSizeZ: 1,
        x: 0,
        y: 0,
        z: 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        rotationW: 1,
        heights: [0, 0, 0, 0],
      }),
      code: Physics3DAbiShapeKind.Heightfield,
    },
  ];
}

function getJointCases(): ReadonlyArray<{ name: string; joint: Physics3DJoint; code: number }> {
  return [
    {
      name: 'ball-and-socket',
      joint: createPhysics3DBallAndSocketJoint({ bodyA: 10, bodyB: 20 }),
      code: Physics3DAbiJointKind.BallAndSocket,
    },
    {
      name: 'distance',
      joint: createPhysics3DDistanceJoint({ bodyA: 10, bodyB: 20, length: 2 }),
      code: Physics3DAbiJointKind.Distance,
    },
    { name: 'fixed', joint: createPhysics3DFixedJoint({ bodyA: 10, bodyB: 20 }), code: Physics3DAbiJointKind.Fixed },
    { name: 'hinge', joint: createPhysics3DHingeJoint({ bodyA: 10, bodyB: 20 }), code: Physics3DAbiJointKind.Hinge },
    { name: 'slider', joint: createPhysics3DSliderJoint({ bodyA: 10, bodyB: 20 }), code: Physics3DAbiJointKind.Slider },
    {
      name: 'cone-twist',
      joint: createPhysics3DConeTwistJoint({ bodyA: 10, bodyB: 20 }),
      code: Physics3DAbiJointKind.ConeTwist,
    },
    {
      name: 'generic-6dof',
      joint: createPhysics3DGeneric6DofJoint({ bodyA: 10, bodyB: 20 }),
      code: Physics3DAbiJointKind.Generic6Dof,
    },
  ];
}

function unitAabb(): CollisionColliderShape3D {
  return { kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 };
}
