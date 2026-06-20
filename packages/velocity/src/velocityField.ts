import type { Velocity2D, VelocityField, VelocitySample } from '@flighthq/types';

// The VelocityField is the generic seam: any system (physics, tween, camera, manual edit) contributes a
// source object's screen-space velocity for the current frame, and any consumer reads it. The accessors
// are source-agnostic — they key on any object, not only nodes (a batch, a custom entity, etc.). The
// node-graph-specific baseline is contributeTransformVelocity. Explicit contributions win over the
// baseline regardless of call order, via per-sample explicitFrameId.

export function beginVelocityFrame(field: VelocityField): void {
  field.frameId++;
}

export function contributeVelocity(field: VelocityField, source: object, x: number, y: number): void {
  const sample = ensureVelocitySample(field, source);
  sample.velocity.x = x;
  sample.velocity.y = y;
  sample.lastFrameId = field.frameId;
  sample.explicitFrameId = field.frameId;
}

export function createVelocityField(): VelocityField {
  return { samples: new WeakMap(), frameId: 0 };
}

// Get-or-create a source's per-frame sample. Shared with the transform-delta contributor in this package.
export function ensureVelocitySample(field: VelocityField, source: object): VelocitySample {
  let sample = field.samples.get(source);
  if (sample === undefined) {
    sample = { previousWorldTransform: null, velocity: { x: 0, y: 0 }, lastFrameId: -1, explicitFrameId: -1 };
    field.samples.set(source, sample);
  }
  return sample;
}

// Writes the source's current-frame velocity into `out`. Returns zero velocity for sources with no
// sample or whose sample is stale (not touched this frame).
export function getVelocity(field: VelocityField, source: object, out: Velocity2D): Velocity2D {
  const sample = field.samples.get(source);
  if (sample === undefined || sample.lastFrameId !== field.frameId) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = sample.velocity.x;
  out.y = sample.velocity.y;
  return out;
}

export function hasVelocity(field: VelocityField, source: object): boolean {
  const sample = field.samples.get(source);
  return (
    sample !== undefined && sample.lastFrameId === field.frameId && (sample.velocity.x !== 0 || sample.velocity.y !== 0)
  );
}

// Zeroes a source's velocity this frame — a teleport/cut that must not smear.
export function suppressVelocity(field: VelocityField, source: object): void {
  contributeVelocity(field, source, 0, 0);
}
