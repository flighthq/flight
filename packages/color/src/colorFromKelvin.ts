// Generated from crates/flight-color/src/color_from_kelvin.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Converts a color temperature in Kelvin to a packed sRGB-albedo RGBA color (0xrrggbbaa).
 * Uses the Tanner Helland piecewise approximation (accurate to within +/-1% for 1000 K-40000 K),
 * the same algorithm used in Blender, three.js, and Filament's color-temperature helper.
 * Temperatures outside the 1000-40000 K range clamp to the nearest supported endpoint.
 *
 * Common temperatures: 1800 K = candlelight, 3000 K = warm bulb, 5500 K = noon sunlight,
 * 6500 K = D65 white, 10000 K = overcast sky.
 */
export function colorFromKelvin(kelvin: number): number {
  const temp = Math.min(Math.max(kelvin, 1000.0), 40000.0) / 100.0;
  let r: number;
  let g: number;
  let b: number;
  if (temp <= 66.0) {
    r = 255.0;
  } else {
    r = 329.698727446 * Math.pow(temp - 60.0, -0.1332047592);
  }
  if (temp <= 66.0) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60.0, -0.0755148492);
  }
  if (temp >= 66.0) {
    b = 255.0;
  } else {
    if (temp <= 19.0) {
      b = 0.0;
    } else {
      b = 138.5177312231 * Math.log(temp - 10.0) - 305.0447927307;
    }
  }
  const ri = Math.min(Math.max(Math.round(r), 0.0), 255.0) >>> 0;
  const gi = Math.min(Math.max(Math.round(g), 0.0), 255.0) >>> 0;
  const bi = Math.min(Math.max(Math.round(b), 0.0), 255.0) >>> 0;
  return ((ri << 24) | (gi << 16) | (bi << 8) | 0xff) >>> 0;
}
