use crate::Adjustment;
use crate::ColorLut;
use crate::get_adjustment_color_matrix;
use crate::sample_color_lut;

/// Returns whether the adjustment can provide an rgb->rgb transform (either a LUT-tier transform
/// or a matrix-tier matrix-as-transform). Returns false for non-pointwise operations.
/// Replaces the TS `getAdjustmentColorTransform` which returned `ColorTransformFunction | null`.
pub fn get_adjustment_color_transform(adjustment: &Adjustment) -> bool {
    return match adjustment {
        Adjustment::ColorGrade(_) => true,
        Adjustment::HueSaturation(_) => true,
        Adjustment::LiftGammaGain(_) => true,
        Adjustment::LookupTableGrade(_) => true,
        _ => get_adjustment_color_matrix(adjustment).is_some(),
    };
}

/// Applies the rgb->rgb color transform for an adjustment. This is the enum dispatch that replaces
/// TS closures stored as `transform` on LUT-tier adjustments. For matrix-tier adjustments, the
/// 4x5 matrix is evaluated at opaque alpha (matching the TS `colorMatrixTransform` wrapper).
/// Alias-safe: reads from `r`, `g`, `b` before writing to `out`.
pub fn apply_color_transform(adjustment: &Adjustment, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    match adjustment {
        Adjustment::ColorGrade(a) => apply_color_grade_transform(a, out, r, g, b),
        Adjustment::HueSaturation(a) => apply_hue_saturation_transform(a, out, r, g, b),
        Adjustment::LiftGammaGain(a) => apply_lift_gamma_gain_transform(a, out, r, g, b),
        Adjustment::LookupTableGrade(a) => apply_lookup_table_grade_transform(a, out, r, g, b),
        _ => {
            if let Some(m) = get_adjustment_color_matrix(adjustment) {
                apply_color_matrix_transform(m, out, r, g, b);
            }
        }
    }
}

/// Wraps a 4x5 color matrix as an rgb->rgb transform on normalized color. Alpha is assumed opaque (1).
fn apply_color_matrix_transform(m: &[f32; 20], out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    out[0] = m[0] * r + m[1] * g + m[2] * b + m[3] + m[4];
    out[1] = m[5] * r + m[6] * g + m[7] * b + m[8] + m[9];
    out[2] = m[10] * r + m[11] * g + m[12] * b + m[13] + m[14];
}

fn apply_color_grade_transform(a: &crate::ColorGradeAdjustment, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    let exposure = (2.0_f32).powf(a.exposure);
    let lift = unpack_rgb(a.lift);
    let gamma_raw = unpack_rgb(a.gamma);
    let gain = unpack_rgb(a.gain);
    let gamma_exp: [f32; 3] = [
        1.0 / (gamma_raw[0] * 2.0).max(1e-3),
        1.0 / (gamma_raw[1] * 2.0).max(1e-3),
        1.0 / (gamma_raw[2] * 2.0).max(1e-3),
    ];
    let mut cr = r * exposure + a.brightness + a.temperature * 0.5;
    let mut cg = g * exposure + a.brightness + a.tint * 0.5;
    let mut cb = b * exposure + a.brightness - a.temperature * 0.5;
    let luma = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
    cr = luma + (cr - luma) * a.saturation;
    cg = luma + (cg - luma) * a.saturation;
    cb = luma + (cb - luma) * a.saturation;
    cr = (cr - 0.5) * a.contrast + 0.5;
    cg = (cg - 0.5) * a.contrast + 0.5;
    cb = (cb - 0.5) * a.contrast + 0.5;
    cr = ((cr * gain[0] + lift[0] * (1.0 - cr)).max(0.0)).powf(gamma_exp[0]);
    cg = ((cg * gain[1] + lift[1] * (1.0 - cg)).max(0.0)).powf(gamma_exp[1]);
    cb = ((cb * gain[2] + lift[2] * (1.0 - cb)).max(0.0)).powf(gamma_exp[2]);
    out[0] = clamp01(cr);
    out[1] = clamp01(cg);
    out[2] = clamp01(cb);
}

fn apply_hue_saturation_transform(a: &crate::HueSaturationAdjustment, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    let hue_offset = a.hue / 360.0;
    let saturation = a.saturation;
    let lightness = a.lightness;
    let mx = r.max(g).max(b);
    let mn = r.min(g).min(b);
    let mut h = 0.0_f32;
    let mut s = 0.0_f32;
    let l = (mx + mn) * 0.5;
    let d = mx - mn;
    if d > 0.0001 {
        s = if l < 0.5 { d / (mx + mn) } else { d / (2.0 - mx - mn) };
        if mx == r {
            h = (g - b) / d + (if g < b { 6.0 } else { 0.0 });
        } else if mx == g {
            h = (b - r) / d + 2.0;
        } else {
            h = (r - g) / d + 4.0;
        }
        h /= 6.0;
    }
    h = fract(h + hue_offset);
    s = clamp01(s * saturation);
    let ln = clamp01(l + lightness);
    if s <= 0.0 {
        out[0] = ln;
        out[1] = ln;
        out[2] = ln;
        return;
    }
    let q = if ln < 0.5 { ln * (1.0 + s) } else { ln + s - ln * s };
    let p = 2.0 * ln - q;
    out[0] = hue2rgb(p, q, h + 1.0 / 3.0);
    out[1] = hue2rgb(p, q, h);
    out[2] = hue2rgb(p, q, h - 1.0 / 3.0);
}

fn apply_lift_gamma_gain_transform(a: &crate::LiftGammaGainAdjustment, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    let lift = unpack_rgb(a.lift);
    let gamma_raw = unpack_rgb(a.gamma);
    let gain = unpack_rgb(a.gain);
    let gamma_exp: [f32; 3] = [
        1.0 / (gamma_raw[0] * 2.0).max(1e-3),
        1.0 / (gamma_raw[1] * 2.0).max(1e-3),
        1.0 / (gamma_raw[2] * 2.0).max(1e-3),
    ];
    out[0] = clamp01(((r * gain[0] + lift[0] * (1.0 - r)).max(0.0)).powf(gamma_exp[0]));
    out[1] = clamp01(((g * gain[1] + lift[1] * (1.0 - g)).max(0.0)).powf(gamma_exp[1]));
    out[2] = clamp01(((b * gain[2] + lift[2] * (1.0 - b)).max(0.0)).powf(gamma_exp[2]));
}

fn apply_lookup_table_grade_transform(a: &crate::LookupTableGradeAdjustment, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    if a.lut.is_none() || a.strength <= 0.0 {
        out[0] = r;
        out[1] = g;
        out[2] = b;
        return;
    }
    let lut = a.lut.as_ref().unwrap();
    sample_color_lut(lut, out, r, g, b);
    out[0] = r + (out[0] - r) * a.strength;
    out[1] = g + (out[1] - g) * a.strength;
    out[2] = b + (out[2] - b) * a.strength;
}

/// Sets up a LUT-tier adjustment. In Rust there is no transform closure to set (it is enum
/// dispatch), so this mirrors the TS API surface.
pub fn initialize_color_lut_adjustment(_adjustment: &Adjustment) {
    // In Rust the transform is enum dispatch, not a stored closure.
    // This function exists to match the TS API surface.
}

/// Type guard: true when the adjustment carries a nonlinear rgb->rgb transform (LUT-tier). Matrix-tier
/// adjustments are NOT LUT-tier.
pub fn is_color_lut_adjustment(adjustment: &Adjustment) -> bool {
    return matches!(
        adjustment,
        Adjustment::ColorGrade(_)
            | Adjustment::HueSaturation(_)
            | Adjustment::LiftGammaGain(_)
            | Adjustment::LookupTableGrade(_)
    );
}

fn clamp01(v: f32) -> f32 {
    return if v < 0.0 { 0.0 } else if v > 1.0 { 1.0 } else { v };
}

fn fract(v: f32) -> f32 {
    return v - v.floor();
}

fn hue2rgb(p: f32, q: f32, t_raw: f32) -> f32 {
    let mut t = t_raw;
    if t < 0.0 { t += 1.0; }
    if t > 1.0 { t -= 1.0; }
    if t < 1.0 / 6.0 { return p + (q - p) * 6.0 * t; }
    if t < 1.0 / 2.0 { return q; }
    if t < 2.0 / 3.0 { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    return p;
}

fn unpack_rgb(c: u32) -> [f32; 3] {
    return [
        ((c >> 24) & 255) as f32 / 255.0,
        ((c >> 16) & 255) as f32 / 255.0,
        ((c >> 8) & 255) as f32 / 255.0,
    ];
}
