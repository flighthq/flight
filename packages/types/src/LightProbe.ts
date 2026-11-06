// Owned by `@flighthq/lighting`. These deprecated re-exports keep existing `@flighthq/types` imports
// compiling until consumers import the owning package.

/** @deprecated Import from `@flighthq/lighting/contract`. */
export type { LightProbe, LightProbeGrid } from '@flighthq/lighting/contract';

// Deprecated structural copies of lighting's literal constants (core may cross into an owner only
// with type-only edges); the values are identical literals.
// The number of floats in a probe's `shCoefficients`: 9 L2 spherical-harmonic coefficients, each an
// RGB triplet. Exported because callers allocating their own scratch buffer for `sampleLightProbeGrid`
// need the exact length, and a wrong-sized buffer is otherwise a silent partial write.
export const LIGHT_PROBE_SH_FLOATS = 27;
