import {
  createPhysics2DCollider,
  createPhysics2DDistanceJoint,
  createPhysics2DGearJoint,
  createPhysics2DMouseJoint,
  createPhysics2DPrismaticJoint,
  createPhysics2DPulleyJoint,
  createPhysics2DRevoluteJoint,
  createPhysics2DRopeJoint,
  createPhysics2DSolverConfig,
  createPhysics2DWeldJoint,
  createPhysics2DWheelJoint,
  createRigidBody2D,
} from '@flighthq/physics2d/contract';
import type { CollisionBuiltInShape2D, Physics2DJoint } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics2DAbiCommandBuffer } from './physics2DAbiBuffer';
import {
  getPhysics2DAbiSetColliderCommandByteLength,
  writePhysics2DAbiApplyForceAtPointCommand,
  writePhysics2DAbiApplyForceCommand,
  writePhysics2DAbiApplyLinearImpulseAtPointCommand,
  writePhysics2DAbiApplyLinearImpulseCommand,
  writePhysics2DAbiApplyTorqueCommand,
  writePhysics2DAbiDestroyBodyCommand,
  writePhysics2DAbiDestroyColliderCommand,
  writePhysics2DAbiDestroyJointCommand,
  writePhysics2DAbiSetBodyCommand,
  writePhysics2DAbiSetColliderCommand,
  writePhysics2DAbiSetGravityCommand,
  writePhysics2DAbiSetJointCommand,
  writePhysics2DAbiSetSolverConfigCommand,
  writePhysics2DAbiWakeBodyCommand,
} from './physics2DAbiCommand';
import {
  Physics2DAbiCommandByteLength,
  Physics2DAbiCommandHeaderByteLength,
  Physics2DAbiCommandKind,
  Physics2DAbiCommandRecordHeaderByteLength,
  Physics2DAbiJointFlag,
  Physics2DAbiJointKind,
  Physics2DAbiShapeHeaderByteLength,
  Physics2DAbiShapeKind,
} from './physics2DAbiLayout';

const MATERIAL = { density: 1, friction: 0.3, restitution: 0.1 };

function record(buffer: ReturnType<typeof createPhysics2DAbiCommandBuffer>, at = Physics2DAbiCommandHeaderByteLength) {
  const view = new DataView(buffer.data.buffer);
  return {
    view,
    kind: view.getUint32(at, true),
    byteLength: view.getUint32(at + 4, true),
    objectId: view.getUint32(at + 8, true),
    relatedId: view.getUint32(at + 12, true),
    payload: at + Physics2DAbiCommandRecordHeaderByteLength,
  };
}

function body() {
  const value = createRigidBody2D('dynamic', 3, -4, 0.5);
  value.velocityX = 1;
  value.velocityY = 2;
  value.angularVelocity = 3;
  return value;
}

describe('getPhysics2DAbiSetColliderCommandByteLength', () => {
  it('reports the exact length the writer will consume, per shape', () => {
    const shapes: [CollisionBuiltInShape2D, number][] = [
      [{ kind: 'circle', x: 0, y: 0, radius: 1 }, 3],
      [{ kind: 'aabb', minX: -1, minY: -1, maxX: 1, maxY: 1 }, 4],
      [{ kind: 'obb', x: 0, y: 0, halfW: 1, halfH: 2, rotation: 0.5 }, 5],
      [{ kind: 'capsule', x0: -1, y0: 0, x1: 1, y1: 0, radius: 0.5 }, 5],
      [{ kind: 'polygon', points: [0, 0, 1, 0, 0, 1] }, 6],
      [{ kind: 'segment', x0: 0, y0: 0, x1: 1, y1: 1 }, 4],
      [{ kind: 'point', x: 2, y: 3 }, 2],
    ];
    for (const [shape, scalarCount] of shapes) {
      const collider = createPhysics2DCollider(shape, MATERIAL);
      const expected = Physics2DAbiCommandByteLength.SetColliderMinimum + scalarCount * 8;
      expect(getPhysics2DAbiSetColliderCommandByteLength(collider), shape.kind).toBe(expected);

      const buffer = createPhysics2DAbiCommandBuffer(1024);
      expect(writePhysics2DAbiSetColliderCommand(buffer, 1, 1, collider), shape.kind).toBe(true);
      expect(buffer.byteLength - Physics2DAbiCommandHeaderByteLength, shape.kind).toBe(expected);
    }
  });
});

describe('writePhysics2DAbiApplyForceAtPointCommand', () => {
  it('carries the world point in the second pair', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiApplyForceAtPointCommand(buffer, 2, 5, 6, 7, 8)).toBe(true);
    const written = record(buffer);
    expect(written.view.getFloat64(written.payload + 16, true)).toBe(7);
    expect(written.view.getFloat64(written.payload + 24, true)).toBe(8);
  });
});

describe('writePhysics2DAbiApplyForceCommand', () => {
  it('zeroes the point slots a pointless action does not use', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiApplyForceCommand(buffer, 2, 5, 6)).toBe(true);
    const written = record(buffer);
    expect(written.kind).toBe(Physics2DAbiCommandKind.ApplyForce);
    expect(written.view.getFloat64(written.payload, true)).toBe(5);
    expect(written.view.getFloat64(written.payload + 16, true)).toBe(0);
  });
});

describe('writePhysics2DAbiApplyLinearImpulseAtPointCommand', () => {
  it('uses its own discriminant rather than the pointless one', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiApplyLinearImpulseAtPointCommand(buffer, 1, 1, 1, 2, 2)).toBe(true);
    expect(record(buffer).kind).toBe(Physics2DAbiCommandKind.ApplyLinearImpulseAtPoint);
  });
});

describe('writePhysics2DAbiApplyLinearImpulseCommand', () => {
  it('uses its own discriminant rather than the force one', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiApplyLinearImpulseCommand(buffer, 1, 1, 1)).toBe(true);
    expect(record(buffer).kind).toBe(Physics2DAbiCommandKind.ApplyLinearImpulse);
  });
});

describe('writePhysics2DAbiApplyTorqueCommand', () => {
  it('leaves the three unused body-action slots zero', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiApplyTorqueCommand(buffer, 1, 12)).toBe(true);
    const written = record(buffer);
    expect(written.view.getFloat64(written.payload, true)).toBe(12);
    expect(written.view.getFloat64(written.payload + 8, true)).toBe(0);
    expect(written.view.getFloat64(written.payload + 16, true)).toBe(0);
    expect(written.view.getFloat64(written.payload + 24, true)).toBe(0);
  });
});

describe('writePhysics2DAbiDestroyBodyCommand', () => {
  it('writes a header-only record', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiDestroyBodyCommand(buffer, 3)).toBe(true);
    expect(record(buffer).byteLength).toBe(Physics2DAbiCommandRecordHeaderByteLength);
    expect(record(buffer).objectId).toBe(3);
  });
});

describe('writePhysics2DAbiDestroyColliderCommand', () => {
  it('writes a header-only record', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiDestroyColliderCommand(buffer, 4)).toBe(true);
    expect(record(buffer).kind).toBe(Physics2DAbiCommandKind.DestroyCollider);
  });
});

describe('writePhysics2DAbiDestroyJointCommand', () => {
  it('writes a header-only record', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiDestroyJointCommand(buffer, 5)).toBe(true);
    expect(record(buffer).kind).toBe(Physics2DAbiCommandKind.DestroyJoint);
  });
});

describe('writePhysics2DAbiSetBodyCommand', () => {
  it('writes a fixed-length record carrying the seventeen body scalars', () => {
    const buffer = createPhysics2DAbiCommandBuffer(1024);
    expect(writePhysics2DAbiSetBodyCommand(buffer, 9, body())).toBe(true);
    const written = record(buffer);
    expect(written.kind).toBe(Physics2DAbiCommandKind.SetBody);
    expect(written.byteLength).toBe(Physics2DAbiCommandByteLength.SetBody);
    expect(written.objectId).toBe(9);
    expect(written.relatedId).toBe(0);
    expect(written.view.getFloat64(written.payload + 8, true)).toBe(3);
    expect(written.view.getFloat64(written.payload + 16, true)).toBe(-4);
    expect(written.view.getFloat64(written.payload + 24, true)).toBe(0.5);
  });

  it('refuses an id outside the non-zero uint32 range', () => {
    const buffer = createPhysics2DAbiCommandBuffer(1024);
    expect(writePhysics2DAbiSetBodyCommand(buffer, 0, body())).toBe(false);
    expect(writePhysics2DAbiSetBodyCommand(buffer, 1.5, body())).toBe(false);
    expect(buffer.commandCount).toBe(0);
  });

  it('leaves the stream untouched when the record does not fit', () => {
    const buffer = createPhysics2DAbiCommandBuffer(Physics2DAbiCommandHeaderByteLength + 8);
    expect(writePhysics2DAbiSetBodyCommand(buffer, 1, body())).toBe(false);
    expect(buffer.byteLength).toBe(Physics2DAbiCommandHeaderByteLength);
    expect(buffer.commandCount).toBe(0);
  });
});

describe('writePhysics2DAbiSetColliderCommand', () => {
  it('names the body in the related id and encodes the shape inline', () => {
    const buffer = createPhysics2DAbiCommandBuffer(1024);
    const collider = createPhysics2DCollider({ kind: 'circle', x: 1, y: 2, radius: 3 }, MATERIAL, true, {
      categoryBits: 5,
      maskBits: 6,
      groupIndex: -7,
    });
    expect(writePhysics2DAbiSetColliderCommand(buffer, 4, 8, collider)).toBe(true);
    const written = record(buffer);
    expect(written.objectId).toBe(4);
    expect(written.relatedId).toBe(8);
    expect(written.view.getUint32(written.payload, true)).toBe(1);
    expect(written.view.getUint32(written.payload + 4, true)).toBe(5);
    expect(written.view.getUint32(written.payload + 8, true)).toBe(6);
    expect(written.view.getInt32(written.payload + 12, true)).toBe(-7);
    expect(written.view.getFloat64(written.payload + 16, true)).toBe(1);
    const shapeAt = written.payload + 40;
    expect(written.view.getUint32(shapeAt, true)).toBe(Physics2DAbiShapeKind.Circle);
    expect(written.view.getUint32(shapeAt + 4, true)).toBe(3);
    expect(written.view.getUint32(shapeAt + 8, true)).toBe(0);
    expect(written.view.getFloat64(shapeAt + Physics2DAbiShapeHeaderByteLength, true)).toBe(1);
  });

  it('refuses a filter that will not fit its integer field', () => {
    const buffer = createPhysics2DAbiCommandBuffer(1024);
    const collider = createPhysics2DCollider({ kind: 'circle', x: 0, y: 0, radius: 1 }, MATERIAL);
    collider.filter.categoryBits = -1;
    expect(writePhysics2DAbiSetColliderCommand(buffer, 1, 1, collider)).toBe(false);
  });
});

describe('writePhysics2DAbiSetGravityCommand', () => {
  it('carries two components and names no object', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiSetGravityCommand(buffer, 1, -9.81)).toBe(true);
    const written = record(buffer);
    expect(written.kind).toBe(Physics2DAbiCommandKind.SetGravity);
    expect(written.objectId).toBe(0);
    expect(written.view.getFloat64(written.payload, true)).toBe(1);
    expect(written.view.getFloat64(written.payload + 8, true)).toBe(-9.81);
  });
});

describe('writePhysics2DAbiSetJointCommand', () => {
  it('encodes every built-in kind with its own discriminant', () => {
    const cases: [Physics2DJoint, number][] = [
      [createPhysics2DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2 }), Physics2DAbiJointKind.Distance],
      [createPhysics2DRevoluteJoint({ bodyA: 0, bodyB: 1 }), Physics2DAbiJointKind.Revolute],
      [createPhysics2DPrismaticJoint({ bodyA: 0, bodyB: 1 }), Physics2DAbiJointKind.Prismatic],
      [createPhysics2DWeldJoint({ bodyA: 0, bodyB: 1 }), Physics2DAbiJointKind.Weld],
      [createPhysics2DWheelJoint({ bodyA: 0, bodyB: 1 }), Physics2DAbiJointKind.Wheel],
      [createPhysics2DRopeJoint({ bodyA: 0, bodyB: 1, maxLength: 3 }), Physics2DAbiJointKind.Rope],
      [createPhysics2DMouseJoint({ body: 0, targetX: 1, targetY: 2, maxForce: 10 }), Physics2DAbiJointKind.Mouse],
      [
        createPhysics2DPulleyJoint({
          bodyA: 0,
          bodyB: 1,
          groundAnchorAX: 0,
          groundAnchorAY: 4,
          groundAnchorBX: 2,
          groundAnchorBY: 4,
          ratio: 1,
          constant: 6,
        }),
        Physics2DAbiJointKind.Pulley,
      ],
      [
        createPhysics2DGearJoint({
          bodyA: 0,
          bodyB: 1,
          ratio: 2,
          constant: 0,
          coordinateA: 'angular',
          coordinateB: 'angular',
        }),
        Physics2DAbiJointKind.Gear,
      ],
    ];
    for (const [joint, kind] of cases) {
      const buffer = createPhysics2DAbiCommandBuffer(1024);
      expect(writePhysics2DAbiSetJointCommand(buffer, 1, 1, 2, joint), joint.kind).toBe(true);
      const written = record(buffer);
      expect(written.byteLength, joint.kind).toBe(Physics2DAbiCommandByteLength.SetJoint);
      expect(written.view.getUint32(written.payload, true), joint.kind).toBe(kind);
      expect(written.view.getUint32(written.payload + 4, true), joint.kind).toBe(1);
      expect(written.view.getUint32(written.payload + 8, true), joint.kind).toBe(2);
    }
  });

  it('refuses a kind with no wire discriminant rather than writing a zero one', () => {
    const buffer = createPhysics2DAbiCommandBuffer(1024);
    const joint = createPhysics2DDistanceJoint({ bodyA: 0, bodyB: 1, length: 1 });
    expect(writePhysics2DAbiSetJointCommand(buffer, 1, 1, 2, { ...joint, kind: 'acme.Conveyor' })).toBe(false);
    expect(buffer.commandCount).toBe(0);
  });

  it('reads a gear coordinate pair out of the flags it shares with the enable bits', () => {
    const buffer = createPhysics2DAbiCommandBuffer(1024);
    const joint = createPhysics2DGearJoint({
      bodyA: 0,
      bodyB: 1,
      ratio: 1,
      constant: 0,
      coordinateA: 'linear',
      coordinateB: 'angular',
    });
    expect(writePhysics2DAbiSetJointCommand(buffer, 1, 1, 2, joint)).toBe(true);
    const flags = record(buffer).view.getUint32(record(buffer).payload + 12, true);
    expect(flags & Physics2DAbiJointFlag.LinearCoordinateA).toBe(Physics2DAbiJointFlag.LinearCoordinateA);
    expect(flags & Physics2DAbiJointFlag.LinearCoordinateB).toBe(0);
  });
});

describe('writePhysics2DAbiSetSolverConfigCommand', () => {
  it('packs the three booleans into flags and holds the substep word zero', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    const config = createPhysics2DSolverConfig();
    expect(writePhysics2DAbiSetSolverConfigCommand(buffer, config)).toBe(true);
    const written = record(buffer);
    expect(written.byteLength).toBe(Physics2DAbiCommandByteLength.SetSolverConfig);
    expect(written.view.getUint32(written.payload + 4, true)).toBe(0);
    expect(written.view.getUint32(written.payload + 16, true)).toBe(config.velocityIterations);
    expect(written.view.getUint32(written.payload + 20, true)).toBe(config.positionIterations);
    expect(written.view.getFloat64(written.payload + 32, true)).toBe(config.sleepLinearThreshold);
  });

  it('refuses an iteration count that is not a uint32', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(
      writePhysics2DAbiSetSolverConfigCommand(buffer, { ...createPhysics2DSolverConfig(), velocityIterations: -1 }),
    ).toBe(false);
  });
});

describe('writePhysics2DAbiWakeBodyCommand', () => {
  it('writes a header-only record and rejects a zero id', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiWakeBodyCommand(buffer, 0)).toBe(false);
    expect(writePhysics2DAbiWakeBodyCommand(buffer, 6)).toBe(true);
    expect(record(buffer).kind).toBe(Physics2DAbiCommandKind.WakeBody);
  });
});
