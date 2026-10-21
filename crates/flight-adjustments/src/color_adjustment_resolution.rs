use std::sync::PoisonError;

use flight_entity::Ref;
use flight_materials::ColorScaleBias;

use crate::contract::Adjustment;
use crate::contract::fuse_color_matrices;
use crate::contract::get_adjustment_color_matrix;

/// Resolution status: empty stack -- no tint.
pub const COLOR_ADJUSTMENT_NONE: u32 = 0;
/// Resolution status: fully representable as one 8-float ColorScaleBias.
pub const COLOR_ADJUSTMENT_AFFINE: u32 = 1;
/// Resolution status: a full matrix or unsupported non-matrix op is present.
pub const COLOR_ADJUSTMENT_CHANNEL_MIXING: u32 = 2;

/// True when `matrix` has no off-diagonal RGB/A coefficients, i.e. it is a per-channel scale + bias
/// that an 8-float ColorScaleBias can represent exactly.
pub fn is_affine_color_matrix(matrix: &[f32; 20]) -> bool {
    return matrix[1] == 0.0
        && matrix[2] == 0.0
        && matrix[3] == 0.0
        && matrix[5] == 0.0
        && matrix[7] == 0.0
        && matrix[8] == 0.0
        && matrix[10] == 0.0
        && matrix[11] == 0.0
        && matrix[13] == 0.0
        && matrix[15] == 0.0
        && matrix[16] == 0.0
        && matrix[17] == 0.0;
}

/// Resolves a stack to its complete fused 4x5 matrix when every member is matrix-tier. Returns None
/// for an empty stack or when a non-matrix operation prevents exact inline fusion.
// flight-lint: allow(conform-array) user-approved: fixed 4x5 color matrix buffer → Float32Array (D0 exception)
pub fn resolve_color_adjustments_color_matrix(adjustments: Option<&[Ref<dyn Adjustment>]>) -> Option<[f32; 20]> {
    let adjs = match adjustments {
        Some(a) if !a.is_empty() => a,
        _ => return None,
    };
    let mut owned: Vec<[f32; 20]> = Vec::new();
    for adj in adjs {
        let operation = adj.read().unwrap_or_else(PoisonError::into_inner);
        match get_adjustment_color_matrix(&*operation) {
            Some(matrix) => owned.push(*matrix),
            None => return None,
        }
    }
    let matrices: Vec<&[f32; 20]> = owned.iter().collect();
    return Some(fuse_color_matrices(&matrices));
}

/// Fuses a node's color-adjustment stack into the single affine ColorScaleBias, writing per-channel
/// scale + normalized-linear bias into `out`, and returns the resolution status.
pub fn resolve_color_adjustments_color_scale_bias(
    adjustments: Option<&[Ref<dyn Adjustment>]>,
    out: &mut ColorScaleBias,
) -> u32 {
    let adjs = match adjustments {
        Some(a) if !a.is_empty() => a,
        _ => return COLOR_ADJUSTMENT_NONE,
    };
    let mut owned: Vec<[f32; 20]> = Vec::new();
    let mut inlineable = true;
    for adj in adjs {
        let operation = adj.read().unwrap_or_else(PoisonError::into_inner);
        match get_adjustment_color_matrix(&*operation) {
            Some(matrix) => owned.push(*matrix),
            None => inlineable = false,
        }
    }
    let matrices: Vec<&[f32; 20]> = owned.iter().collect();
    let fused = fuse_color_matrices(&matrices);
    out.red_scale = fused[0];
    out.green_scale = fused[6];
    out.blue_scale = fused[12];
    out.alpha_scale = fused[18];
    out.red_bias = fused[4];
    out.green_bias = fused[9];
    out.blue_bias = fused[14];
    out.alpha_bias = fused[19];
    return if inlineable && is_affine_color_matrix(&fused) {
        COLOR_ADJUSTMENT_AFFINE
    } else {
        COLOR_ADJUSTMENT_CHANNEL_MIXING
    };
}
