import { collideContactManifold2D, createCollisionContactManifold2D } from '@flighthq/collision/contract';
import type { CollisionBuiltInShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  Physics2DAbiBodyFlag,
  Physics2DAbiBodyType,
  Physics2DAbiBodyValue,
  Physics2DAbiBodyValueStride,
  Physics2DAbiCapability,
  Physics2DAbiCommandByteLength,
  Physics2DAbiCommandHeaderByteLength,
  Physics2DAbiCommandHeaderOffset,
  Physics2DAbiCommandKind,
  Physics2DAbiCommandMagic,
  Physics2DAbiCommandRecordHeaderByteLength,
  Physics2DAbiCommandRecordOffset,
  Physics2DAbiContactFlag,
  Physics2DAbiContactId,
  Physics2DAbiContactIdStride,
  Physics2DAbiContactPointValue,
  Physics2DAbiContactPointValueStride,
  Physics2DAbiContactValue,
  Physics2DAbiContactValueStride,
  Physics2DAbiJointCommonValue,
  Physics2DAbiJointFlag,
  Physics2DAbiJointKind,
  Physics2DAbiJointKindValueCount,
  Physics2DAbiJointValue,
  Physics2DAbiJointValueStride,
  Physics2DAbiMaxContactPoints,
  Physics2DAbiQueryValue,
  Physics2DAbiQueryValueStride,
  Physics2DAbiSetBodyPayloadOffset,
  Physics2DAbiSetColliderPayloadOffset,
  Physics2DAbiSetJointPayloadOffset,
  Physics2DAbiSetSolverConfigPayloadOffset,
  Physics2DAbiShapeHeaderByteLength,
  Physics2DAbiShapeHeaderOffset,
  Physics2DAbiShapeKind,
  Physics2DAbiSolverConfigFlag,
  Physics2DAbiSolverConfigValue,
  Physics2DAbiVersion,
} from './physics2DAbiLayout';

describe('Physics2DAbiBodyFlag', () => {
  it('reserves the low two bits for the type and one bit each above it', () => {
    expect(Physics2DAbiBodyFlag.TypeMask).toBe(0b11);
    expect(Object.values(Physics2DAbiBodyType)).toEqual([0, 1, 2]);
    for (const type of Object.values(Physics2DAbiBodyType)) expect(type & Physics2DAbiBodyFlag.TypeMask).toBe(type);
    expect(Physics2DAbiBodyFlag.FixedRotation).toBe(4);
    expect(Physics2DAbiBodyFlag.SleepEnabled).toBe(32);
  });
});

// These constants ARE the wire contract. A test that recomputed them from the source would agree with
// any change, so every number here is written out literally: changing one has to be a deliberate edit
// in two places, which is the only thing that makes a version bump a decision rather than an accident.
describe('Physics2DAbiBodyValue', () => {
  it('indexes seventeen authored body scalars in wire order', () => {
    expect(Physics2DAbiBodyValueStride).toBe(17);
    expect(Object.values(Physics2DAbiBodyValue)).toEqual([...Array(17).keys()]);
    expect(Physics2DAbiBodyValue.X).toBe(0);
    expect(Physics2DAbiBodyValue.Angle).toBe(2);
    expect(Physics2DAbiBodyValue.Mass).toBe(9);
    expect(Physics2DAbiBodyValue.SleepTimer).toBe(16);
  });
});

describe('Physics2DAbiCapability', () => {
  it('declares one bit per optional backend feature', () => {
    expect(Physics2DAbiCapability).toEqual({
      ContactHooks: 1,
      PersistentWorlds: 2,
      Queries: 4,
      SelectiveReadback: 8,
    });
  });
});

describe('Physics2DAbiCommandByteLength', () => {
  it('keeps every record eight-aligned and consistent with its payload', () => {
    for (const [name, byteLength] of Object.entries(Physics2DAbiCommandByteLength)) {
      expect(byteLength % 8, name).toBe(0);
      expect(byteLength, name).toBeGreaterThanOrEqual(Physics2DAbiCommandRecordHeaderByteLength);
    }
    expect(Physics2DAbiCommandByteLength.SetGravity).toBe(Physics2DAbiCommandRecordHeaderByteLength + 2 * 8);
    expect(Physics2DAbiCommandByteLength.SetBody).toBe(
      Physics2DAbiCommandRecordHeaderByteLength + Physics2DAbiSetBodyPayloadOffset.Values + 17 * 8,
    );
    expect(Physics2DAbiCommandByteLength.SetJoint).toBe(
      Physics2DAbiCommandRecordHeaderByteLength + Physics2DAbiSetJointPayloadOffset.KindValues + 9 * 8,
    );
    expect(Physics2DAbiCommandByteLength.SetSolverConfig).toBe(
      Physics2DAbiCommandRecordHeaderByteLength + Physics2DAbiSetSolverConfigPayloadOffset.Values + 6 * 8,
    );
    expect(Physics2DAbiCommandByteLength.BodyAction).toBe(Physics2DAbiCommandRecordHeaderByteLength + 4 * 8);
    expect(Physics2DAbiCommandByteLength.SetColliderMinimum).toBe(
      Physics2DAbiCommandRecordHeaderByteLength +
        Physics2DAbiSetColliderPayloadOffset.Shape +
        Physics2DAbiShapeHeaderByteLength,
    );
  });
});

describe('Physics2DAbiCommandKind', () => {
  it('assigns each command a stable discriminant', () => {
    expect(Physics2DAbiCommandKind).toEqual({
      SetGravity: 1,
      SetSolverConfig: 2,
      SetBody: 3,
      DestroyBody: 4,
      SetCollider: 5,
      DestroyCollider: 6,
      SetJoint: 7,
      DestroyJoint: 8,
      ApplyForce: 9,
      ApplyForceAtPoint: 10,
      ApplyLinearImpulse: 11,
      ApplyLinearImpulseAtPoint: 12,
      ApplyTorque: 13,
      WakeBody: 14,
    });
  });
});

describe('Physics2DAbiCommandMagic', () => {
  it('spells P2DA, distinguishing the stream from the 3D one at the header', () => {
    expect(Physics2DAbiCommandMagic).toBe(0x41443250);
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, Physics2DAbiCommandMagic, true);
    expect(String.fromCharCode(...bytes)).toBe('P2DA');
    expect(Physics2DAbiVersion).toBe(1);
    expect(Physics2DAbiCommandHeaderByteLength).toBe(16);
    expect(Physics2DAbiCommandHeaderOffset).toEqual({ Magic: 0, Version: 4, ByteLength: 8, CommandCount: 12 });
    expect(Physics2DAbiCommandRecordOffset).toEqual({ Kind: 0, ByteLength: 4, ObjectId: 8, RelatedId: 12 });
  });
});

describe('Physics2DAbiContactFlag', () => {
  it('names the three contact states the standard record carries', () => {
    expect(Physics2DAbiContactFlag).toEqual({ Enabled: 1, Sensor: 2, Touching: 4 });
  });
});

describe('Physics2DAbiContactValue', () => {
  it('sizes a manifold to the exact planar bound of two points', () => {
    expect(Physics2DAbiMaxContactPoints).toBe(2);
    expect(Physics2DAbiContactIdStride).toBe(4);
    expect(Physics2DAbiContactValueStride).toBe(4);
    expect(Physics2DAbiContactPointValueStride).toBe(7);
    expect(Object.values(Physics2DAbiContactId)).toEqual([0, 1, 2, 3]);
    expect(Object.values(Physics2DAbiContactValue)).toEqual([0, 1, 2, 3]);
    expect(Object.values(Physics2DAbiContactPointValue)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('Physics2DAbiJointFlag', () => {
  it('overlays the gear coordinate bits on the enable bits, which no kind uses together', () => {
    expect(Physics2DAbiJointFlag.CollideConnected).toBe(1);
    expect(Physics2DAbiJointFlag.Broken).toBe(2);
    // Deliberate aliasing: a record carries exactly one kind, so a gear's coordinates and a revolute's
    // motor/limit bits can share positions 2 and 3 without either ever reading the other's meaning.
    expect(Physics2DAbiJointFlag.LinearCoordinateA).toBe(Physics2DAbiJointFlag.EnableMotor);
    expect(Physics2DAbiJointFlag.LinearCoordinateB).toBe(Physics2DAbiJointFlag.EnableLimit);
  });
});

describe('Physics2DAbiJointKind', () => {
  it('covers all nine built-in 2D joints', () => {
    expect(Physics2DAbiJointKind).toEqual({
      Distance: 1,
      Revolute: 2,
      Prismatic: 3,
      Weld: 4,
      Wheel: 5,
      Rope: 6,
      Mouse: 7,
      Pulley: 8,
      Gear: 9,
    });
    expect(Physics2DAbiJointKindValueCount).toBe(9);
    expect(Object.values(Physics2DAbiJointCommonValue)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Object.values(Physics2DAbiJointValue)).toEqual([0, 1, 2]);
    expect(Physics2DAbiJointValueStride).toBe(3);
  });
});

describe('Physics2DAbiMaxContactPoints', () => {
  it('is not exceeded by any built-in 2D manifold, swept rather than argued', () => {
    // The hook buffer reserves exactly this many point slots, and `writeContact` clamps to it. That the
    // planar bound is two is a geometric argument in a comment; collision exports no 2D counterpart to
    // MAX_COLLISION_CONTACT_POINTS_3D to check it against, so this sweeps the pair matrix instead. If a
    // future shape or manifold change produces a third point, a contact hook would silently see a
    // truncated manifold, and this is what would say so.
    const shapes: CollisionBuiltInShape2D[] = [
      { kind: 'circle', x: 0, y: 0, radius: 0.6 },
      { kind: 'aabb', minX: -0.6, minY: -0.6, maxX: 0.6, maxY: 0.6 },
      { kind: 'obb', x: 0, y: 0, halfW: 0.6, halfH: 0.4, rotation: 0 },
      { kind: 'capsule', x0: -0.5, y0: 0, x1: 0.5, y1: 0, radius: 0.35 },
      { kind: 'polygon', points: [-0.6, -0.5, 0.6, -0.5, 0.7, 0.4, -0.4, 0.6] },
    ];
    const manifold = createCollisionContactManifold2D();
    let widest = 0;
    let overlaps = 0;
    for (const a of shapes) {
      for (const b of shapes) {
        // Slide one shape across the other on both axes and at several angles, so face-face,
        // face-vertex, and end-on arrangements are all reached rather than one lucky pose.
        for (let step = -12; step <= 12; step += 1) {
          const offset = step * 0.1;
          for (const rotation of [0, 0.37, Math.PI / 4, 1.2]) {
            const moved = translateShape(b, offset, offset * 0.5, rotation);
            if (!collideContactManifold2D(a, moved, manifold)) continue;
            overlaps += 1;
            widest = Math.max(widest, manifold.pointCount);
          }
        }
      }
    }
    // The sweep has to actually collide things, or "never exceeded" is a statement about no manifolds.
    expect(overlaps).toBeGreaterThan(100);
    expect(widest).toBe(Physics2DAbiMaxContactPoints);
  });
});

describe('Physics2DAbiQueryValue', () => {
  it('carries fraction, point, and normal in five slots', () => {
    expect(Physics2DAbiQueryValueStride).toBe(5);
    expect(Physics2DAbiQueryValue).toEqual({ Fraction: 0, X: 1, Y: 2, NormalX: 3, NormalY: 4 });
  });
});

describe('Physics2DAbiShapeKind', () => {
  it('covers all seven built-in 2D shapes, including the two area-less ones', () => {
    expect(Physics2DAbiShapeKind).toEqual({
      Circle: 1,
      Aabb: 2,
      Obb: 3,
      Capsule: 4,
      Polygon: 5,
      Segment: 6,
      Point: 7,
    });
    expect(Physics2DAbiShapeHeaderByteLength).toBe(16);
    expect(Physics2DAbiShapeHeaderOffset).toEqual({
      Kind: 0,
      ScalarCount: 4,
      IntegerCount: 8,
      Version: 12,
      Scalars: 16,
    });
  });
});

describe('Physics2DAbiSolverConfigFlag', () => {
  it('holds the substep word zero, since Physics2D has no substeps', () => {
    expect(Physics2DAbiSolverConfigFlag).toEqual({ AllowSleeping: 1, ContinuousCollision: 2, WarmStarting: 4 });
    expect(Physics2DAbiSetSolverConfigPayloadOffset.Reserved0).toBe(4);
    expect(Object.values(Physics2DAbiSolverConfigValue)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

// Moves a shape by (dx, dy), additionally rotating the kinds that carry an angle so the sweep reaches
// arrangements an axis-aligned slide never would.
function translateShape(shape: Readonly<CollisionBuiltInShape2D>, dx: number, dy: number, rotation: number) {
  if (shape.kind === 'circle') return { ...shape, x: shape.x + dx, y: shape.y + dy };
  if (shape.kind === 'aabb') {
    return { ...shape, minX: shape.minX + dx, minY: shape.minY + dy, maxX: shape.maxX + dx, maxY: shape.maxY + dy };
  }
  if (shape.kind === 'obb') return { ...shape, x: shape.x + dx, y: shape.y + dy, rotation };
  if (shape.kind === 'capsule') {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      ...shape,
      x0: shape.x0 * cos - shape.y0 * sin + dx,
      y0: shape.x0 * sin + shape.y0 * cos + dy,
      x1: shape.x1 * cos - shape.y1 * sin + dx,
      y1: shape.x1 * sin + shape.y1 * cos + dy,
    };
  }
  if (shape.kind !== 'polygon') return shape;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const points: number[] = [];
  for (let i = 0; i < shape.points.length; i += 2) {
    const x = shape.points[i];
    const y = shape.points[i + 1];
    points.push(x * cos - y * sin + dx, x * sin + y * cos + dy);
  }
  return { ...shape, points };
}
