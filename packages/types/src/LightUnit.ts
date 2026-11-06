// Owned by `@flighthq/lighting`. These deprecated re-exports keep existing `@flighthq/types` imports
// compiling until consumers import the owning package.

/** @deprecated Import from `@flighthq/lighting/contract`. */
export type { LightUnit } from '@flighthq/lighting/contract';

// Deprecated structural copies of lighting's literal constants (core may cross into an owner only
// with type-only edges); the values are identical literals.
export const CandelaLightUnit = 'Candela';
export const LumenLightUnit = 'Lumen';
export const LuxLightUnit = 'Lux';
export const UnitlessLightUnit = 'Unitless';
