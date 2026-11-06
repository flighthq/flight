// Owned by `@flighthq/lighting`. These deprecated re-exports keep existing `@flighthq/types` imports
// compiling until consumers import the owning package.

/** @deprecated Import from `@flighthq/lighting/contract`. */
export type { DirectionalLight } from '@flighthq/lighting/contract';

// Deprecated structural copies of lighting's literal constants (core may cross into an owner only
// with type-only edges); the values are identical literals.
export const DirectionalLightKind = 'DirectionalLight';

// Both GPU backends allocate directional shadow maps at this square resolution. Keeping the resource
// dimension in the shared contract makes the depth pass, receiver-bias conversion, and cross-backend
// raster witnesses agree from one source of truth.
export const DIRECTIONAL_SHADOW_MAP_SIZE = 1024;

// Directional PCF uses a square (2r+1)^2 comparison kernel. Renderers truncate authored radii to an
// integer and clamp them to this cap, keeping the worst case at 25 comparisons on both GL and WGPU.
// Radius 0 is one comparison tap; radius 1 is a 3x3 kernel; radius 2 is a 5x5 kernel.
export const MAX_DIRECTIONAL_SHADOW_PCF_RADIUS = 2;
