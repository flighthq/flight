import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
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
  const out = allocateEntity<Physics2DAbiBodyBuffer>();
  out.ids = new Uint32Array(capacity);
  out.flags = new Uint32Array(capacity);
  out.values = new Float64Array(capacity * Physics2DAbiBodyValueStride);
  out.count = 0;
  out.requiredCount = 0;
  return finishEntity(out);
}

export function createPhysics2DAbiCommandBuffer(byteCapacity = 4096): Physics2DAbiCommandBuffer {
  if (!Number.isSafeInteger(byteCapacity) || byteCapacity < Physics2DAbiCommandHeaderByteLength) {
    throw new RangeError(`Physics2D ABI command capacity must be at least ${Physics2DAbiCommandHeaderByteLength}`);
  }
  const out = allocateEntity<Physics2DAbiBodyBuffer>();
  out.data = new Uint8Array(byteCapacity);
  out.byteLength = 0;
  out.commandCount = 0;
  clearPhysics2DAbiCommandBuffer(out);
  return out;
}

export function createPhysics2DAbiContactBuffer(
  contactCapacity: number,
  pointCapacity: number,
): Physics2DAbiContactBuffer {
  assertCapacity(contactCapacity, 'contact');
  assertCapacity(pointCapacity, 'contact point');
  const out = allocateEntity<Physics2DAbiBodyBuffer>();
  out.ids = new Uint32Array(contactCapacity * Physics2DAbiContactIdStride);
  out.flags = new Uint32Array(contactCapacity);
  out.pointStarts = new Uint32Array(contactCapacity);
  out.pointCounts = new Uint32Array(contactCapacity);
  out.values = new Float64Array(contactCapacity * Physics2DAbiContactValueStride);
  out.pointFeatureIds = new Uint32Array(pointCapacity);
  out.pointValues = new Float64Array(pointCapacity * Physics2DAbiContactPointValueStride);
  out.count = 0;
  out.pointCount = 0;
  out.requiredCount = 0;
  out.requiredPointCount = 0;
  return finishEntity(out);
}

export function createPhysics2DAbiExecutionResult(): Physics2DAbiExecutionResult {
  const out = allocateEntity<Physics2DAbiBodyBuffer>();
  out.status = 'Complete';
  out.commandIndex = 0;
  out.byteOffset = Physics2DAbiCommandHeaderByteLength;
  out.commandKind = 0;
  return finishEntity(out);
}

export function createPhysics2DAbiJointBuffer(capacity: number): Physics2DAbiJointBuffer {
  assertCapacity(capacity, 'joint');
  const out = allocateEntity<Physics2DAbiBodyBuffer>();
  out.ids = new Uint32Array(capacity);
  out.flags = new Uint32Array(capacity);
  out.values = new Float64Array(capacity * Physics2DAbiJointValueStride);
  out.count = 0;
  out.requiredCount = 0;
  return finishEntity(out);
}

export function createPhysics2DAbiQueryBuffer(capacity: number): Physics2DAbiQueryBuffer {
  assertCapacity(capacity, 'query');
  const out = allocateEntity<Physics2DAbiBodyBuffer>();
  out.bodyIds = new Uint32Array(capacity);
  out.colliderIds = new Uint32Array(capacity);
  out.values = new Float64Array(capacity * Physics2DAbiQueryValueStride);
  out.count = 0;
  out.requiredCount = 0;
  return finishEntity(out);
}

export function getPhysics2DAbiCommandBufferRemainingByteLength(buffer: Readonly<Physics2DAbiCommandBuffer>): number {
  return Math.max(0, buffer.data.byteLength - buffer.byteLength);
}

function assertCapacity(capacity: number, subject: string): void {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError(`Physics2D ABI ${subject} capacity must be a non-negative safe integer`);
  }
}
