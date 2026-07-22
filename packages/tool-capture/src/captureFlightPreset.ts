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
    parityGroups: subject === 'functional' ? FLIGHT_FUNCTIONAL_PARITY_GROUPS : undefined,
    paritySkip: FLIGHT_PARITY_SKIP,
  };
}

const FLIGHT_FUNCTIONAL_PARITY_GROUPS: Readonly<Record<string, Readonly<CaptureParityGroup>>> = {
  visual: {
    targets: ['dom', 'canvas', 'webgl', 'webgpu'],
    reference: 'canvas',
  },
};

const FLIGHT_PARITY_SKIP: Readonly<Record<string, 'all' | Readonly<string[]>>> = {
  playingvideo: 'all',
  'effect-hue-saturation': ['canvas'],
  'effect-lens-distortion': ['canvas'],
  'effect-lens-flare': ['canvas'],
  'effect-posterize': ['canvas'],
  'effect-vignette': ['canvas'],
  'effect-displacement': 'all',
  'effect-god-rays': 'all',
  'effect-screen-space-fog': 'all',
};
