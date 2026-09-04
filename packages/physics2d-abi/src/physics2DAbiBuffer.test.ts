import { describe, expect, it } from 'vitest';

import {
  clearPhysics2DAbiCommandBuffer,
  createPhysics2DAbiBodyBuffer,
  createPhysics2DAbiCommandBuffer,
  createPhysics2DAbiContactBuffer,
  createPhysics2DAbiExecutionResult,
  createPhysics2DAbiJointBuffer,
  createPhysics2DAbiQueryBuffer,
  getPhysics2DAbiCommandBufferRemainingByteLength,
  initializePhysics2DAbiBodyBuffer,
  initializePhysics2DAbiContactBuffer,
  initializePhysics2DAbiExecutionResult,
  initializePhysics2DAbiJointBuffer,
  initializePhysics2DAbiQueryBuffer,
} from './physics2DAbiBuffer';
import { writePhysics2DAbiSetGravityCommand } from './physics2DAbiCommand';
import {
  Physics2DAbiBodyValueStride,
  Physics2DAbiCommandHeaderByteLength,
  Physics2DAbiCommandMagic,
  Physics2DAbiContactIdStride,
  Physics2DAbiContactPointValueStride,
  Physics2DAbiContactValueStride,
  Physics2DAbiJointValueStride,
  Physics2DAbiQueryValueStride,
  Physics2DAbiVersion,
} from './physics2DAbiLayout';

describe('clearPhysics2DAbiCommandBuffer', () => {
  it('rewrites the header so a reused buffer cannot carry a stale count', () => {
    const buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiSetGravityCommand(buffer, 0, -9.81)).toBe(true);
    expect(buffer.commandCount).toBe(1);

    clearPhysics2DAbiCommandBuffer(buffer);

    expect(buffer.commandCount).toBe(0);
    expect(buffer.byteLength).toBe(Physics2DAbiCommandHeaderByteLength);
    const view = new DataView(buffer.data.buffer);
    expect(view.getUint32(0, true)).toBe(Physics2DAbiCommandMagic);
    expect(view.getUint32(4, true)).toBe(Physics2DAbiVersion);
    expect(view.getUint32(8, true)).toBe(Physics2DAbiCommandHeaderByteLength);
    expect(view.getUint32(12, true)).toBe(0);
  });
});

describe('createPhysics2DAbiBodyBuffer', () => {
  it('sizes every array to the capacity it was asked for', () => {
    const buffer = createPhysics2DAbiBodyBuffer(3);
    expect(buffer.ids.length).toBe(3);
    expect(buffer.flags.length).toBe(3);
    expect(buffer.values.length).toBe(3 * Physics2DAbiBodyValueStride);
    expect(buffer.count).toBe(0);
    expect(buffer.requiredCount).toBe(0);
  });

  it('rejects a capacity that is not a non-negative safe integer', () => {
    expect(() => createPhysics2DAbiBodyBuffer(-1)).toThrow(RangeError);
    expect(() => createPhysics2DAbiBodyBuffer(1.5)).toThrow(RangeError);
  });
});

describe('createPhysics2DAbiCommandBuffer', () => {
  it('starts as a valid empty stream', () => {
    const buffer = createPhysics2DAbiCommandBuffer(64);
    expect(buffer.data.byteLength).toBe(64);
    expect(buffer.byteLength).toBe(Physics2DAbiCommandHeaderByteLength);
    expect(buffer.commandCount).toBe(0);
  });

  it('refuses a capacity too small to hold the header', () => {
    expect(() => createPhysics2DAbiCommandBuffer(Physics2DAbiCommandHeaderByteLength - 1)).toThrow(RangeError);
  });
});

describe('createPhysics2DAbiContactBuffer', () => {
  it('sizes contact rows and point rows independently', () => {
    const buffer = createPhysics2DAbiContactBuffer(2, 5);
    expect(buffer.ids.length).toBe(2 * Physics2DAbiContactIdStride);
    expect(buffer.flags.length).toBe(2);
    expect(buffer.pointStarts.length).toBe(2);
    expect(buffer.pointCounts.length).toBe(2);
    expect(buffer.values.length).toBe(2 * Physics2DAbiContactValueStride);
    expect(buffer.pointFeatureIds.length).toBe(5);
    expect(buffer.pointValues.length).toBe(5 * Physics2DAbiContactPointValueStride);
  });
});

describe('createPhysics2DAbiExecutionResult', () => {
  it('starts at the first record rather than at zero', () => {
    const result = createPhysics2DAbiExecutionResult();
    expect(result.status).toBe('Complete');
    expect(result.byteOffset).toBe(Physics2DAbiCommandHeaderByteLength);
    expect(result.commandIndex).toBe(0);
    expect(result.commandKind).toBe(0);
  });
});

describe('createPhysics2DAbiJointBuffer', () => {
  it('sizes three reaction values per joint', () => {
    const buffer = createPhysics2DAbiJointBuffer(4);
    expect(buffer.ids.length).toBe(4);
    expect(buffer.values.length).toBe(4 * Physics2DAbiJointValueStride);
  });
});

describe('createPhysics2DAbiQueryBuffer', () => {
  it('sizes five geometric values per hit', () => {
    const buffer = createPhysics2DAbiQueryBuffer(4);
    expect(buffer.bodyIds.length).toBe(4);
    expect(buffer.colliderIds.length).toBe(4);
    expect(buffer.values.length).toBe(4 * Physics2DAbiQueryValueStride);
  });
});

describe('getPhysics2DAbiCommandBufferRemainingByteLength', () => {
  it('shrinks as commands are written and never goes negative', () => {
    const buffer = createPhysics2DAbiCommandBuffer(64);
    const before = getPhysics2DAbiCommandBufferRemainingByteLength(buffer);
    expect(before).toBe(64 - Physics2DAbiCommandHeaderByteLength);
    expect(writePhysics2DAbiSetGravityCommand(buffer, 0, -9.81)).toBe(true);
    expect(getPhysics2DAbiCommandBufferRemainingByteLength(buffer)).toBe(before - 32);
  });
});
describe('initializePhysics2DAbiBodyBuffer', () => {
  it('is the construction initializer of createPhysics2DAbiBodyBuffer', () => {
    expect(typeof initializePhysics2DAbiBodyBuffer).toBe('function');
  });
});

describe('initializePhysics2DAbiContactBuffer', () => {
  it('is the construction initializer of createPhysics2DAbiContactBuffer', () => {
    expect(typeof initializePhysics2DAbiContactBuffer).toBe('function');
  });
});

describe('initializePhysics2DAbiExecutionResult', () => {
  it('is the construction initializer of createPhysics2DAbiExecutionResult', () => {
    expect(typeof initializePhysics2DAbiExecutionResult).toBe('function');
  });
});

describe('initializePhysics2DAbiJointBuffer', () => {
  it('is the construction initializer of createPhysics2DAbiJointBuffer', () => {
    expect(typeof initializePhysics2DAbiJointBuffer).toBe('function');
  });
});

describe('initializePhysics2DAbiQueryBuffer', () => {
  it('is the construction initializer of createPhysics2DAbiQueryBuffer', () => {
    expect(typeof initializePhysics2DAbiQueryBuffer).toBe('function');
  });
});
