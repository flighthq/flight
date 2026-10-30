// Generated from crates/flight-velocity/src/velocity_sample.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { NonEntityCreateResult } from '@flighthq/entity/contract';
import type { Matrix } from '@flighthq/geometry/contract';

import type { Velocity2D } from './velocity2d.ts';
import type { VelocityExplanation } from './velocityExplanation.ts';

/**
 * Per-source velocity sample, storing the current velocity and the previous
 * world transform for deriving transform-based velocity.
 */
export interface VelocitySample {
  previousWorldTransform: Matrix | null;
  velocity: Velocity2D;
  lastFrameId: number;
  explicitFrameId: number;
}

/**
 * The default sample a store creates for a source it has not seen: zero
 * velocity, no previous transform, and `-1` (never touched) frame ids.
 */
export function createVelocitySample(): NonEntityCreateResult<VelocitySample, 'descriptor'> {
  return { previousWorldTransform: null, velocity: { x: 0.0, y: 0.0 }, lastFrameId: -1, explicitFrameId: -1 };
}

/**
 * Explains why a sample reads as its current velocity at `frameId`: no
 * sample, stale (not touched this frame), explicit or derived zero, or ok.
 */
export function explainVelocitySample(sample: Readonly<VelocitySample> | null, frameId: number): VelocityExplanation {
  if (sample !== null) {
    const stored = sample;
    if (stored.lastFrameId !== frameId) {
      return {
        currentFrameId: frameId,
        explicit: false,
        lastFrameId: stored.lastFrameId,
        reason: 'stale',
        x: 0.0,
        y: 0.0,
      };
    }
    const explicit = stored.explicitFrameId === frameId;
    const x = stored.velocity.x;
    const y = stored.velocity.y;
    if (x === 0.0 && y === 0.0) {
      const reason = explicit ? 'explicit-zero' : 'derived-zero';
      return {
        currentFrameId: frameId,
        explicit: explicit,
        lastFrameId: stored.lastFrameId,
        reason: reason,
        x: 0.0,
        y: 0.0,
      };
    }
    return { currentFrameId: frameId, explicit: explicit, lastFrameId: stored.lastFrameId, reason: 'ok', x: x, y: y };
  }
  return { currentFrameId: frameId, explicit: false, lastFrameId: -1, reason: 'no-sample', x: 0.0, y: 0.0 };
}

/**
 * Returns the per-pixel screen-space velocity at local-space point
 * (`pointX`, `pointY`) by computing `current * p - previous * p` using
 * the sample's stored previous_world_transform and the node's current world
 * transform. Writes the result into `out`. Returns zero when the sample has
 * no previous transform.
 *
 * Use when the full affine delta (rotation + scale) at a specific point is
 * needed, such as when writing a per-pixel velocity buffer from a
 * screen-space fragment shader.
 */
export function getVelocitySampleAt(
  sample: Readonly<VelocitySample>,
  currentWorldTransform: Readonly<Matrix>,
  pointX: number,
  pointY: number,
  out: Velocity2D,
): void {
  if (sample.previousWorldTransform !== null) {
    const prev = sample.previousWorldTransform;
    const cx = currentWorldTransform.a * pointX + currentWorldTransform.c * pointY + currentWorldTransform.tx;
    const cy = currentWorldTransform.b * pointX + currentWorldTransform.d * pointY + currentWorldTransform.ty;
    const px = prev.a * pointX + prev.c * pointY + prev.tx;
    const py = prev.b * pointX + prev.d * pointY + prev.ty;
    out.x = cx - px;
    out.y = cy - py;
    return;
  }
  out.x = 0.0;
  out.y = 0.0;
}

/**
 * Returns true when the sample was touched at `frameId` and its velocity is
 * nonzero. A missing or stale sample has no velocity.
 */
export function isVelocitySampleNonzero(sample: Readonly<VelocitySample> | null, frameId: number): boolean {
  if (sample !== null) {
    const stored = sample;
    return stored.lastFrameId === frameId && (stored.velocity.x !== 0.0 || stored.velocity.y !== 0.0);
  }
  return false;
}

/**
 * Writes the sample's velocity at `frameId` into `out`. Writes zero for a
 * missing sample or one that is stale (not touched at `frameId`).
 */
export function readVelocitySample(sample: Readonly<VelocitySample> | null, frameId: number, out: Velocity2D): void {
  if (sample !== null) {
    const stored = sample;
    if (stored.lastFrameId === frameId) {
      out.x = stored.velocity.x;
      out.y = stored.velocity.y;
      return;
    }
  }
  out.x = 0.0;
  out.y = 0.0;
}

/**
 * Records an explicit velocity contribution on the sample at `frameId`: the
 * velocity, and both the last-touched and explicit frame ids, so a transform
 * baseline run later in the same frame leaves it in place.
 */
export function writeVelocitySample(sample: VelocitySample, frameId: number, x: number, y: number): void {
  sample.velocity.x = x;
  sample.velocity.y = y;
  sample.lastFrameId = frameId;
  sample.explicitFrameId = frameId;
}
