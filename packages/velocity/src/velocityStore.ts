import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityRaw } from '@flighthq/entity/contract';

import type { Velocity2D } from './velocity2d.ts';
import type { VelocityExplanation } from './velocityExplanation.ts';
import type { VelocitySample } from './velocitySample.ts';
import {
  createVelocitySample,
  explainVelocitySample,
  isVelocitySampleNonzero,
  readVelocitySample,
  writeVelocitySample,
} from './velocitySample.ts';

// Target-native sample store: samples are keyed by object identity in a WeakMap so any object can be a
// source and its sample is reclaimed with it. Every rule about what a sample means is generated from Rust.
// The per-target source key: object identity here (Rust uses an entity id).
export type SourceId = object;

export interface VelocityField extends EntityRaw {
  frameId: number;
  samples: WeakMap<SourceId, VelocitySample>;
}

export function beginVelocityFrame(field: VelocityField): void {
  field.frameId += 1;
}

export function contributeVelocity(field: VelocityField, source: SourceId, x: number, y: number): void {
  writeVelocitySample(ensureVelocitySample(field, source), field.frameId, x, y);
}

export function createVelocityField(): VelocityField {
  const out = allocateEntity<VelocityField>();
  initializeVelocityField(out);
  return finishEntity(out);
}

export function ensureNodeVelocitySample(field: VelocityField, node: object): VelocitySample {
  return ensureVelocitySample(field, node);
}

export function ensureVelocitySample(field: VelocityField, source: SourceId): VelocitySample {
  let sample = field.samples.get(source);
  if (sample === undefined) {
    sample = createVelocitySample();
    field.samples.set(source, sample);
  }
  return sample;
}

export function explainVelocity(field: VelocityField, source: SourceId): VelocityExplanation {
  return explainVelocitySample(findVelocitySample(field, source), field.frameId);
}

export function findVelocitySample(field: VelocityField, source: SourceId): VelocitySample | null {
  return field.samples.get(source) ?? null;
}

export function getVelocity(field: VelocityField, source: SourceId, out: Velocity2D): void {
  readVelocitySample(findVelocitySample(field, source), field.frameId, out);
}

export function hasVelocity(field: VelocityField, source: SourceId): boolean {
  return isVelocitySampleNonzero(findVelocitySample(field, source), field.frameId);
}

export function initializeVelocityField(out: EntityConstruction<VelocityField>): void {
  out.frameId = 0;
  out.samples = new WeakMap();
}

export function suppressVelocity(field: VelocityField, source: SourceId): void {
  contributeVelocity(field, source, 0, 0);
}
