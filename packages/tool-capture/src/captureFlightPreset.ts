import type { CaptureParityGroup } from './captureManifest.js';

export interface FlightCaptureValidationPreset {
  fingerprintSkip: Readonly<string[]>;
  parityGroups: Readonly<Record<string, Readonly<CaptureParityGroup>>> | undefined;
  paritySkip: Readonly<Record<string, 'all' | Readonly<string[]>>>;
}

/** Returns the repository-owned exceptions and comparison topology for a built-in Flight subject. */
export function getFlightCaptureValidationPreset(subject: string): FlightCaptureValidationPreset {
  return {
    fingerprintSkip: subject === 'examples' ? ['playingsound'] : [],
    parityGroups: subject === 'functional' || subject === 'examples' ? FLIGHT_VISUAL_PARITY_GROUPS : undefined,
    paritySkip: FLIGHT_PARITY_SKIP,
  };
}

// The raster backends of a subject compared against canvas, in ONE run. Both built-in subjects use this
// same topology, and examples needs it for a second reason: an example has no committed fingerprint
// baseline, which is the other route to parity eligibility. Without a group every example renderer takes
// the not-baselined `continue`, no pair is ever formed, and the leg reports success having compared
// nothing — the failure `isCaptureParityCoverageFailure` now refuses to let pass silently.
//
// A same-run group is the right route here rather than committing example baselines, because it
// sidesteps the self-stability question the baseline gate exists to answer: both captures come from one
// load, so cross-load flakiness cannot affect the comparison. Committed baselines are environment-
// coupled, which is exactly why `tests.yml` keeps the regression tier out of the PR path.
const FLIGHT_VISUAL_PARITY_GROUPS: Readonly<Record<string, Readonly<CaptureParityGroup>>> = {
  visual: {
    targets: ['dom', 'canvas', 'webgl', 'webgpu'],
    reference: 'canvas',
  },
};

const FLIGHT_PARITY_SKIP: Readonly<Record<string, 'all' | Readonly<string[]>>> = {
  // Canvas and DOM antialias inherently and expose no switch to disable it. WebGPU now has an opt-in 2×
  // main-surface supersample resolve, but the capture harness deliberately leaves it off until the AA
  // picture changes can be included in one authorized re-baseline. Its pooled effect targets also stay
  // sampleCount 1 until their pipelines gain multisample variants (render-wgpu/src/wgpuRenderTargetPool.ts:14-15).
  // Comparable AA policy will not promise pixel-identical samples from distinct rasterizers.
  // Invert agrees away from its shape boundaries; its WebGPU boundary pixels come from that single-sample
  // scene target while this scene's WebGL target explicitly uses sampleCount 4.
  'effect-invert': ['webgpu'],
  // This scene exists to isolate a sampleCount-4 effect target. Its WebGPU option is currently a no-op,
  // so comparing that single-sample control would absorb the missing capability into parity tolerance.
  'effect-msaa': ['webgpu'],
  // Bloom runs on WebGPU, but its rotated source shapes enter the recipe through the same single-sample
  // target. Keep WebGPU out while Canvas's inherent AA and WebGL's sampleCount-4 source remain comparable.
  'effect-msaa-bloom': ['webgpu'],
  // Canvas exercises its own 2D draw-to-texture API with a hand-drawn flat cube, while the GPU cells
  // exercise a lit Scene3D rendered into a texture. The compositing contract is shared, but those
  // deliberately different producers are not visual references for one another; retain only GL↔WGPU.
  'render-target-node-2d': ['canvas'],
  // SWF RGB CXFORM realization is still an undecided design: GL and WGPU fold it into tessellated solid
  // shapes, while Canvas and DOM leave it unapplied. The isolated scene keeps that question visible without
  // suppressing parity on the three cross-backend-equal alpha cases; Canvas↔DOM still compares here.
  'swf-color-transform': ['webgl', 'webgpu'],
};
