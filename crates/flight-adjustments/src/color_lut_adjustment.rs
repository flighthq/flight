use std::sync::Arc;

use crate::contract::Adjustment;
use crate::contract::ColorTransformFunction;
use crate::contract::get_adjustment_color_matrix;
use crate::contract::initialize_adjustment;

pub fn initialize_color_lut_adjustment<T: Adjustment>(
    out: &mut T,
    kind: &str,
    transform: ColorTransformFunction,
) {
    initialize_adjustment(out, kind);
    out.adjustment_fields_mut().transform = Some(transform);
}

pub(crate) fn clamp01(v: f32) -> f32 {
    return if v < 0.0 {
        0.0
    } else if v > 1.0 {
        1.0
    } else {
        v
    };
}

/// Wraps a 4x5 color matrix as an rgb->rgb transform on normalized color, at opaque alpha (TS
/// `colorMatrixTransform`).
fn color_matrix_transform(m: [f32; 20]) -> ColorTransformFunction {
    return Arc::new(move |out: &mut [f32; 3], r: f32, g: f32, b: f32| {
        out[0] = m[0] * r + m[1] * g + m[2] * b + m[3] + m[4];
        out[1] = m[5] * r + m[6] * g + m[7] * b + m[8] + m[9];
        out[2] = m[10] * r + m[11] * g + m[12] * b + m[13] + m[14];
    });
}

pub(crate) fn fract(v: f32) -> f32 {
    return v - v.floor();
}

/// Returns the rgb->rgb transform an operation contributes to a baked LUT: its own `transform` when
/// LUT-tier, its color matrix wrapped as a transform when matrix-tier, or None for a non-pointwise
/// operation. Structural: reads `transform` / `color_matrix`, never the kind.
pub fn get_adjustment_color_transform(
    operation: &dyn Adjustment,
) -> Option<ColorTransformFunction> {
    if let Some(transform) = &operation.adjustment_fields().transform {
        return Some(transform.clone());
    }
    return get_adjustment_color_matrix(operation).map(|m| color_matrix_transform(*m));
}

pub(crate) fn hue2rgb(p: f32, q: f32, t_raw: f32) -> f32 {
    let mut t = t_raw;
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 1.0 / 2.0 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    return p;
}

/// Type guard: true when the operation carries its own rgb->rgb `transform` (LUT-tier). Matrix-tier
/// adjustments are NOT LUT-tier.
pub fn is_color_lut_adjustment(operation: &dyn Adjustment) -> bool {
    return operation.adjustment_fields().transform.is_some();
}

pub(crate) fn unpack_rgb(c: u32) -> [f32; 3] {
    return [
        ((c >> 24) & 255) as f32 / 255.0,
        ((c >> 16) & 255) as f32 / 255.0,
        ((c >> 8) & 255) as f32 / 255.0,
    ];
}
