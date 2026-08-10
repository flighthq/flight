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
  playingvideo: 'all',
  'effect-lens-distortion': ['canvas'],
  'effect-lens-flare': ['canvas'],
  'effect-posterize': ['canvas'],
  'effect-vignette': ['canvas'],
  'effect-displacement': 'all',
  'effect-god-rays': 'all',
  'effect-screen-space-fog': 'all',
};
