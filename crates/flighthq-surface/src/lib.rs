//! `flighthq-surface` — pixel-level image manipulation.
//!
//! Free functions for reading, writing, and transforming `Surface` pixel data.
//! Not used internally by renderers; this is a user-facing API for CPU-side
//! image processing.

pub mod bevel;
pub mod blur;
pub mod color_matrix;
pub mod compare;
pub mod composite;
pub mod convolution;
pub mod copy;
pub mod coverage;
pub mod displacement;
pub mod dissolve;
pub mod draw;
pub mod encode;
pub mod fill;
pub mod fingerprint;
pub mod flip;
pub mod format;
pub mod gradient;
pub mod histogram;
pub mod median;
pub mod morphological;
pub mod palette_map;
pub mod pixel;
pub mod pixelate;
pub mod query;
pub mod region;
pub mod resize;
pub mod rotate;
pub mod shadow;
pub mod sharpen;
pub mod surface;
pub mod surface_from;
pub mod transform;

// Re-export the complete public surface at the crate root.

// compare
pub use compare::{compare_surface, get_surface_mismatch};

// composite
pub use composite::{
    composite_surface_pixels, composite_surface_region, extract_surface_pixels,
    extract_surface_pixels_32, write_surface_pixels, write_surface_pixels_32,
};

// copy
pub use copy::{copy_surface_channel, copy_surface_pixels};

// coverage
pub use coverage::get_surface_coverage;

// dissolve
pub use dissolve::dissolve_surface_pixels;

// draw
pub use draw::draw_surface;

// encode
pub use encode::{decode_surface, encode_surface};

// fill
pub use fill::{
    SURFACE_NOISE_CHANNEL_A, SURFACE_NOISE_CHANNEL_B, SURFACE_NOISE_CHANNEL_G,
    SURFACE_NOISE_CHANNEL_R, fill_surface_noise, fill_surface_perlin_noise, fill_surface_rectangle,
    fill_surface_turbulence, flood_fill_surface,
};

// fingerprint
pub use fingerprint::{
    compare_surface_fingerprints, create_surface_fingerprint, format_surface_fingerprint,
    parse_surface_fingerprint,
};

// flip
pub use flip::{flip_surface_horizontal, flip_surface_vertical};

// format
pub use format::{
    convert_surface_pixel_order, premultiply_surface_pixels, unpremultiply_surface_pixels,
};

// histogram
pub use histogram::{equalize_surface_histogram, get_surface_histogram};

// morphological
pub use morphological::{dilate_surface, erode_surface};

// palette_map
pub use palette_map::apply_surface_palette_map;

// pixel
pub use pixel::{
    get_surface_pixel, get_surface_pixel_channel, get_surface_pixel_luminance,
    get_surface_pixel_rgb, set_surface_pixel, set_surface_pixel_rgb,
};

// query
pub use query::get_surface_color_bounds_rectangle;

// region
pub use region::{create_surface_region, set_surface_region};

// resize
pub use resize::{SurfaceResizeOptions, resize_surface};

// rotate
pub use rotate::{
    rotate_surface, rotate_surface_180, rotate_surface_clockwise, rotate_surface_counter_clockwise,
};

// surface
pub use surface::{clone_surface, create_surface};

// surface_from
pub use surface_from::{
    create_image_resource_from_surface, create_surface_from_image_resource,
    create_surface_from_image_source,
};

// transform
pub use transform::{
    apply_surface_color_transform, apply_surface_threshold, merge_surface, scroll_surface,
};

// Re-export key types for convenience.
pub use flighthq_types::{
    AlphaType, ImageChannel, ImageFormat, PixelFormat, PixelOrder, RectangleLike, Surface,
    SurfaceEdgeMode, SurfaceFingerprint, SurfaceHistogram, SurfaceMismatch, SurfaceRegion,
    SurfaceResizeMode, ThresholdOperation,
};

// Bitmap-filter pixel operations (the CPU algorithms `flighthq-filters-surface`
// bridges its descriptors onto). Relocated here from the former
// `flighthq-surface-filters` so the heavy per-pixel work lives in the surface
// engine and the filter layer stays a thin bridge.

// bevel
pub use bevel::{SurfaceBevelOptions, SurfaceBevelType, bevel_surface};

// blur
pub use blur::{
    SurfaceBoxBlurOptions, blur_surface_pixels_horizontal, blur_surface_pixels_horizontal_weighted,
    blur_surface_pixels_vertical, blur_surface_pixels_vertical_weighted, box_blur_surface,
    compute_gaussian_kernel, gaussian_blur_surface,
};

// color_matrix
pub use color_matrix::{
    build_surface_brightness_color_matrix, build_surface_contrast_color_matrix,
    build_surface_grayscale_color_matrix, build_surface_hue_rotation_color_matrix,
    build_surface_invert_color_matrix, build_surface_saturation_color_matrix,
    build_surface_sepia_color_matrix, color_matrix_surface, concat_surface_color_matrix,
    set_surface_color_matrix_identity,
};

// convolution
pub use convolution::{SurfaceConvolutionEdge, SurfaceConvolutionOptions, convolve_surface};

// displacement
pub use displacement::{
    SurfaceDisplacementMapMode, SurfaceDisplacementMapOptions, displace_surface,
};

// gradient
pub use gradient::{
    SurfaceGradientBevelOptions, SurfaceGradientGlowOptions, build_surface_gradient_ramp,
    gradient_bevel_surface, gradient_glow_surface,
};

// median
pub use median::median_surface;

// pixelate
pub use pixelate::pixelate_surface;

// shadow
pub use shadow::{
    SurfaceBlurOptions, SurfaceDropShadowOptions, SurfaceGlowOptions, SurfaceInnerGlowOptions,
    SurfaceInnerShadowOptions, drop_shadow_surface, glow_surface, inner_glow_surface,
    inner_shadow_surface,
};

// sharpen
pub use sharpen::{SurfaceSharpenOptions, sharpen_surface};
