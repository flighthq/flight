import { MAX_COLLISION_CONTACT_POINTS_3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  Physics3DAbiBodyValue,
  Physics3DAbiBodyValueStride,
  Physics3DAbiCommandByteLength,
  Physics3DAbiCommandHeaderByteLength,
  Physics3DAbiCommandKind,
  Physics3DAbiCommandMagic,
  Physics3DAbiCommandRecordHeaderByteLength,
  Physics3DAbiContactId,
  Physics3DAbiContactIdStride,
  Physics3DAbiContactPointValue,
  Physics3DAbiContactPointValueStride,
  Physics3DAbiContactValue,
  Physics3DAbiContactValueStride,
  Physics3DAbiJointKind,
  Physics3DAbiJointValue,
  Physics3DAbiJointValueStride,
  Physics3DAbiMaxContactPoints,
  Physics3DAbiQueryValue,
  Physics3DAbiQueryValueStride,
  Physics3DAbiSetColliderPayloadOffset,
  Physics3DAbiShapeHeaderByteLength,
  Physics3DAbiShapeKind,
  Physics3DAbiVersion,
} from './physics3DAbiLayout';

describe('Physics3D ABI wire layout', () => {
  it('locks the version, magic bytes, and record framing', () => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, Physics3DAbiCommandMagic, true);
    expect(new TextDecoder().decode(bytes)).toBe('P3DA');
    expect(Physics3DAbiVersion).toBe(1);
    expect(Physics3DAbiCommandHeaderByteLength).toBe(16);
    expect(Physics3DAbiCommandRecordHeaderByteLength).toBe(16);
  });

  it('locks command, shape, and joint discriminants independently', () => {
    expect(Physics3DAbiCommandKind).toEqual({
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
    expect(Object.values(Physics3DAbiShapeKind)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Object.values(Physics3DAbiJointKind)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps every structure-of-arrays index map dense and stride-terminated', () => {
    expect(Math.max(...Object.values(Physics3DAbiBodyValue)) + 1).toBe(Physics3DAbiBodyValueStride);
    expect(Math.max(...Object.values(Physics3DAbiContactId)) + 1).toBe(Physics3DAbiContactIdStride);
    expect(Math.max(...Object.values(Physics3DAbiContactValue)) + 1).toBe(Physics3DAbiContactValueStride);
    expect(Math.max(...Object.values(Physics3DAbiContactPointValue)) + 1).toBe(Physics3DAbiContactPointValueStride);
    expect(Math.max(...Object.values(Physics3DAbiJointValue)) + 1).toBe(Physics3DAbiJointValueStride);
    expect(Math.max(...Object.values(Physics3DAbiQueryValue)) + 1).toBe(Physics3DAbiQueryValueStride);
  });

  it('ties variable collider framing and hook capacity to their structural bounds', () => {
    expect(Physics3DAbiCommandByteLength.SetColliderMinimum).toBe(
      Physics3DAbiCommandRecordHeaderByteLength +
        Physics3DAbiSetColliderPayloadOffset.Shape +
        Physics3DAbiShapeHeaderByteLength,
    );
    expect(Physics3DAbiMaxContactPoints).toBe(MAX_COLLISION_CONTACT_POINTS_3D);
  });
});
