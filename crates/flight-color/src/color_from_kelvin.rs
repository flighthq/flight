/// Converts a color temperature in Kelvin to a packed sRGB-albedo RGBA color (0xrrggbbaa).
/// Uses the Tanner Helland piecewise approximation (accurate to within +/-1% for 1000 K-40000 K),
/// the same algorithm used in Blender, three.js, and Filament's color-temperature helper.
/// Temperatures outside the 1000-40000 K range clamp to the nearest supported endpoint.
///
/// Common temperatures: 1800 K = candlelight, 3000 K = warm bulb, 5500 K = noon sunlight,
/// 6500 K = D65 white, 10000 K = overcast sky.
#[allow(
    clippy::excessive_precision,
    clippy::manual_clamp,
    clippy::needless_late_init
)] // preserve the canonical approximation constants and portable TypeScript source shape
pub fn color_from_kelvin(kelvin: f32) -> u32 {
    let temp = kelvin.max(1000.0).min(40000.0) / 100.0;

    let r: f32;
    let g: f32;
    let b: f32;

    if temp <= 66.0 {
        r = 255.0;
    } else {
        r = 329.698727446 * (temp - 60.0).powf(-0.1332047592);
    }

    if temp <= 66.0 {
        g = 99.4708025861 * temp.ln() - 161.1195681661;
    } else {
        g = 288.1221695283 * (temp - 60.0).powf(-0.0755148492);
    }

    if temp >= 66.0 {
        b = 255.0;
    } else if temp <= 19.0 {
        b = 0.0;
    } else {
        b = 138.5177312231 * (temp - 10.0).ln() - 305.0447927307;
    }

    let ri = r.round().max(0.0).min(255.0) as u32;
    let gi = g.round().max(0.0).min(255.0) as u32;
    let bi = b.round().max(0.0).min(255.0) as u32;

    return (ri << 24) | (gi << 16) | (bi << 8) | 0xff;
}
