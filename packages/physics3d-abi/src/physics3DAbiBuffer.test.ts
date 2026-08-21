import { describe, expect, it } from 'vitest';

import {
  clearPhysics3DAbiCommandBuffer,
  createPhysics3DAbiBodyBuffer,
  createPhysics3DAbiCommandBuffer,
  createPhysics3DAbiContactBuffer,
  createPhysics3DAbiExecutionResult,
  createPhysics3DAbiJointBuffer,
  createPhysics3DAbiQueryBuffer,
  getPhysics3DAbiCommandBufferRemainingByteLength,
} from './physics3DAbiBuffer';
import {
  Physics3DAbiBodyValueStride,
  Physics3DAbiCommandHeaderByteLength,
  Physics3DAbiCommandMagic,
  Physics3DAbiContactIdStride,
  Physics3DAbiContactPointValueStride,
  Physics3DAbiContactValueStride,
  Physics3DAbiJointValueStride,
  Physics3DAbiQueryValueStride,
  Physics3DAbiVersion,
} from './physics3DAbiLayout';

describe('clearPhysics3DAbiCommandBuffer', () => {
  it('rewrites the canonical little-endian header and resets the published stream', () => {
    const out = createPhysics3DAbiCommandBuffer(64);
    out.data.fill(0xff);
    out.byteLength = 64;
    out.commandCount = 3;

    clearPhysics3DAbiCommandBuffer(out);

    const view = new DataView(out.data.buffer);
    expect(view.getUint32(0, true)).toBe(Physics3DAbiCommandMagic);
    expect(view.getUint32(4, true)).toBe(Physics3DAbiVersion);
    expect(view.getUint32(8, true)).toBe(Physics3DAbiCommandHeaderByteLength);
    expect(view.getUint32(12, true)).toBe(0);
    expect(out.byteLength).toBe(Physics3DAbiCommandHeaderByteLength);
    expect(out.commandCount).toBe(0);
  });
});

describe('createPhysics3DAbiBodyBuffer', () => {
  it('allocates the documented structure-of-arrays capacity', () => {
    const out = createPhysics3DAbiBodyBuffer(3);
    expect(out.ids).toHaveLength(3);
    expect(out.flags).toHaveLength(3);
    expect(out.values).toHaveLength(3 * Physics3DAbiBodyValueStride);
    expect([out.count, out.requiredCount]).toEqual([0, 0]);
  });
});

describe('createPhysics3DAbiCommandBuffer', () => {
  it('allocates only through an explicit byte capacity', () => {
    const out = createPhysics3DAbiCommandBuffer(80);
    expect(out.data).toHaveLength(80);
    expect(out.byteLength).toBe(Physics3DAbiCommandHeaderByteLength);
  });

  it('rejects a capacity that cannot hold the stream header', () => {
    expect(() => createPhysics3DAbiCommandBuffer(15)).toThrow(RangeError);
  });
});

describe('createPhysics3DAbiContactBuffer', () => {
  it('allocates contact and point capacities independently', () => {
    const out = createPhysics3DAbiContactBuffer(2, 5);
    expect(out.ids).toHaveLength(2 * Physics3DAbiContactIdStride);
    expect(out.values).toHaveLength(2 * Physics3DAbiContactValueStride);
    expect(out.pointFeatureIds).toHaveLength(5);
    expect(out.pointValues).toHaveLength(5 * Physics3DAbiContactPointValueStride);
  });
});

describe('createPhysics3DAbiExecutionResult', () => {
  it('starts at a complete empty stream boundary', () => {
    expect(createPhysics3DAbiExecutionResult()).toEqual({
      status: 'Complete',
      commandIndex: 0,
      byteOffset: Physics3DAbiCommandHeaderByteLength,
      commandKind: 0,
    });
  });
});

describe('createPhysics3DAbiJointBuffer', () => {
  it('allocates one reaction row per joint', () => {
    const out = createPhysics3DAbiJointBuffer(4);
    expect(out.ids).toHaveLength(4);
    expect(out.flags).toHaveLength(4);
    expect(out.values).toHaveLength(4 * Physics3DAbiJointValueStride);
  });
});

describe('createPhysics3DAbiQueryBuffer', () => {
  it('allocates identity and geometry rows at the same capacity', () => {
    const out = createPhysics3DAbiQueryBuffer(6);
    expect(out.bodyIds).toHaveLength(6);
    expect(out.colliderIds).toHaveLength(6);
    expect(out.values).toHaveLength(6 * Physics3DAbiQueryValueStride);
  });

  it('rejects negative and fractional capacities', () => {
    expect(() => createPhysics3DAbiQueryBuffer(-1)).toThrow(RangeError);
    expect(() => createPhysics3DAbiQueryBuffer(1.5)).toThrow(RangeError);
  });
});

describe('getPhysics3DAbiCommandBufferRemainingByteLength', () => {
  it('reports capacity after the published prefix without going negative', () => {
    const out = createPhysics3DAbiCommandBuffer(64);
    expect(getPhysics3DAbiCommandBufferRemainingByteLength(out)).toBe(48);
    out.byteLength = 80;
    expect(getPhysics3DAbiCommandBufferRemainingByteLength(out)).toBe(0);
  });
});
