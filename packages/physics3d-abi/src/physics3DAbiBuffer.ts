import { createEntity } from '@flighthq/entity/contract';
import type {
  Physics3DAbiBodyBuffer,
  Physics3DAbiCommandBuffer,
  Physics3DAbiContactBuffer,
  Physics3DAbiExecutionResult,
  Physics3DAbiJointBuffer,
  Physics3DAbiQueryBuffer,
} from '@flighthq/types/contract';

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

export function clearPhysics3DAbiCommandBuffer(out: Physics3DAbiCommandBuffer): void {
  out.byteLength = Physics3DAbiCommandHeaderByteLength;
  out.commandCount = 0;
  const view = new DataView(out.data.buffer, out.data.byteOffset, out.data.byteLength);
  view.setUint32(0, Physics3DAbiCommandMagic, true);
  view.setUint32(4, Physics3DAbiVersion, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, out.commandCount, true);
}

export function createPhysics3DAbiBodyBuffer(capacity: number): Physics3DAbiBodyBuffer {
  assertCapacity(capacity, 'body');
  return createEntity({
    ids: new Uint32Array(capacity),
    flags: new Uint32Array(capacity),
    values: new Float64Array(capacity * Physics3DAbiBodyValueStride),
    count: 0,
    requiredCount: 0,
  });
}

export function createPhysics3DAbiCommandBuffer(byteCapacity = 4096): Physics3DAbiCommandBuffer {
  if (!Number.isSafeInteger(byteCapacity) || byteCapacity < Physics3DAbiCommandHeaderByteLength) {
    throw new RangeError(`Physics3D ABI command capacity must be at least ${Physics3DAbiCommandHeaderByteLength}`);
  }
  const out: Physics3DAbiCommandBuffer = createEntity({
    data: new Uint8Array(byteCapacity),
    byteLength: 0,
    commandCount: 0,
  });
  clearPhysics3DAbiCommandBuffer(out);
  return out;
}

export function createPhysics3DAbiContactBuffer(
  contactCapacity: number,
  pointCapacity: number,
): Physics3DAbiContactBuffer {
  assertCapacity(contactCapacity, 'contact');
  assertCapacity(pointCapacity, 'contact point');
  return createEntity({
    ids: new Uint32Array(contactCapacity * Physics3DAbiContactIdStride),
    flags: new Uint32Array(contactCapacity),
    pointStarts: new Uint32Array(contactCapacity),
    pointCounts: new Uint32Array(contactCapacity),
    values: new Float64Array(contactCapacity * Physics3DAbiContactValueStride),
    pointFeatureIds: new Uint32Array(pointCapacity),
    pointValues: new Float64Array(pointCapacity * Physics3DAbiContactPointValueStride),
    count: 0,
    pointCount: 0,
    requiredCount: 0,
    requiredPointCount: 0,
  });
}

export function createPhysics3DAbiExecutionResult(): Physics3DAbiExecutionResult {
  return createEntity({
    status: 'Complete',
    commandIndex: 0,
    byteOffset: Physics3DAbiCommandHeaderByteLength,
    commandKind: 0,
  });
}

export function createPhysics3DAbiJointBuffer(capacity: number): Physics3DAbiJointBuffer {
  assertCapacity(capacity, 'joint');
  return createEntity({
    ids: new Uint32Array(capacity),
    flags: new Uint32Array(capacity),
    values: new Float64Array(capacity * Physics3DAbiJointValueStride),
    count: 0,
    requiredCount: 0,
  });
}

export function createPhysics3DAbiQueryBuffer(capacity: number): Physics3DAbiQueryBuffer {
  assertCapacity(capacity, 'query');
  return createEntity({
    bodyIds: new Uint32Array(capacity),
    colliderIds: new Uint32Array(capacity),
    values: new Float64Array(capacity * Physics3DAbiQueryValueStride),
    count: 0,
    requiredCount: 0,
  });
}

export function getPhysics3DAbiCommandBufferRemainingByteLength(buffer: Readonly<Physics3DAbiCommandBuffer>): number {
  return Math.max(0, buffer.data.byteLength - buffer.byteLength);
}

function assertCapacity(capacity: number, subject: string): void {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError(`Physics3D ABI ${subject} capacity must be a non-negative safe integer`);
  }
}
