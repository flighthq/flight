//! Scratch render-target counts for the GL filter passes.
//!
//! Each `get_*_filter_gl_scratch_count` reports how many scratch render targets
//! the matching `apply_*_filter_to_gl` requires. Callers must allocate at least
//! this many targets of the same dimensions as `dest` before invoking the
//! filter. Single-pass filters need none and return 0.

/// Returns the number of scratch render targets required by `apply_bevel_filter_to_gl`.
pub fn get_bevel_filter_gl_scratch_count() -> u32 {
    3
}

/// Returns the number of scratch render targets required by `apply_color_matrix_filter_to_gl`.
/// The color-matrix filter is a single GPU pass — no scratch targets needed.
pub fn get_color_matrix_filter_gl_scratch_count() -> u32 {
    0
}

/// Returns the number of scratch render targets required by `apply_convolution_filter_to_gl`.
/// The convolution filter is a single GPU pass — no scratch targets needed.
pub fn get_convolution_filter_gl_scratch_count() -> u32 {
    0
}

/// Returns the number of scratch render targets required by `apply_displacement_map_filter_to_gl`.
/// The displacement map filter is a single GPU pass — no scratch targets needed.
pub fn get_displacement_map_filter_gl_scratch_count() -> u32 {
    0
}

/// Returns the number of scratch render targets required by `apply_drop_shadow_filter_to_gl`.
pub fn get_drop_shadow_filter_gl_scratch_count() -> u32 {
    3
}

/// Returns the number of scratch render targets required by `apply_gradient_bevel_filter_to_gl`.
pub fn get_gradient_bevel_filter_gl_scratch_count() -> u32 {
    3
}

/// Returns the number of scratch render targets required by `apply_gradient_glow_filter_to_gl`.
pub fn get_gradient_glow_filter_gl_scratch_count() -> u32 {
    3
}

/// Returns the number of scratch render targets required by `apply_inner_glow_filter_to_gl`.
pub fn get_inner_glow_filter_gl_scratch_count() -> u32 {
    3
}

/// Returns the number of scratch render targets required by `apply_inner_shadow_filter_to_gl`.
pub fn get_inner_shadow_filter_gl_scratch_count() -> u32 {
    3
}

/// Returns the number of scratch render targets required by `apply_median_filter_to_gl`.
/// The median filter is a single GPU pass — no scratch targets needed.
pub fn get_median_filter_gl_scratch_count() -> u32 {
    0
}

/// Returns the number of scratch render targets required by `apply_outer_glow_filter_to_gl`.
pub fn get_outer_glow_filter_gl_scratch_count() -> u32 {
    3
}

/// Returns the number of scratch render targets required by `apply_pixelate_filter_to_gl`.
/// The pixelate filter is a single GPU pass — no scratch targets needed.
pub fn get_pixelate_filter_gl_scratch_count() -> u32 {
    0
}

/// Returns the number of scratch render targets required by `apply_sharpen_filter_to_gl`.
/// Note: sharpen uses two targets (blurred, blur ping-pong temp), not three.
pub fn get_sharpen_filter_gl_scratch_count() -> u32 {
    2
}

#[cfg(test)]
mod tests {
    use super::*;

    // get_bevel_filter_gl_scratch_count

    #[test]
    fn get_bevel_filter_gl_scratch_count_returns_3() {
        assert_eq!(get_bevel_filter_gl_scratch_count(), 3);
    }

    // get_color_matrix_filter_gl_scratch_count

    #[test]
    fn get_color_matrix_filter_gl_scratch_count_returns_0() {
        assert_eq!(get_color_matrix_filter_gl_scratch_count(), 0);
    }

    // get_convolution_filter_gl_scratch_count

    #[test]
    fn get_convolution_filter_gl_scratch_count_returns_0() {
        assert_eq!(get_convolution_filter_gl_scratch_count(), 0);
    }

    // get_displacement_map_filter_gl_scratch_count

    #[test]
    fn get_displacement_map_filter_gl_scratch_count_returns_0() {
        assert_eq!(get_displacement_map_filter_gl_scratch_count(), 0);
    }

    // get_drop_shadow_filter_gl_scratch_count

    #[test]
    fn get_drop_shadow_filter_gl_scratch_count_returns_3() {
        assert_eq!(get_drop_shadow_filter_gl_scratch_count(), 3);
    }

    // get_gradient_bevel_filter_gl_scratch_count

    #[test]
    fn get_gradient_bevel_filter_gl_scratch_count_returns_3() {
        assert_eq!(get_gradient_bevel_filter_gl_scratch_count(), 3);
    }

    // get_gradient_glow_filter_gl_scratch_count

    #[test]
    fn get_gradient_glow_filter_gl_scratch_count_returns_3() {
        assert_eq!(get_gradient_glow_filter_gl_scratch_count(), 3);
    }

    // get_inner_glow_filter_gl_scratch_count

    #[test]
    fn get_inner_glow_filter_gl_scratch_count_returns_3() {
        assert_eq!(get_inner_glow_filter_gl_scratch_count(), 3);
    }

    // get_inner_shadow_filter_gl_scratch_count

    #[test]
    fn get_inner_shadow_filter_gl_scratch_count_returns_3() {
        assert_eq!(get_inner_shadow_filter_gl_scratch_count(), 3);
    }

    // get_median_filter_gl_scratch_count

    #[test]
    fn get_median_filter_gl_scratch_count_returns_0() {
        assert_eq!(get_median_filter_gl_scratch_count(), 0);
    }

    // get_outer_glow_filter_gl_scratch_count

    #[test]
    fn get_outer_glow_filter_gl_scratch_count_returns_3() {
        assert_eq!(get_outer_glow_filter_gl_scratch_count(), 3);
    }

    // get_pixelate_filter_gl_scratch_count

    #[test]
    fn get_pixelate_filter_gl_scratch_count_returns_0() {
        assert_eq!(get_pixelate_filter_gl_scratch_count(), 0);
    }

    // get_sharpen_filter_gl_scratch_count

    #[test]
    fn get_sharpen_filter_gl_scratch_count_returns_2() {
        assert_eq!(get_sharpen_filter_gl_scratch_count(), 2);
    }
}
