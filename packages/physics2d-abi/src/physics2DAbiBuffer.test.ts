// Generated from crates/flight-physics2d-abi/tests/physics2d_abi_buffer_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

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
  clearPhysics2DAbiCommandBuffer,
  createPhysics2DAbiBodyBuffer,
  createPhysics2DAbiCommandBuffer,
  createPhysics2DAbiContactBuffer,
  createPhysics2DAbiExecutionResult,
  createPhysics2DAbiJointBuffer,
  createPhysics2DAbiQueryBuffer,
  getPhysics2DAbiCommandBufferRemainingByteLength,
  initializePhysics2DAbiBodyBuffer,
  initializePhysics2DAbiCommandBuffer,
  initializePhysics2DAbiContactBuffer,
  initializePhysics2DAbiExecutionResult,
  initializePhysics2DAbiJointBuffer,
  initializePhysics2DAbiQueryBuffer,
  writePhysics2DAbiSetGravityCommand,
} from './contract.ts';
import type { Physics2DAbiCommandBuffer } from './types.ts';

const UNSAFE_CAPACITY: number = 1 * 2 ** 53;

function readHeaderWord(buffer: Readonly<Physics2DAbiCommandBuffer>, at: number): number {
  return new DataView(new Uint8Array(buffer.data.slice(at, at + 4)!).buffer).getUint32(0, true);
}

describe('clearPhysics2DAbiCommandBuffer', () => {
  it('rewrites the header so a reused buffer cannot carry a stale count', () => {
    let buffer = createPhysics2DAbiCommandBuffer(256);
    expect(writePhysics2DAbiSetGravityCommand(buffer, 0, -9.81)).toBe(true);
    expect(buffer.commandCount).toEqual(1);
    clearPhysics2DAbiCommandBuffer(buffer);
    expect(buffer.commandCount).toEqual(0);
    expect(buffer.byteLength).toEqual(Physics2DAbiCommandHeaderByteLength);
    expect(readHeaderWord(buffer, 0)).toEqual(Physics2DAbiCommandMagic);
    expect(readHeaderWord(buffer, 4)).toEqual(Physics2DAbiVersion);
    expect(readHeaderWord(buffer, 8)).toEqual(Physics2DAbiCommandHeaderByteLength >>> 0);
    expect(readHeaderWord(buffer, 12)).toEqual(0);
  });
});

describe('createPhysics2DAbiBodyBuffer', () => {
  it('sizes every array to the capacity it was asked for', () => {
    const buffer = createPhysics2DAbiBodyBuffer(3);
    expect(buffer.ids.length).toEqual(3);
    expect(buffer.flags.length).toEqual(3);
    expect(buffer.values.length).toEqual(3 * Physics2DAbiBodyValueStride);
    expect(buffer.count).toEqual(0);
    expect(buffer.requiredCount).toEqual(0);
  });
  it('rejects a capacity that is not a non negative safe integer', () => {
    expect(() => {
      createPhysics2DAbiBodyBuffer(UNSAFE_CAPACITY);
    }, 'expected a RangeError').toThrow(
      new RangeError('Physics2D ABI body capacity must be a non-negative safe integer'),
    );
  });
});

describe('createPhysics2DAbiCommandBuffer', () => {
  it('starts as a valid empty stream', () => {
    const buffer = createPhysics2DAbiCommandBuffer(64);
    expect(buffer.data.length).toEqual(64);
    expect(buffer.byteLength).toEqual(Physics2DAbiCommandHeaderByteLength);
    expect(buffer.commandCount).toEqual(0);
    expect(readHeaderWord(buffer, 0)).toEqual(Physics2DAbiCommandMagic);
  });
  it('defaults to four kibibytes', () => {
    expect(createPhysics2DAbiCommandBuffer(undefined).data.length).toEqual(4096);
  });
  it('refuses a capacity too small to hold the header', () => {
    expect(() => {
      createPhysics2DAbiCommandBuffer(Physics2DAbiCommandHeaderByteLength - 1);
    }, 'expected a RangeError').toThrow(new RangeError('Physics2D ABI command capacity must be at least 16'));
  });
});

describe('createPhysics2DAbiContactBuffer', () => {
  it('sizes contact rows and point rows independently', () => {
    const buffer = createPhysics2DAbiContactBuffer(2, 5);
    expect(buffer.ids.length).toEqual(2 * Physics2DAbiContactIdStride);
    expect(buffer.flags.length).toEqual(2);
    expect(buffer.pointStarts.length).toEqual(2);
    expect(buffer.pointCounts.length).toEqual(2);
    expect(buffer.values.length).toEqual(2 * Physics2DAbiContactValueStride);
    expect(buffer.pointFeatureIds.length).toEqual(5);
    expect(buffer.pointValues.length).toEqual(5 * Physics2DAbiContactPointValueStride);
  });
});

describe('createPhysics2DAbiExecutionResult', () => {
  it('starts at the first record rather than at zero', () => {
    const result = createPhysics2DAbiExecutionResult();
    expect(result.status).toEqual('Complete');
    expect(result.byteOffset).toEqual(Physics2DAbiCommandHeaderByteLength);
    expect(result.commandIndex).toEqual(0);
    expect(result.commandKind).toEqual(0);
  });
});

describe('createPhysics2DAbiJointBuffer', () => {
  it('sizes three reaction values per joint', () => {
    const buffer = createPhysics2DAbiJointBuffer(4);
    expect(buffer.ids.length).toEqual(4);
    expect(buffer.flags.length).toEqual(4);
    expect(buffer.values.length).toEqual(4 * Physics2DAbiJointValueStride);
  });
});

describe('createPhysics2DAbiQueryBuffer', () => {
  it('sizes five geometric values per hit', () => {
    const buffer = createPhysics2DAbiQueryBuffer(4);
    expect(buffer.bodyIds.length).toEqual(4);
    expect(buffer.colliderIds.length).toEqual(4);
    expect(buffer.values.length).toEqual(4 * Physics2DAbiQueryValueStride);
  });
});

describe('getPhysics2DAbiCommandBufferRemainingByteLength', () => {
  it('shrinks as commands are written and never goes negative', () => {
    let buffer = createPhysics2DAbiCommandBuffer(64);
    const before = getPhysics2DAbiCommandBufferRemainingByteLength(buffer);
    expect(before).toEqual(64 - Physics2DAbiCommandHeaderByteLength);
    expect(writePhysics2DAbiSetGravityCommand(buffer, 0, -9.81)).toBe(true);
    expect(getPhysics2DAbiCommandBufferRemainingByteLength(buffer)).toEqual(before - 32);
    buffer.byteLength = buffer.data.length + 8;
    expect(getPhysics2DAbiCommandBufferRemainingByteLength(buffer)).toEqual(0);
  });
});

describe('initializePhysics2DAbiBodyBuffer', () => {
  it('is the construction initializer of create physics2d abi body buffer', () => {
    let buffer = createPhysics2DAbiBodyBuffer(1);
    const id = buffer;
    buffer.count = 1;
    buffer.requiredCount = 4;
    initializePhysics2DAbiBodyBuffer(buffer, 2);
    expect(buffer.ids.length).toEqual(2);
    expect(buffer.values.length).toEqual(2 * Physics2DAbiBodyValueStride);
    expect([buffer.count, buffer.requiredCount]).toEqual([0, 0]);
    expect(buffer).toBe(id);
  });
});

describe('initializePhysics2DAbiCommandBuffer', () => {
  it('is the construction initializer of create physics2d abi command buffer', () => {
    let buffer = createPhysics2DAbiCommandBuffer(64);
    const id = buffer;
    expect(writePhysics2DAbiSetGravityCommand(buffer, 1, 2)).toBe(true);
    initializePhysics2DAbiCommandBuffer(buffer, 32);
    expect(buffer.data.length).toEqual(32);
    expect(buffer.byteLength).toEqual(Physics2DAbiCommandHeaderByteLength);
    expect(buffer.commandCount).toEqual(0);
    expect(readHeaderWord(buffer, 0)).toEqual(Physics2DAbiCommandMagic);
    expect(buffer).toBe(id);
  });
});

describe('initializePhysics2DAbiContactBuffer', () => {
  it('is the construction initializer of create physics2d abi contact buffer', () => {
    let buffer = createPhysics2DAbiContactBuffer(1, 1);
    buffer.count = 1;
    buffer.pointCount = 1;
    buffer.requiredCount = 3;
    buffer.requiredPointCount = 5;
    initializePhysics2DAbiContactBuffer(buffer, 3, 4);
    expect(buffer.flags.length).toEqual(3);
    expect(buffer.pointFeatureIds.length).toEqual(4);
    expect([buffer.count, buffer.pointCount, buffer.requiredCount, buffer.requiredPointCount]).toEqual([0, 0, 0, 0]);
  });
  it('rejects an unsafe point capacity', () => {
    expect(() => {
      createPhysics2DAbiContactBuffer(1, UNSAFE_CAPACITY);
    }, 'expected a RangeError').toThrow(
      new RangeError('Physics2D ABI contact point capacity must be a non-negative safe integer'),
    );
  });
});

describe('initializePhysics2DAbiExecutionResult', () => {
  it('is the construction initializer of create physics2d abi execution result', () => {
    let result = createPhysics2DAbiExecutionResult();
    result.status = 'InvalidBuffer';
    result.commandIndex = 3;
    result.byteOffset = 99;
    result.commandKind = 7;
    initializePhysics2DAbiExecutionResult(result);
    expect(result.status).toEqual('Complete');
    expect(result.byteOffset).toEqual(Physics2DAbiCommandHeaderByteLength);
    expect([result.commandIndex, result.commandKind]).toEqual([0, 0]);
  });
});

describe('initializePhysics2DAbiJointBuffer', () => {
  it('is the construction initializer of create physics2d abi joint buffer', () => {
    let buffer = createPhysics2DAbiJointBuffer(1);
    buffer.count = 1;
    buffer.requiredCount = 2;
    initializePhysics2DAbiJointBuffer(buffer, 5);
    expect(buffer.ids.length).toEqual(5);
    expect(buffer.values.length).toEqual(5 * Physics2DAbiJointValueStride);
    expect([buffer.count, buffer.requiredCount]).toEqual([0, 0]);
  });
});

describe('initializePhysics2DAbiQueryBuffer', () => {
  it('is the construction initializer of create physics2d abi query buffer', () => {
    let buffer = createPhysics2DAbiQueryBuffer(1);
    buffer.count = 1;
    buffer.requiredCount = 2;
    initializePhysics2DAbiQueryBuffer(buffer, 6);
    expect(buffer.bodyIds.length).toEqual(6);
    expect(buffer.values.length).toEqual(6 * Physics2DAbiQueryValueStride);
    expect([buffer.count, buffer.requiredCount]).toEqual([0, 0]);
  });
});
