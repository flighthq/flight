/// Color-matrix math: preset builders, combinators, and evaluation for 4x5 RGBA color matrices.
///
/// A color-matrix is a 4x5 affine transform applied to premultiplied RGBA color vectors:
///   | R' |   | m0  m1  m2  m3  m4  |   | R |
///   | G' | = | m5  m6  m7  m8  m9  | x | G |
///   | B' |   | m10 m11 m12 m13 m14 |   | B |
///   | A' |   | m15 m16 m17 m18 m19 |   | A |
///                                       | 1 |
///
/// Row 0 = R output coefficients (R, G, B, A inputs, then R offset).
/// Row 1 = G output coefficients.
/// Row 2 = B output coefficients.
/// Row 3 = A output coefficients.
///
/// The bias column (indices 4, 9, 14, 19) uses normalized-linear, unbounded float units.

/// Required length of a valid color-matrix array.
pub const COLOR_MATRIX_LENGTH: usize = 20;

/// Evaluates `matrix` against a packed `0xRRGGBBAA` color. Useful for previews and tests; pure
/// math, no surface operations. Input bytes are normalized before applying the matrix; the result is
/// clamped to 0-1 and repacked as `0xRRGGBBAA`.
pub fn apply_color_matrix_to_color(matrix: &[f32; 20], packed_rgba: u32) -> u32 {
    let r = ((packed_rgba >> 24) & 0xff) as f32 / 255.0;
    let g = ((packed_rgba >> 16) & 0xff) as f32 / 255.0;
    let b = ((packed_rgba >> 8) & 0xff) as f32 / 255.0;
    let a = (packed_rgba & 0xff) as f32 / 255.0;
    let r_out = clamp_normalized_byte(matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4]);
    let g_out = clamp_normalized_byte(matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9]);
    let b_out = clamp_normalized_byte(matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14]);
    let a_out = clamp_normalized_byte(matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19]);
    return (r_out << 24) | (g_out << 16) | (b_out << 8) | a_out;
}

/// Composes `source` into `target` in place: `target = target x source` (applies source first,
/// then target). Matches OpenFL color-matrix `concat` semantics. Alias-safe: `source` may be
/// `target`.
pub fn concat_color_matrix(target: &mut [f32; 20], source: &[f32; 20]) {
    let target_copy = *target;
    multiply_color_matrix(target, &target_copy, source);
}

/// Returns a color matrix that adds `amount` to the brightness offset of each channel. Positive
/// `amount` brightens; negative darkens. `amount` is normalized-linear. Allocates a new array.
pub fn create_brightness_color_matrix(amount: f32) -> [f32; 20] {
    return [
        1.0, 0.0, 0.0, 0.0, amount,
        0.0, 1.0, 0.0, 0.0, amount,
        0.0, 0.0, 1.0, 0.0, amount,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a channel-mixer color matrix. Each `[r, g, b]` triple defines the source mix for the
/// corresponding output channel. Values are in the 0-1 range (1 = full contribution).
///
/// Example: `create_channel_mixer_color_matrix([1, 0, 0], [0, 1, 0], [0, 0, 1])` is the identity.
/// Swapping channels: `create_channel_mixer_color_matrix([0, 1, 0], [1, 0, 0], [0, 0, 1])` swaps R/G.
pub fn create_channel_mixer_color_matrix(
    red_out: &[f32; 3],
    green_out: &[f32; 3],
    blue_out: &[f32; 3],
) -> [f32; 20] {
    return [
        red_out[0], red_out[1], red_out[2], 0.0, 0.0,
        green_out[0], green_out[1], green_out[2], 0.0, 0.0,
        blue_out[0], blue_out[1], blue_out[2], 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a color balance matrix that independently shifts highlights, midtones, and shadows.
/// Each parameter is a `[red, green, blue]` offset in the -100..100 range, mapped to normalized
/// -1..1 biases.
pub fn create_color_balance_color_matrix(
    shadows: &[f32; 3],
    midtones: &[f32; 3],
    highlights: &[f32; 3],
) -> [f32; 20] {
    let scale = 1.0 / 100.0;
    let r_off = (shadows[0] * 0.25 + midtones[0] * 0.5 + highlights[0] * 0.25) * scale;
    let g_off = (shadows[1] * 0.25 + midtones[1] * 0.5 + highlights[1] * 0.25) * scale;
    let b_off = (shadows[2] * 0.25 + midtones[2] * 0.5 + highlights[2] * 0.25) * scale;
    return [
        1.0, 0.0, 0.0, 0.0, r_off,
        0.0, 1.0, 0.0, 0.0, g_off,
        0.0, 0.0, 1.0, 0.0, b_off,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a color matrix that tints toward `packed_rgba` (0xRRGGBBAA) by `amount` (0 = original,
/// 1 = solid tint color).
pub fn create_color_matrix_from_tint(packed_rgba: u32, amount: f32) -> [f32; 20] {
    let tr = (((packed_rgba >> 24) & 0xff) as f32 / 255.0) * amount;
    let tg = (((packed_rgba >> 16) & 0xff) as f32 / 255.0) * amount;
    let tb = (((packed_rgba >> 8) & 0xff) as f32 / 255.0) * amount;
    let keep = 1.0 - amount;
    return [
        keep, 0.0, 0.0, 0.0, tr,
        0.0, keep, 0.0, 0.0, tg,
        0.0, 0.0, keep, 0.0, tb,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a color matrix that scales contrast by `amount` (1 = original, 0 = flat mid-grey, >1 =
/// increased contrast).
pub fn create_contrast_color_matrix(amount: f32) -> [f32; 20] {
    let offset = 0.5 * (1.0 - amount);
    return [
        amount, 0.0, 0.0, 0.0, offset,
        0.0, amount, 0.0, 0.0, offset,
        0.0, 0.0, amount, 0.0, offset,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a color matrix that desaturates by `amount` (0 = no change, 1 = fully desaturated /
/// grayscale). Equivalent to `create_saturation_color_matrix(1 - amount)`.
pub fn create_desaturate_color_matrix(amount: f32) -> [f32; 20] {
    return create_saturation_color_matrix(1.0 - amount);
}

/// Returns a grayscale color matrix using luma-weighted ITU-R BT.601 coefficients
/// (R=0.299, G=0.587, B=0.114).
pub fn create_grayscale_color_matrix() -> [f32; 20] {
    let r = 0.299;
    let g = 0.587;
    let b = 0.114;
    return [
        r, g, b, 0.0, 0.0,
        r, g, b, 0.0, 0.0,
        r, g, b, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a hue-rotation color matrix that rotates the hue wheel by `degrees`.
pub fn create_hue_rotate_color_matrix(degrees: f32) -> [f32; 20] {
    let rad = degrees * std::f32::consts::PI / 180.0;
    let cos = rad.cos();
    let sin = rad.sin();
    let lum_r = 0.213;
    let lum_g = 0.715;
    let lum_b = 0.072;
    return [
        lum_r + cos * (1.0 - lum_r) + sin * -lum_r, lum_g + cos * -lum_g + sin * -lum_g, lum_b + cos * -lum_b + sin * (1.0 - lum_b), 0.0, 0.0,
        lum_r + cos * -lum_r + sin * 0.143, lum_g + cos * (1.0 - lum_g) + sin * 0.140, lum_b + cos * -lum_b + sin * -0.283, 0.0, 0.0,
        lum_r + cos * -lum_r + sin * -(1.0 - lum_r), lum_g + cos * -lum_g + sin * lum_g, lum_b + cos * (1.0 - lum_b) + sin * lum_b, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns the identity color matrix. Applying it leaves colors unchanged.
pub fn create_identity_color_matrix() -> [f32; 20] {
    return [
        1.0, 0.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns an invert color matrix that produces `1 - channel` per RGB channel. Alpha is
/// unchanged.
pub fn create_invert_color_matrix() -> [f32; 20] {
    return [
        -1.0, 0.0, 0.0, 0.0, 1.0,
        0.0, -1.0, 0.0, 0.0, 1.0,
        0.0, 0.0, -1.0, 0.0, 1.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a levels color matrix that remaps the input range `[in_black, in_white]` to the output
/// range `[out_black, out_white]` with optional `gamma` correction. All values are normalized 0-1.
pub fn create_levels_color_matrix(
    in_black: f32,
    in_white: f32,
    out_black: f32,
    out_white: f32,
    gamma: f32,
) -> [f32; 20] {
    let in_range = in_white - in_black;
    let scale = if in_range == 0.0 { 1.0 } else { (out_white - out_black) / in_range };
    let gamma_corrected_scale = scale * (if gamma == 1.0 { 1.0 } else { (0.5_f32).powf(1.0 / gamma - 1.0) });
    let offset = out_black - in_black * gamma_corrected_scale;
    return [
        gamma_corrected_scale, 0.0, 0.0, 0.0, offset,
        0.0, gamma_corrected_scale, 0.0, 0.0, offset,
        0.0, 0.0, gamma_corrected_scale, 0.0, offset,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a color matrix that scales the alpha channel by `alpha` (0 = transparent, 1 = opaque).
/// RGB channels are unchanged.
pub fn create_opacity_color_matrix(alpha: f32) -> [f32; 20] {
    return [
        1.0, 0.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 0.0, alpha, 0.0,
    ];
}

/// Returns a color matrix that applies a Polaroid-style warm orange-tint look.
pub fn create_polaroid_color_matrix() -> [f32; 20] {
    return [
        1.438, -0.062, -0.062, 0.0, -31.8 / 255.0,
        -0.122, 1.378, -0.122, 0.0, 16.2 / 255.0,
        -0.016, -0.016, 1.484, 0.0, -47.6 / 255.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a color matrix that scales color saturation by `amount` (0 = grayscale, 1 = original,
/// >1 = oversaturated).
pub fn create_saturation_color_matrix(amount: f32) -> [f32; 20] {
    let r = 0.299 * (1.0 - amount);
    let g = 0.587 * (1.0 - amount);
    let b = 0.114 * (1.0 - amount);
    return [
        r + amount, g, b, 0.0, 0.0,
        r, g + amount, b, 0.0, 0.0,
        r, g, b + amount, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a sepia-tone color matrix.
pub fn create_sepia_color_matrix() -> [f32; 20] {
    return [
        0.393, 0.769, 0.189, 0.0, 0.0,
        0.349, 0.686, 0.168, 0.0, 0.0,
        0.272, 0.534, 0.131, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a color matrix approximating the Technicolor two-strip process: warm reds/oranges
/// with cyan shadows and a slight green cross-process.
pub fn create_technicolor_color_matrix() -> [f32; 20] {
    return [
        1.9126, -0.8, -0.09, 0.0, 11.79 / 255.0,
        -0.2, 1.7, -0.27, 0.0, -14.69 / 255.0,
        -0.14, -0.21, 1.62, 0.0, -3.38 / 255.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a vintage/faded-film color matrix: desaturated, warm tones, lifted blacks.
pub fn create_vintage_color_matrix() -> [f32; 20] {
    return [
        0.9, 0.05, 0.05, 0.0, 10.0 / 255.0,
        0.0, 0.85, 0.0, 0.0, 5.0 / 255.0,
        0.0, 0.0, 0.75, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Returns a white-balance color matrix that adjusts color temperature toward warm (positive
/// `temperature` values) or cool (negative) and tint toward green (positive `tint`) or magenta
/// (negative). Both parameters are in the -100..100 range.
pub fn create_white_balance_color_matrix(temperature: f32, tint: f32) -> [f32; 20] {
    let temp_scale = temperature / 100.0;
    let tint_scale = tint / 100.0;
    let r_gain = 1.0 + temp_scale * 0.3;
    let g_gain = 1.0 + tint_scale * 0.15;
    let b_gain = 1.0 - temp_scale * 0.3;
    return [
        r_gain, 0.0, 0.0, 0.0, 0.0,
        0.0, g_gain, 0.0, 0.0, 0.0,
        0.0, 0.0, b_gain, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0, 0.0,
    ];
}

/// Fuses a run of color matrices into ONE matrix that applies them left-to-right (index 0 first, then
/// 1, ...). This is the matrix-tier fuse: a stack of consecutive matrix-tier adjustments collapses to a
/// single 4x5 matrix. Order matters (matrix composition is not commutative); an empty list yields the
/// identity.
pub fn fuse_color_matrices(matrices: &[&[f32; 20]]) -> [f32; 20] {
    if matrices.is_empty() {
        return create_identity_color_matrix();
    }
    let mut out = *matrices[0];
    for i in 1..matrices.len() {
        let b_copy = out;
        multiply_color_matrix(&mut out, matrices[i], &b_copy);
    }
    return out;
}

/// Composes matrix `b` applied first and then `a`. The result is equivalent to applying `b` to a
/// color and then `a` to the result. The result is written to `out`. Alias-safe: `out` may be `a`
/// or `b`.
pub fn multiply_color_matrix(out: &mut [f32; 20], a: &[f32; 20], b: &[f32; 20]) {
    let a0 = a[0]; let a1 = a[1]; let a2 = a[2]; let a3 = a[3]; let a4 = a[4];
    let a5 = a[5]; let a6 = a[6]; let a7 = a[7]; let a8 = a[8]; let a9 = a[9];
    let a10 = a[10]; let a11 = a[11]; let a12 = a[12]; let a13 = a[13]; let a14 = a[14];
    let a15 = a[15]; let a16 = a[16]; let a17 = a[17]; let a18 = a[18]; let a19 = a[19];
    let b0 = b[0]; let b1 = b[1]; let b2 = b[2]; let b3 = b[3]; let b4 = b[4];
    let b5 = b[5]; let b6 = b[6]; let b7 = b[7]; let b8 = b[8]; let b9 = b[9];
    let b10 = b[10]; let b11 = b[11]; let b12 = b[12]; let b13 = b[13]; let b14 = b[14];
    let b15 = b[15]; let b16 = b[16]; let b17 = b[17]; let b18 = b[18]; let b19 = b[19];
    // Row 0 (R output)
    out[0] = a0 * b0 + a1 * b5 + a2 * b10 + a3 * b15;
    out[1] = a0 * b1 + a1 * b6 + a2 * b11 + a3 * b16;
    out[2] = a0 * b2 + a1 * b7 + a2 * b12 + a3 * b17;
    out[3] = a0 * b3 + a1 * b8 + a2 * b13 + a3 * b18;
    out[4] = a0 * b4 + a1 * b9 + a2 * b14 + a3 * b19 + a4;
    // Row 1 (G output)
    out[5] = a5 * b0 + a6 * b5 + a7 * b10 + a8 * b15;
    out[6] = a5 * b1 + a6 * b6 + a7 * b11 + a8 * b16;
    out[7] = a5 * b2 + a6 * b7 + a7 * b12 + a8 * b17;
    out[8] = a5 * b3 + a6 * b8 + a7 * b13 + a8 * b18;
    out[9] = a5 * b4 + a6 * b9 + a7 * b14 + a8 * b19 + a9;
    // Row 2 (B output)
    out[10] = a10 * b0 + a11 * b5 + a12 * b10 + a13 * b15;
    out[11] = a10 * b1 + a11 * b6 + a12 * b11 + a13 * b16;
    out[12] = a10 * b2 + a11 * b7 + a12 * b12 + a13 * b17;
    out[13] = a10 * b3 + a11 * b8 + a12 * b13 + a13 * b18;
    out[14] = a10 * b4 + a11 * b9 + a12 * b14 + a13 * b19 + a14;
    // Row 3 (A output)
    out[15] = a15 * b0 + a16 * b5 + a17 * b10 + a18 * b15;
    out[16] = a15 * b1 + a16 * b6 + a17 * b11 + a18 * b16;
    out[17] = a15 * b2 + a16 * b7 + a17 * b12 + a18 * b17;
    out[18] = a15 * b3 + a16 * b8 + a17 * b13 + a18 * b18;
    out[19] = a15 * b4 + a16 * b9 + a17 * b14 + a18 * b19 + a19;
}

fn clamp_normalized_byte(v: f32) -> u32 {
    let clamped = if v * 255.0 < 0.0 { 0.0 } else if v * 255.0 > 255.0 { 255.0 } else { v * 255.0 };
    return (clamped + 0.5) as u32;
}
