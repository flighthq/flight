// Generated from crates/flight-physics3d-abi/tests/physics3d_abi_buffer_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

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
  clearPhysics3DAbiCommandBuffer,
  createPhysics3DAbiBodyBuffer,
  createPhysics3DAbiCommandBuffer,
  createPhysics3DAbiContactBuffer,
  createPhysics3DAbiExecutionResult,
  createPhysics3DAbiJointBuffer,
  createPhysics3DAbiQueryBuffer,
  getPhysics3DAbiCommandBufferRemainingByteLength,
  initializePhysics3DAbiBodyBuffer,
  initializePhysics3DAbiCommandBuffer,
  initializePhysics3DAbiContactBuffer,
  initializePhysics3DAbiExecutionResult,
  initializePhysics3DAbiJointBuffer,
  initializePhysics3DAbiQueryBuffer,
  writePhysics3DAbiSetGravityCommand,
} from './contract.ts';
import type { Physics3DAbiCommandBuffer } from './types.ts';

const UNSAFE_CAPACITY: number = 1 * 2 ** 53;

function readHeaderWord(buffer: Readonly<Physics3DAbiCommandBuffer>, at: number): number {
  return new DataView(new Uint8Array(buffer.data.slice(at, at + 4)!).buffer).getUint32(0, true);
}

describe('clearPhysics3DAbiCommandBuffer', () => {
  it('rewrites the canonical little endian header and resets the published stream', () => {
    let out = createPhysics3DAbiCommandBuffer(64);
    out.data.fill(0xff);
    out.byteLength = 64;
    out.commandCount = 3;
    clearPhysics3DAbiCommandBuffer(out);
    expect(readHeaderWord(out, 0)).toEqual(Physics3DAbiCommandMagic);
    expect(readHeaderWord(out, 4)).toEqual(Physics3DAbiVersion);
    expect(readHeaderWord(out, 8)).toEqual(Physics3DAbiCommandHeaderByteLength >>> 0);
    expect(readHeaderWord(out, 12)).toEqual(0);
    expect(out.byteLength).toEqual(Physics3DAbiCommandHeaderByteLength);
    expect(out.commandCount).toEqual(0);
  });
});

describe('createPhysics3DAbiBodyBuffer', () => {
  it('allocates the documented structure of arrays capacity', () => {
    const out = createPhysics3DAbiBodyBuffer(3);
    expect(out.ids.length).toEqual(3);
    expect(out.flags.length).toEqual(3);
    expect(out.values.length).toEqual(3 * Physics3DAbiBodyValueStride);
    expect([out.count, out.requiredCount]).toEqual([0, 0]);
  });
});

describe('createPhysics3DAbiCommandBuffer', () => {
  it('allocates only through an explicit byte capacity', () => {
    const out = createPhysics3DAbiCommandBuffer(80);
    expect(out.data.length).toEqual(80);
    expect(out.byteLength).toEqual(Physics3DAbiCommandHeaderByteLength);
  });
  it('rejects a capacity that cannot hold the stream header', () => {
    expect(() => {
      createPhysics3DAbiCommandBuffer(15);
    }, 'expected a RangeError').toThrow(new RangeError('Physics3D ABI command capacity must be at least 16'));
  });
});

describe('createPhysics3DAbiContactBuffer', () => {
  it('allocates contact and point capacities independently', () => {
    const out = createPhysics3DAbiContactBuffer(2, 5);
    expect(out.ids.length).toEqual(2 * Physics3DAbiContactIdStride);
    expect(out.values.length).toEqual(2 * Physics3DAbiContactValueStride);
    expect(out.pointFeatureIds.length).toEqual(5);
    expect(out.pointValues.length).toEqual(5 * Physics3DAbiContactPointValueStride);
  });
});

describe('createPhysics3DAbiExecutionResult', () => {
  it('starts at a complete empty stream boundary', () => {
    const result = createPhysics3DAbiExecutionResult();
    expect(result.status).toEqual('Complete');
    expect(result.commandIndex).toEqual(0);
    expect(result.byteOffset).toEqual(Physics3DAbiCommandHeaderByteLength);
    expect(result.commandKind).toEqual(0);
  });
});

describe('createPhysics3DAbiJointBuffer', () => {
  it('allocates one reaction row per joint', () => {
    const out = createPhysics3DAbiJointBuffer(4);
    expect(out.ids.length).toEqual(4);
    expect(out.flags.length).toEqual(4);
    expect(out.values.length).toEqual(4 * Physics3DAbiJointValueStride);
  });
});

describe('createPhysics3DAbiQueryBuffer', () => {
  it('allocates identity and geometry rows at the same capacity', () => {
    const out = createPhysics3DAbiQueryBuffer(6);
    expect(out.bodyIds.length).toEqual(6);
    expect(out.colliderIds.length).toEqual(6);
    expect(out.values.length).toEqual(6 * Physics3DAbiQueryValueStride);
  });
  it('rejects negative and fractional capacities', () => {
    expect(() => {
      createPhysics3DAbiQueryBuffer(UNSAFE_CAPACITY);
    }, 'expected a RangeError').toThrow(
      new RangeError('Physics3D ABI query capacity must be a non-negative safe integer'),
    );
  });
});

describe('getPhysics3DAbiCommandBufferRemainingByteLength', () => {
  it('reports capacity after the published prefix without going negative', () => {
    let out = createPhysics3DAbiCommandBuffer(64);
    expect(getPhysics3DAbiCommandBufferRemainingByteLength(out)).toEqual(48);
    out.byteLength = 80;
    expect(getPhysics3DAbiCommandBufferRemainingByteLength(out)).toEqual(0);
  });
});

describe('initializePhysics3DAbiBodyBuffer', () => {
  it('is the construction initializer of create physics3d abi body buffer', () => {
    let buffer = createPhysics3DAbiBodyBuffer(1);
    const id = buffer;
    buffer.count = 1;
    buffer.requiredCount = 4;
    initializePhysics3DAbiBodyBuffer(buffer, 2);
    expect(buffer.ids.length).toEqual(2);
    expect(buffer.values.length).toEqual(2 * Physics3DAbiBodyValueStride);
    expect([buffer.count, buffer.requiredCount]).toEqual([0, 0]);
    expect(buffer).toBe(id);
  });
});

describe('initializePhysics3DAbiCommandBuffer', () => {
  it('is the construction initializer of create physics3d abi command buffer', () => {
    let buffer = createPhysics3DAbiCommandBuffer(64);
    const id = buffer;
    expect(writePhysics3DAbiSetGravityCommand(buffer, 1, 2, 3)).toBe(true);
    initializePhysics3DAbiCommandBuffer(buffer, 32);
    expect(buffer.data.length).toEqual(32);
    expect(buffer.byteLength).toEqual(Physics3DAbiCommandHeaderByteLength);
    expect(buffer.commandCount).toEqual(0);
    expect(readHeaderWord(buffer, 0)).toEqual(Physics3DAbiCommandMagic);
    expect(buffer).toBe(id);
  });
});

describe('initializePhysics3DAbiContactBuffer', () => {
  it('is the construction initializer of create physics3d abi contact buffer', () => {
    let buffer = createPhysics3DAbiContactBuffer(1, 1);
    buffer.count = 1;
    buffer.pointCount = 1;
    buffer.requiredCount = 3;
    buffer.requiredPointCount = 5;
    initializePhysics3DAbiContactBuffer(buffer, 3, 4);
    expect(buffer.flags.length).toEqual(3);
    expect(buffer.pointFeatureIds.length).toEqual(4);
    expect([buffer.count, buffer.pointCount, buffer.requiredCount, buffer.requiredPointCount]).toEqual([0, 0, 0, 0]);
  });
});

describe('initializePhysics3DAbiExecutionResult', () => {
  it('is the construction initializer of create physics3d abi execution result', () => {
    let result = createPhysics3DAbiExecutionResult();
    result.status = 'InvalidBuffer';
    result.commandIndex = 3;
    result.byteOffset = 99;
    result.commandKind = 7;
    initializePhysics3DAbiExecutionResult(result);
    expect(result.status).toEqual('Complete');
    expect(result.byteOffset).toEqual(Physics3DAbiCommandHeaderByteLength);
    expect([result.commandIndex, result.commandKind]).toEqual([0, 0]);
  });
});

describe('initializePhysics3DAbiJointBuffer', () => {
  it('is the construction initializer of create physics3d abi joint buffer', () => {
    let buffer = createPhysics3DAbiJointBuffer(1);
    buffer.count = 1;
    buffer.requiredCount = 2;
    initializePhysics3DAbiJointBuffer(buffer, 5);
    expect(buffer.ids.length).toEqual(5);
    expect(buffer.values.length).toEqual(5 * Physics3DAbiJointValueStride);
    expect([buffer.count, buffer.requiredCount]).toEqual([0, 0]);
  });
});

describe('initializePhysics3DAbiQueryBuffer', () => {
  it('is the construction initializer of create physics3d abi query buffer', () => {
    let buffer = createPhysics3DAbiQueryBuffer(1);
    buffer.count = 1;
    buffer.requiredCount = 2;
    initializePhysics3DAbiQueryBuffer(buffer, 6);
    expect(buffer.bodyIds.length).toEqual(6);
    expect(buffer.values.length).toEqual(6 * Physics3DAbiQueryValueStride);
    expect([buffer.count, buffer.requiredCount]).toEqual([0, 0]);
  });
});
