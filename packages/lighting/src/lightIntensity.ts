import type { LightUnit } from '@flighthq/types';
import { CandelaLightUnit, LumenLightUnit, LuxLightUnit, UnitlessLightUnit } from '@flighthq/types';

// Scales a light intensity by an exposure value in photographic stops: each +1 EV doubles the
// intensity, each -1 halves it (`intensity * 2**ev`). This is the porting dial for the linear-HDR
// contract described in this package's status.md: scene-gl multiplies LINEAR radiance and defers
// tonemap/gamma to the effect resolve pass, so intensities authored in a gamma-space (sRgb/LDR)
// engine read too dark here. Nudge them up in stops — directional lights empirically need ~+1.5 to
// +3 EV (~3-8x), ambient ~+0.5 to +1 EV (~1.5-2x) — without hand-editing every descriptor.
export function applyLightExposure(intensity: number, ev: number): number {
  return intensity * 2 ** ev;
}

// Restates a photometric `value` given in `fromUnit` as the equivalent reading in `toUnit`, pivoting
// through the renderer's native linear scale. Round-trips: converting a value out to another unit and
// back returns the original. Because the pivot is Flight's linear multiplier, this is a superset of
// getLightLinearIntensity (which is the fromUnit -> Unitless case). See getLightLinearIntensity for
// the reference-normalization anchors and their deliberate limits.
export function convertLightIntensity(fromUnit: LightUnit, toUnit: LightUnit, value: number): number {
  return getLightLinearIntensity(fromUnit, value) / LINEAR_PER_UNIT[toUnit];
}

// Maps a `value` expressed in a photometric `unit` to the dimensionless linear multiplier the scene
// shaders expect (the `intensity` field on light descriptors). `Unitless` passes through 1:1 — it IS
// the renderer's native scale. The three photometric units divide by a documented reference anchor:
// the physical reading that corresponds to linear 1.0.
//
// The anchors are renderer-normalization defaults, NOT physically exact conversions. A true
// photometric conversion needs geometry Flight does not have at this layer (illuminance depends on
// distance; luminous flux on emission solid angle) and an absolute exposure Flight deliberately
// defers to the tonemap pass. So: Lux (illuminance, for directional/sun lights) and Candela
// (luminous intensity, for point/spot lights) are each anchored independently at 100000 = linear 1.0
// (bright-daylight magnitude), and Lumen (luminous flux) derives from Candela via the ONE genuine
// physical relationship encodable without geometry — an isotropic point source emits
// `lumen = candela * 4*PI` over the full sphere. Revisit these anchors if a physically-based exposure
// model lands; they are chosen to be memorable and to land typical values near 1, not to be exact.
export function getLightLinearIntensity(unit: LightUnit, value: number): number {
  return value * LINEAR_PER_UNIT[unit];
}

// The renderer-linear multiplier produced by one unit of each LightUnit. Unitless is the native
// scale (1:1). Lux and Candela anchor at 1 / 100000 (100000 physical units == linear 1.0). Lumen
// follows Candela through the isotropic-point-source identity lumen = candela * 4*PI, so one lumen is
// 1 / (4*PI) of a candela's linear contribution. See getLightLinearIntensity for the rationale.
const REFERENCE_PHOTOMETRIC_LEVEL = 100000;
const LINEAR_PER_UNIT: Readonly<Record<LightUnit, number>> = {
  [CandelaLightUnit]: 1 / REFERENCE_PHOTOMETRIC_LEVEL,
  [LumenLightUnit]: 1 / (REFERENCE_PHOTOMETRIC_LEVEL * 4 * Math.PI),
  [LuxLightUnit]: 1 / REFERENCE_PHOTOMETRIC_LEVEL,
  [UnitlessLightUnit]: 1,
};
