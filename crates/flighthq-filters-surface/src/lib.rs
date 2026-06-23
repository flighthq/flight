//! `flighthq-filters-surface` — filter-effect operations on CPU pixel data.
//!
//! All filters operate on raw `&[u8]` pixel buffers or `SurfaceRegion`s and
//! write their output into caller-supplied `out` slices. No GPU resources are
//! allocated. These are the CPU-side implementations of the filter descriptors
//! defined in `flighthq-filters`.

pub mod bevel;
pub mod blur;
pub mod color_matrix;
pub mod convolution;
pub mod displacement;
pub mod gradient;
pub mod median;
pub mod pixelate;
pub mod shadow;
pub mod sharpen;

// Re-export the complete public surface at the crate root.

// bevel
pub use bevel::{SurfaceBevelFilterOptions, SurfaceBevelType, apply_surface_bevel_filter};

// blur
pub use blur::{
    SurfaceBoxBlurFilterOptions, apply_surface_box_blur_filter, apply_surface_gaussian_blur_filter,
    blur_surface_pixels_horizontal, blur_surface_pixels_horizontal_weighted,
    blur_surface_pixels_vertical, blur_surface_pixels_vertical_weighted, compute_gaussian_kernel,
};

// color_matrix
pub use color_matrix::{
    apply_surface_color_matrix_filter, build_surface_brightness_color_matrix,
    build_surface_contrast_color_matrix, build_surface_grayscale_color_matrix,
    build_surface_hue_rotation_color_matrix, build_surface_invert_color_matrix,
    build_surface_saturation_color_matrix, build_surface_sepia_color_matrix,
    concat_surface_color_matrix, set_surface_color_matrix_identity,
};

// convolution
pub use convolution::{
    SurfaceConvolutionEdge, SurfaceConvolutionFilterOptions, apply_surface_convolution_filter,
};

// displacement
pub use displacement::{
    SurfaceDisplacementMapFilterOptions, SurfaceDisplacementMapMode,
    apply_surface_displacement_map_filter,
};

// gradient
pub use gradient::{
    SurfaceGradientBevelFilterOptions, SurfaceGradientGlowFilterOptions,
    apply_surface_gradient_bevel_filter, apply_surface_gradient_glow_filter,
    build_surface_gradient_ramp,
};

// median
pub use median::apply_surface_median_filter;

// pixelate
pub use pixelate::apply_surface_pixelate_filter;

// shadow
pub use shadow::{
    SurfaceBlurOptions, SurfaceDropShadowFilterOptions, SurfaceGlowFilterOptions,
    SurfaceInnerGlowFilterOptions, SurfaceInnerShadowFilterOptions,
    apply_surface_drop_shadow_filter, apply_surface_glow_filter, apply_surface_inner_glow_filter,
    apply_surface_inner_shadow_filter,
};

// sharpen
pub use sharpen::{SurfaceSharpenFilterOptions, apply_surface_sharpen_filter};
