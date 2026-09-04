import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
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
  const out = allocateEntity<Physics3DAbiBodyBuffer>();
  initializePhysics3DAbiBodyBuffer(out, capacity);
  return finishEntity(out);
}

export function createPhysics3DAbiCommandBuffer(byteCapacity = 4096): Physics3DAbiCommandBuffer {
  if (!Number.isSafeInteger(byteCapacity) || byteCapacity < Physics3DAbiCommandHeaderByteLength) {
    throw new RangeError(`Physics3D ABI command capacity must be at least ${Physics3DAbiCommandHeaderByteLength}`);
  }
  const out = allocateEntity<Physics3DAbiCommandBuffer>();
  out.data = new Uint8Array(byteCapacity);
  out.byteLength = 0;
  out.commandCount = 0;
  clearPhysics3DAbiCommandBuffer(out);
  return out;
}

export function createPhysics3DAbiContactBuffer(
  contactCapacity: number,
  pointCapacity: number,
): Physics3DAbiContactBuffer {
  const out = allocateEntity<Physics3DAbiContactBuffer>();
  initializePhysics3DAbiContactBuffer(out, contactCapacity, pointCapacity);
  return finishEntity(out);
}

export function createPhysics3DAbiExecutionResult(): Physics3DAbiExecutionResult {
  const out = allocateEntity<Physics3DAbiExecutionResult>();
  initializePhysics3DAbiExecutionResult(out);
  return finishEntity(out);
}

export function createPhysics3DAbiJointBuffer(capacity: number): Physics3DAbiJointBuffer {
  const out = allocateEntity<Physics3DAbiJointBuffer>();
  initializePhysics3DAbiJointBuffer(out, capacity);
  return finishEntity(out);
}

export function createPhysics3DAbiQueryBuffer(capacity: number): Physics3DAbiQueryBuffer {
  const out = allocateEntity<Physics3DAbiQueryBuffer>();
  initializePhysics3DAbiQueryBuffer(out, capacity);
  return finishEntity(out);
}

export function getPhysics3DAbiCommandBufferRemainingByteLength(buffer: Readonly<Physics3DAbiCommandBuffer>): number {
  return Math.max(0, buffer.data.byteLength - buffer.byteLength);
}

export function initializePhysics3DAbiBodyBuffer(
  out: EntityConstruction<Physics3DAbiBodyBuffer>,
  capacity: number,
): void {
  assertCapacity(capacity, 'body');
  out.ids = new Uint32Array(capacity);
  out.flags = new Uint32Array(capacity);
  out.values = new Float64Array(capacity * Physics3DAbiBodyValueStride);
  out.count = 0;
  out.requiredCount = 0;
}

export function initializePhysics3DAbiContactBuffer(
  out: EntityConstruction<Physics3DAbiContactBuffer>,
  contactCapacity: number,
  pointCapacity: number,
): void {
  assertCapacity(contactCapacity, 'contact');
  assertCapacity(pointCapacity, 'contact point');
  out.ids = new Uint32Array(contactCapacity * Physics3DAbiContactIdStride);
  out.flags = new Uint32Array(contactCapacity);
  out.pointStarts = new Uint32Array(contactCapacity);
  out.pointCounts = new Uint32Array(contactCapacity);
  out.values = new Float64Array(contactCapacity * Physics3DAbiContactValueStride);
  out.pointFeatureIds = new Uint32Array(pointCapacity);
  out.pointValues = new Float64Array(pointCapacity * Physics3DAbiContactPointValueStride);
  out.count = 0;
  out.pointCount = 0;
  out.requiredCount = 0;
  out.requiredPointCount = 0;
}

export function initializePhysics3DAbiExecutionResult(out: EntityConstruction<Physics3DAbiExecutionResult>): void {
  out.status = 'Complete';
  out.commandIndex = 0;
  out.byteOffset = Physics3DAbiCommandHeaderByteLength;
  out.commandKind = 0;
}

export function initializePhysics3DAbiJointBuffer(
  out: EntityConstruction<Physics3DAbiJointBuffer>,
  capacity: number,
): void {
  assertCapacity(capacity, 'joint');
  out.ids = new Uint32Array(capacity);
  out.flags = new Uint32Array(capacity);
  out.values = new Float64Array(capacity * Physics3DAbiJointValueStride);
  out.count = 0;
  out.requiredCount = 0;
}

export function initializePhysics3DAbiQueryBuffer(
  out: EntityConstruction<Physics3DAbiQueryBuffer>,
  capacity: number,
): void {
  assertCapacity(capacity, 'query');
  out.bodyIds = new Uint32Array(capacity);
  out.colliderIds = new Uint32Array(capacity);
  out.values = new Float64Array(capacity * Physics3DAbiQueryValueStride);
  out.count = 0;
  out.requiredCount = 0;
}

function assertCapacity(capacity: number, subject: string): void {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new RangeError(`Physics3D ABI ${subject} capacity must be a non-negative safe integer`);
  }
}
