// Converts a color temperature in Kelvin to a packed sRgb-albedo RGBA color (0xrrggbbaa).
// Uses the Tanner Helland piecewise approximation (accurate to within ±1% for 1000 K–40000 K),
// the same algorithm used in Blender, three.js, and Filament's color-temperature helper.
// Returns opaque white (0xffffffff) for temperatures outside the 1000–40000 K range.
//
// Common temperatures: 1800 K = candlelight, 3000 K = warm bulb, 5500 K = noon sunlight,
// 6500 K = D65 white, 10000 K = overcast sky.
export function colorFromKelvin(kelvin: number): number {
  // Clamp to the valid range.
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;

  let r: number;
  let g: number;
  let b: number;

  // Red channel.
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  }

  // Green channel.
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  // Blue channel.
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  const ri = Math.max(0, Math.min(255, Math.round(r)));
  const gi = Math.max(0, Math.min(255, Math.round(g)));
  const bi = Math.max(0, Math.min(255, Math.round(b)));

  // Pack as 0xrrggbbaa with fully opaque alpha.
  return ((ri << 24) | (gi << 16) | (bi << 8) | 0xff) >>> 0;
}
