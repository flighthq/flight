import type { Entity } from './Entity';

// Trauma-based camera shake: accumulate `trauma` (0–1) from game events, and each `updateCameraShake`
// call decays it and writes a deterministic offset into an output vector. Intensity is `trauma²`
// (quadratic: small hits barely register, large hits are dramatic). The noise is sampled from three
// incommensurate sine phases per axis, so the motion is smooth and never loops visibly.
//
// The offset output is additive — apply it AFTER the camera's base transform (orbit, follow, etc.).
// Translation is in world units; rotation is degrees (authoring layer convention).
export interface CameraShake extends Entity {
  // Current trauma level, clamped to [0, 1]. Accumulate with `addCameraShakeTrauma`.
  trauma: number;
  // Trauma units per second to subtract. Higher = quicker recovery. Default 1.5.
  decay: number;
  // Base oscillation rate in Hz. Higher = more frantic shaking. Default 15.
  frequency: number;
  // Maximum translation offset (world units) at full trauma. Default 0.5.
  translationAmplitude: number;
  // Maximum rotation offset (degrees) at full trauma. Default 3.
  rotationAmplitude: number;
  // Internal elapsed time — drives the noise phase. Advances by `dt` each update.
  time: number;
}

export interface CameraShakeOptions {
  decay?: number;
  frequency?: number;
  rotationAmplitude?: number;
  translationAmplitude?: number;
}

// Additive offset produced by `updateCameraShake`. Apply after the camera's base transform.
export interface CameraShakeOffset extends Entity {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  x: number;
  y: number;
  z: number;
}
