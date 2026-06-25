// Color-temperature recipe math. Substrate-agnostic helpers shared by WhiteBalanceEffect and
// ColorGradeEffect backends so temperature/tint handling is one implementation, not re-derived per
// backend. All functions are alias-safe.

// Converts a color temperature in Kelvin to approximate linear-light RGB multipliers using the
// Tanner-Helland approximation (widely used in real-time; accurate to within ~1 % over 1000–40000 K).
// Writes [r, g, b] into `out` (values near 1). The returned multipliers are un-normalized — the
// green channel is pinned to 1.0 so the result is a tint rather than a luminance change.
// Alias-safe: writes each channel after computing all inputs.
export function computeColorTemperatureRgb(kelvin: number, out: [number, number, number]): void {
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (temp <= 66) {
    r = 1.0;
    g = (99.4708025861 * Math.log(temp) - 161.1195681661) / 255;
    b = temp <= 19 ? 0 : (138.5177312231 * Math.log(temp - 10) - 305.0447927307) / 255;
  } else {
    r = (329.698727446 * Math.pow(temp - 60, -0.1332047592)) / 255;
    g = (288.1221695283 * Math.pow(temp - 60, -0.0755148492)) / 255;
    b = 1.0;
  }
  out[0] = Math.max(0, Math.min(1, r));
  out[1] = Math.max(0, Math.min(1, g));
  out[2] = Math.max(0, Math.min(1, b));
}

// Derives per-channel [r, g, b] white-balance multipliers from a normalized temperature and tint
// offset (both in [-1, 1] as used by WhiteBalanceEffect). Maps the offsets to Kelvin deviations
// around a daylight reference (6500 K) and adds a chromatic tint on the green-magenta axis.
// Writes [r, g, b] into `out`. Alias-safe.
export function computeWhiteBalanceMultipliers(
  temperature: number, // [-1..1]. Negative = cool (bluish), positive = warm (yellowish).
  tint: number, // [-1..1]. Negative = green, positive = magenta.
  out: [number, number, number],
): void {
  // Map [-1..1] temperature to [2000..11000] K centered at 6500 K daylight.
  // Positive = warm = lower K (toward incandescent 2700 K); negative = cool = higher K (toward 11000 K).
  const kelvin = 6500 - temperature * 4500;
  computeColorTemperatureRgb(kelvin, out);
  // Apply tint: positive tint adds magenta (boosts R/B, reduces G); negative adds green (boosts G).
  const greenShift = -tint * 0.1;
  out[0] = Math.max(0, out[0]);
  out[1] = Math.max(0, out[1] + greenShift);
  out[2] = Math.max(0, out[2]);
}
