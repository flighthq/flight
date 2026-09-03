import { createEntity } from '@flighthq/entity/contract';
import type {
  Physics2DAbiBodyBuffer,
  Physics2DAbiCommandBuffer,
  Physics2DAbiContactBuffer,
  Physics2DAbiExecutionResult,
  Physics2DAbiJointBuffer,
  Physics2DAbiQueryBuffer,
} from '@flighthq/types/contract';

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

export function clearPhysics2DAbiCommandBuffer(out: Physics2DAbiCommandBuffer): void {
  out.byteLength = Physics2DAbiCommandHeaderByteLength;
  out.commandCount = 0;
  const view = new DataView(out.data.buffer, out.data.byteOffset, out.data.byteLength);
  view.setUint32(0, Physics2DAbiCommandMagic, true);
  view.setUint32(4, Physics2DAbiVersion, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, out.commandCount, true);
}

export function createPhysics2DAbiBodyBuffer(capacity: number): Physics2DAbiBodyBuffer {
  assertCapacity(capacity, 'body');
  return createEntity({
    ids: new Uint32Array(capacity),
    flags: new Uint32Array(capacity),
    values: new Float64Array(capacity * Physics2DAbiBodyValueStride),
    count: 0,
    requiredCount: 0,
  });
}

export function createPhysics2DAbiCommandBuffer(byteCapacity = 4096): Physics2DAbiCommandBuffer {
  if (!Number.isSafeInteger(byteCapacity) || byteCapacity < Physics2DAbiCommandHeaderByteLength) {
    throw new RangeError(`Physics2D ABI command capacity must be at least ${Physics2DAbiCommandHeaderByteLength}`);
  }
  const out: Physics2DAbiCommandBuffer = createEntity({
    data: new Uint8Array(byteCapacity),
    byteLength: 0,
    commandCount: 0,
  });
  clearPhysics2DAbiCommandBuffer(out);
  return out;
}

export function createPhysics2DAbiContactBuffer(
  contactCapacity: number,
  pointCapacity: number,
): Physics2DAbiContactBuffer {
  assertCapacity(contactCapacity, 'contact');
  assertCapacity(pointCapacity, 'contact point');
  return createEntity({
    ids: new Uint32Array(contactCapacity * Physics2DAbiContactIdStride),
    flags: new Uint32Array(contactCapacity),
    pointStarts: new Uint32Array(contactCapacity),
    pointCounts: new Uint32Array(contactCapacity),
    values: new Float64Array(contactCapacity * Physics2DAbiContactValueStride),
    pointFeatureIds: new Uint32Array(pointCapacity),
    pointValues: new Float64Array(pointCapacity * Physics2DAbiContactPointValueStride),
    count: 0,
    pointCount: 0,
    requiredCount: 0,
    requiredPointCount: 0,
  });
}

export function createPhysics2DAbiExecutionResult(): Physics2DAbiExecutionResult {
  return createEntity({ status: 'Complete', commandIndex: 0, byteOffset: Physics2DAbiCommandHeaderByteLength, commandKind: 0 });
}

export function createPhysics2DAbiJointBuffer(capacity: number): Physics2DAbiJointBuffer {
  assertCapacity(capacity, 'joint');
  return createEntity({
    ids: new Uint32Array(capacity),
    flags: new Uint32Array(capacity),
    values: new Float64Array(capacity * Physics2DAbiJointValueStride),
    count: 0,
    requiredCount: 0,
  });
}

export function createPhysics2DAbiQueryBuffer(capacity: number): Physics2DAbiQueryBuffer {
  assertCapacity(capacity, 'query');
  return createEntity({
    bodyIds: new Uint32Array(capacity),
    colliderIds: new Uint32Array(capacity),
    values: new Float64Array(capacity * Physics2DAbiQueryValueStride),
    count: 0,
    requiredCount: 0,
  });
}

export function getPhysics2DAbiCommandBufferRemainingByteLength(buffer: Readonly<Physics2DAbiCommandBuffer>): number {
  return Math.max(0, buffer.data.byteLength - buffer.byteLength);
}

function assertCapacity(capacity: number, subject: string): void {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError(`Physics2D ABI ${subject} capacity must be a non-negative safe integer`);
  }
}
