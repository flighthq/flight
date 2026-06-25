import type { Velocity2D, VelocityField, VelocitySample } from '@flighthq/types';

// The VelocityField is the generic seam: any system (physics, tween, camera, manual edit) contributes a
// source object's screen-space velocity for the current frame, and any consumer reads it. The accessors
// are source-agnostic — they key on any object, not only nodes (a batch, a custom entity, etc.). The
// node-graph-specific baseline is contributeTransformVelocity. Explicit contributions win over the
// baseline regardless of call order, via per-sample explicitFrameId.

// Adds velocity contributions: `out = a + b`.
export function addVelocity(out: Velocity2D, a: Readonly<Velocity2D>, b: Readonly<Velocity2D>): Velocity2D {
  const ax = a.x;
  const ay = a.y;
  out.x = ax + b.x;
  out.y = ay + b.y;
  return out;
}

export function beginVelocityFrame(field: VelocityField): void {
  field.frameId++;
}

// Clamps velocity to `maxLength` in-place style: `out` may equal `velocity` (alias-safe).
// The most common motion-blur safety helper — prevents runaway blur lengths on fast objects.
export function clampVelocity(out: Velocity2D, velocity: Readonly<Velocity2D>, maxLength: number): Velocity2D {
  const vx = velocity.x;
  const vy = velocity.y;
  const lenSq = vx * vx + vy * vy;
  const maxSq = maxLength * maxLength;
  if (lenSq > maxSq && lenSq > 0) {
    const scale = maxLength / Math.sqrt(lenSq);
    out.x = vx * scale;
    out.y = vy * scale;
  } else {
    out.x = vx;
    out.y = vy;
  }
  return out;
}

export function contributeVelocity(field: VelocityField, source: object, x: number, y: number): void {
  const sample = ensureVelocitySample(field, source);
  sample.velocity.x = x;
  sample.velocity.y = y;
  sample.lastFrameId = field.frameId;
  sample.explicitFrameId = field.frameId;
}

// Copies one velocity value into another (alias-safe: out may equal source).
export function copyVelocity(out: Velocity2D, source: Readonly<Velocity2D>): Velocity2D {
  const sx = source.x;
  const sy = source.y;
  out.x = sx;
  out.y = sy;
  return out;
}

export function createVelocityField(): VelocityField {
  return { samples: new WeakMap(), frameId: 0 };
}

// Exponential moving average (EMA) of velocity across frames. Useful for jitter-free motion buffers.
// `factor` in (0, 1]: 1 = no smoothing (current wins), 0.1 = heavy smoothing (previous dominates).
// Alias-safe: `out` may equal `current` or `previous`.
export function dampVelocity(
  out: Velocity2D,
  current: Readonly<Velocity2D>,
  previous: Readonly<Velocity2D>,
  factor: number,
): Velocity2D {
  const cx = current.x;
  const cy = current.y;
  const px = previous.x;
  const py = previous.y;
  out.x = cx * factor + px * (1 - factor);
  out.y = cy * factor + py * (1 - factor);
  return out;
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

// Returns true if the velocity vector's magnitude is within `epsilon` of zero. Useful for skipping
// velocity-buffer writes on effectively-still objects.
export function isVelocityZero(velocity: Readonly<Velocity2D>, epsilon?: number): boolean {
  const e = epsilon ?? 0;
  return Math.abs(velocity.x) <= e && Math.abs(velocity.y) <= e;
}

// Returns the magnitude (length) of the velocity vector.
export function lengthOfVelocity(velocity: Readonly<Velocity2D>): number {
  return Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
}

// Linearly interpolates between two velocity values. Alias-safe: `out` may equal `a` or `b`.
export function lerpVelocity(out: Velocity2D, a: Readonly<Velocity2D>, b: Readonly<Velocity2D>, t: number): Velocity2D {
  const ax = a.x;
  const ay = a.y;
  out.x = ax + (b.x - ax) * t;
  out.y = ay + (b.y - ay) * t;
  return out;
}

// Normalizes the velocity vector to unit length. Returns the zero vector when length is zero.
// Alias-safe: `out` may equal `source`.
export function normalizeVelocity(out: Velocity2D, source: Readonly<Velocity2D>): Velocity2D {
  const sx = source.x;
  const sy = source.y;
  const len = Math.sqrt(sx * sx + sy * sy);
  if (len > 0) {
    const inv = 1 / len;
    out.x = sx * inv;
    out.y = sy * inv;
  } else {
    out.x = 0;
    out.y = 0;
  }
  return out;
}

// Scales a velocity by a scalar factor. Used for pixel-ratio conversion and unit normalization.
// Alias-safe: `out` may equal `velocity`.
export function scaleVelocity(out: Velocity2D, velocity: Readonly<Velocity2D>, scale: number): Velocity2D {
  const vx = velocity.x;
  const vy = velocity.y;
  out.x = vx * scale;
  out.y = vy * scale;
  return out;
}

// Subtracts `b` from `a`: `out = a - b`. Alias-safe.
export function subtractVelocity(out: Velocity2D, a: Readonly<Velocity2D>, b: Readonly<Velocity2D>): Velocity2D {
  const ax = a.x;
  const ay = a.y;
  out.x = ax - b.x;
  out.y = ay - b.y;
  return out;
}

// Zeroes a source's velocity this frame — a teleport/cut that must not smear.
export function suppressVelocity(field: VelocityField, source: object): void {
  contributeVelocity(field, source, 0, 0);
}

// Sets both components to zero.
export function zeroVelocity(out: Velocity2D): Velocity2D {
  out.x = 0;
  out.y = 0;
  return out;
}
