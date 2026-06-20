import type { Matrix } from './Matrix';

// Generic per-node motion. Velocity is not a camera feature: any transform that changed between frames
// has velocity, so a physics system, a tween, a camera, or a manual transform edit all contribute the
// same way. A VelocityField accumulates per-node velocity for one frame; the transform-delta contributor
// (contributeTransformVelocity) is the automatic baseline, and explicit contributors override, augment,
// or suppress it (e.g. a teleport zeroes velocity so it does not smear). The velocity is screen-space in
// node units; a producer scales by pixel ratio when writing a velocity buffer.

export interface Velocity2D {
  x: number;
  y: number;
}

// Per-node tracking inside a VelocityField. `previousWorldTransform` is the last committed world
// transform, kept so a producer can reproject per pixel (current·p − previous·p), not just translation.
// `explicitFrameId` marks the frame an explicit contributor last set this node, so the transform-delta
// baseline leaves explicitly-set nodes alone regardless of call order.
export interface VelocitySample {
  previousWorldTransform: Matrix | null;
  velocity: Velocity2D;
  lastFrameId: number;
  explicitFrameId: number;
}

// Per-frame velocity accumulator keyed by source object — a node, but equally a batch, a custom entity,
// or anything a contributor wants to track. Owned by the caller; decoupled from any renderer, camera, or
// scene-graph family. (Per-instance velocity for batched draws is not keyed here — an instance is not a
// stable object; it lives on the batch and is emitted by that kind's velocity writer.)
export interface VelocityField {
  samples: WeakMap<object, VelocitySample>;
  frameId: number;
}

// A source of per-node velocity for a frame — physics, tween, camera, or the transform-delta baseline.
// Implementations write into the field (via contributeNodeVelocity / suppressNodeVelocity) for `root`'s
// subtree. Kept as a plain function so any system can be one without depending on the velocity package's
// internals.
export type VelocityContributor = (field: VelocityField, root: object) => void;
