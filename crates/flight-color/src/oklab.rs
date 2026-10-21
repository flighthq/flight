/// Clamps linear sRGB channels to the displayable [0, 1] gamut, writing [r, g, b] into `out`.
/// This is a channel clamp, not a perceptual gamut-mapping operation. Alias-safe.
pub fn clamp_linear_rgb(out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    out[0] = r.max(0.0).min(1.0);
    out[1] = g.max(0.0).min(1.0);
    out[2] = b.max(0.0).min(1.0);
}

/// Converts linear sRGB [0..1] to Oklab, writing [L, a, b] into `out` (L in [0..1],
/// a/b in ~[-0.5..0.5]). Oklab is a perceptually uniform space; equal steps in L, a, b are
/// visually equal. Reference: Ottosson 2020. Alias-safe.
pub fn linear_rgb_to_oklab(out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    let l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    let m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    let s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    let lc = l.max(0.0).cbrt();
    let mc = m.max(0.0).cbrt();
    let sc = s.max(0.0).cbrt();
    out[0] = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
    out[1] = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
    out[2] = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;
}

/// Converts Oklab [L, a, b] back to unclamped linear sRGB, writing [r, g, b] into `out`.
/// Negative and greater-than-one channels are preserved so this remains a true inverse; callers that
/// require the displayable sRGB gamut can compose the result with `clamp_linear_rgb`. Alias-safe.
pub fn oklab_to_linear_rgb(out: &mut [f32; 3], l: f32, a: f32, b: f32) {
    let lc = l + 0.3963377774 * a + 0.2158037573 * b;
    let mc = l - 0.1055613458 * a - 0.0638541728 * b;
    let sc = l - 0.0894841775 * a - 1.291485548 * b;
    let l_cube = lc * lc * lc;
    let m = mc * mc * mc;
    let s = sc * sc * sc;
    out[0] = 4.0767416621 * l_cube - 3.3077115913 * m + 0.2309699292 * s;
    out[1] = -1.2684380046 * l_cube + 2.6097574011 * m - 0.3413193965 * s;
    out[2] = -0.0041960863 * l_cube - 0.7034186147 * m + 1.707614701 * s;
}
