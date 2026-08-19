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
  // Canvas and DOM antialias inherently and expose no switch to disable it. WebGPU cannot be moved in
  // the other direction yet: its pooled effect targets deliberately stay sampleCount 1 until the
  // pipelines gain multisample variants (render-wgpu/src/wgpuRenderTargetPool.ts:14-15). AA everywhere
  // will remove this systematic one-hard-edged-backend gap, but distinct rasterizers will still differ
  // sample for sample, so these entries promise comparable AA policy rather than pixel-identical edges.
  // Invert agrees away from its shape boundaries; its WebGPU boundary pixels come from that single-sample
  // scene target while this scene's WebGL target explicitly uses sampleCount 4.
  'effect-invert': ['webgpu'],
  // This scene exists to isolate a sampleCount-4 effect target. Its WebGPU option is currently a no-op,
  // so comparing that single-sample control would absorb the missing capability into parity tolerance.
  'effect-msaa': ['webgpu'],
  // Bloom runs on WebGPU, but its rotated source shapes enter the recipe through the same single-sample
  // target. Keep WebGPU out while Canvas's inherent AA and WebGL's sampleCount-4 source remain comparable.
  'effect-msaa-bloom': ['webgpu'],
  // Canvas ramps its multiply gradient to the frame corner; the GPU smoothstep reaches full darkening
  // at the configured radius. Keep the canvas reference out until those vignette recipes agree.
  'effect-vignette': ['canvas'],
};
