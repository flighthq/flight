//! wasm-bindgen bindings for `flighthq-surface`.
//!
//! Flat free functions over raw byte slices that reconstruct the
//! `Surface` / `SurfaceRegion` values the native crate expects, call straight
//! into `flighthq-surface`, and write results back through the mutable `dest`
//! slice (wasm-bindgen copies it back to the JS typed array).
//!
//! The marshalling lives here on purpose: the authoritative `flighthq-surface`
//! crate seam stays wasm-free, and only this thin adapter knows about the JS
//! boundary. These functions back the `@flighthq/surface-rs` npm shim, which
//! presents the exact `@flighthq/surface` signatures over them.
//!
//! Conventions:
//! - A region is passed as a 6-element `desc` slice: `[surface_width,
//!   surface_height, x, y, region_width, region_height]`. `region_from_desc`
//!   rebuilds the `SurfaceRegion`; the dest data slice is written back after.
//! - Enums cross the boundary as their `repr(u8)` discriminant. The JS shim
//!   maps string-valued enums to the same integers; conformance tests prove the
//!   mapping by comparing against `@flighthq/surface`.
//! - Each export keeps its native name with a `_wasm` suffix so the JS glue
//!   never collides with the hand-written shim that wraps it.

use flighthq_surface::{
    apply_surface_color_transform, apply_surface_palette_map, apply_surface_threshold,
    bevel_surface, blur_surface_pixels_horizontal, blur_surface_pixels_horizontal_weighted,
    blur_surface_pixels_vertical, blur_surface_pixels_vertical_weighted, box_blur_surface,
    color_matrix_surface, composite_surface_pixels, composite_surface_region,
    convert_surface_pixel_order, convolve_surface, copy_surface_channel, copy_surface_pixels,
    create_surface, create_surface_region, dilate_surface, displace_surface,
    dissolve_surface_pixels, drop_shadow_surface, equalize_surface_histogram, erode_surface,
    extract_surface_pixels, extract_surface_pixels_32, fill_surface_noise,
    fill_surface_perlin_noise, fill_surface_rectangle, flip_surface_horizontal,
    flip_surface_vertical, flood_fill_surface, gaussian_blur_surface, glow_surface,
    gradient_bevel_surface, gradient_glow_surface, get_surface_color_bounds_rectangle,
    get_surface_coverage, get_surface_histogram, inner_glow_surface, inner_shadow_surface,
    median_surface, merge_surface, pixelate_surface, premultiply_surface_pixels, resize_surface,
    rotate_surface_180, rotate_surface_clockwise, rotate_surface_counter_clockwise, scroll_surface,
    sharpen_surface, unpremultiply_surface_pixels, write_surface_pixels, write_surface_pixels_32,
    Surface, SurfaceBevelOptions, SurfaceBevelType, SurfaceBoxBlurOptions, SurfaceConvolutionEdge,
    SurfaceConvolutionOptions, SurfaceDisplacementMapMode, SurfaceDisplacementMapOptions,
    SurfaceDropShadowOptions, SurfaceGlowOptions, SurfaceGradientBevelOptions,
    SurfaceGradientGlowOptions, SurfaceInnerGlowOptions, SurfaceInnerShadowOptions, SurfaceRegion,
    SurfaceResizeOptions, SurfaceSharpenOptions,
};
use flighthq_types::{BlendMode, ColorTransformLike, ImageChannel, PixelOrder, ThresholdOperation};
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn apply_surface_color_transform_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
    red_multiplier: f32,
    green_multiplier: f32,
    blue_multiplier: f32,
    alpha_multiplier: f32,
    red_offset: f32,
    green_offset: f32,
    blue_offset: f32,
    alpha_offset: f32,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    let ct = ColorTransformLike {
        red_multiplier,
        green_multiplier,
        blue_multiplier,
        alpha_multiplier,
        red_offset,
        green_offset,
        blue_offset,
        alpha_offset,
    };
    apply_surface_color_transform(&mut dest, &source, &ct);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn apply_surface_palette_map_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
    red_map: &[u8],
    green_map: &[u8],
    blue_map: &[u8],
    alpha_map: &[u8],
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    apply_surface_palette_map(
        &mut dest,
        &source,
        map_256(red_map),
        map_256(green_map),
        map_256(blue_map),
        map_256(alpha_map),
    );
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn apply_surface_threshold_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
    operation: u8,
    threshold_value: u32,
    color: u32,
    mask: u32,
    copy_source: bool,
) -> u32 {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    let hits = apply_surface_threshold(
        &mut dest,
        &source,
        threshold_op_from_u8(operation),
        threshold_value,
        color,
        mask,
        copy_source,
    );
    dest_data.copy_from_slice(&dest.surface.data);
    hits
}

#[wasm_bindgen]
pub fn composite_surface_pixels_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    pixels: &[u8],
    blend_mode: u8,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    composite_surface_pixels(&mut dest, pixels, blend_mode_from_u8(blend_mode));
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn composite_surface_region_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
    blend_mode: u8,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    composite_surface_region(&mut dest, &source, blend_mode_from_u8(blend_mode));
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn convert_surface_pixel_order_wasm(
    out: &mut [u8],
    source: &[u8],
    length: usize,
    from: u8,
    to: u8,
) {
    convert_surface_pixel_order(out, source, length, pixel_order_from_u8(from), pixel_order_from_u8(to));
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn copy_surface_channel_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    dest_channel: u8,
    source_data: &[u8],
    source_desc: &[u32],
    source_channel: u8,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    copy_surface_channel(
        &mut dest,
        image_channel_from_u8(dest_channel),
        &source,
        image_channel_from_u8(source_channel),
    );
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn copy_surface_pixels_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
    composite: bool,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    copy_surface_pixels(&mut dest, &source, composite);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn dilate_surface_wasm(out: &mut [u8], source_data: &[u8], source_desc: &[u32], radius: u32) {
    let source = region_from_desc(source_data, source_desc);
    dilate_surface(out, &source, radius);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn dissolve_surface_pixels_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
    seed: u32,
    pixel_count: u32,
    fill_color: u32,
) -> u32 {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    let written = dissolve_surface_pixels(&mut dest, &source, seed, pixel_count, fill_color);
    dest_data.copy_from_slice(&dest.surface.data);
    written
}

#[wasm_bindgen]
pub fn equalize_surface_histogram_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    equalize_surface_histogram(&mut dest, &source);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn erode_surface_wasm(out: &mut [u8], source_data: &[u8], source_desc: &[u32], radius: u32) {
    let source = region_from_desc(source_data, source_desc);
    erode_surface(out, &source, radius);
}

#[wasm_bindgen]
pub fn extract_surface_pixels_wasm(out: &mut [u8], source_data: &[u8], source_desc: &[u32]) {
    let source = region_from_desc(source_data, source_desc);
    extract_surface_pixels(out, &source);
}

#[wasm_bindgen]
pub fn extract_surface_pixels_32_wasm(out: &mut [u32], source_data: &[u8], source_desc: &[u32]) {
    let source = region_from_desc(source_data, source_desc);
    extract_surface_pixels_32(out, &source);
}

#[wasm_bindgen]
pub fn fill_surface_noise_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    seed: u32,
    low: u8,
    high: u8,
    gray_scale: bool,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    fill_surface_noise(&mut dest, seed, low, high, gray_scale);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn fill_surface_perlin_noise_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    base_x: f32,
    base_y: f32,
    octaves: u32,
    seed: u32,
    gray_scale: bool,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    fill_surface_perlin_noise(&mut dest, base_x, base_y, octaves, seed, gray_scale);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn fill_surface_rectangle_wasm(dest_data: &mut [u8], dest_desc: &[u32], color: u32) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    fill_surface_rectangle(&mut dest, color);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn flip_surface_horizontal_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    flip_surface_horizontal(&mut dest, &source);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn flip_surface_vertical_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    flip_surface_vertical(&mut dest, &source);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn flood_fill_surface_wasm(data: &mut [u8], width: u32, height: u32, x: u32, y: u32, color: u32) {
    let mut surface = surface_from_parts(data, width, height);
    flood_fill_surface(&mut surface, x, y, color);
    data.copy_from_slice(&surface.data);
}

#[wasm_bindgen]
pub fn get_surface_color_bounds_rectangle_wasm(
    out_rect: &mut [f64],
    source_data: &[u8],
    source_desc: &[u32],
    mask: u32,
    color: u32,
    find_color: bool,
) -> bool {
    let source = region_from_desc(source_data, source_desc);
    match get_surface_color_bounds_rectangle(&source, mask, color, find_color) {
        Some(rect) => {
            out_rect[0] = rect.x as f64;
            out_rect[1] = rect.y as f64;
            out_rect[2] = rect.width as f64;
            out_rect[3] = rect.height as f64;
            true
        }
        None => false,
    }
}

#[wasm_bindgen]
pub fn get_surface_coverage_wasm(
    data: &[u8],
    width: u32,
    height: u32,
    background_color: u32,
    channel_tolerance: u8,
) -> f32 {
    let surface = surface_from_parts(data, width, height);
    get_surface_coverage(&surface, background_color, channel_tolerance)
}

// Writes the four 256-bucket channel histograms into `out` as
// `[red[0..256], green[0..256], blue[0..256], alpha[0..256]]`.
#[wasm_bindgen]
pub fn get_surface_histogram_wasm(out: &mut [u32], source_data: &[u8], source_desc: &[u32]) {
    let source = region_from_desc(source_data, source_desc);
    let histogram = get_surface_histogram(&source);
    out[0..256].copy_from_slice(&histogram.red);
    out[256..512].copy_from_slice(&histogram.green);
    out[512..768].copy_from_slice(&histogram.blue);
    out[768..1024].copy_from_slice(&histogram.alpha);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn merge_surface_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
    red_multiplier: f32,
    green_multiplier: f32,
    blue_multiplier: f32,
    alpha_multiplier: f32,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    merge_surface(
        &mut dest,
        &source,
        red_multiplier,
        green_multiplier,
        blue_multiplier,
        alpha_multiplier,
    );
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn premultiply_surface_pixels_wasm(out: &mut [u8], source: &[u8], length: usize) {
    premultiply_surface_pixels(out, source, length);
}

#[wasm_bindgen]
pub fn resize_surface_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
    mode: u8,
    premultiplied: bool,
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceResizeOptions { mode: resize_mode_from_u8(mode), premultiplied };
    resize_surface(&mut dest, &source, &options);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn rotate_surface_180_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    rotate_surface_180(&mut dest, &source);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn rotate_surface_clockwise_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    rotate_surface_clockwise(&mut dest, &source);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn rotate_surface_counter_clockwise_wasm(
    dest_data: &mut [u8],
    dest_desc: &[u32],
    source_data: &[u8],
    source_desc: &[u32],
) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    let source = region_from_desc(source_data, source_desc);
    rotate_surface_counter_clockwise(&mut dest, &source);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn scroll_surface_wasm(data: &mut [u8], width: u32, height: u32, dx: i32, dy: i32) {
    let mut surface = surface_from_parts(data, width, height);
    scroll_surface(&mut surface, dx, dy);
    data.copy_from_slice(&surface.data);
}

#[wasm_bindgen]
pub fn unpremultiply_surface_pixels_wasm(out: &mut [u8], source: &[u8], length: usize) {
    unpremultiply_surface_pixels(out, source, length);
}

#[wasm_bindgen]
pub fn write_surface_pixels_wasm(dest_data: &mut [u8], dest_desc: &[u32], pixels: &[u8]) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    write_surface_pixels(&mut dest, pixels);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
pub fn write_surface_pixels_32_wasm(dest_data: &mut [u8], dest_desc: &[u32], pixels: &[u32]) {
    let mut dest = region_from_desc(dest_data, dest_desc);
    write_surface_pixels_32(&mut dest, pixels);
    dest_data.copy_from_slice(&dest.surface.data);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn bevel_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    angle: f32,
    distance: f32,
    radius_x: u32,
    radius_y: u32,
    passes: u32,
    highlight_color: u32,
    shadow_color: u32,
    intensity: f32,
    bevel_type: u8,
) {
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceBevelOptions {
        angle,
        distance,
        radius_x,
        radius_y,
        passes,
        highlight_color,
        shadow_color,
        intensity,
        bevel_type: surface_bevel_type_from_u8(bevel_type),
    };
    bevel_surface(out, scratch, &source, &options);
}

#[wasm_bindgen]
pub fn blur_surface_pixels_horizontal_wasm(
    out: &mut [u8],
    source: &[u8],
    width: u32,
    height: u32,
    radius: u32,
) {
    blur_surface_pixels_horizontal(out, source, width, height, radius);
}

#[wasm_bindgen]
pub fn blur_surface_pixels_horizontal_weighted_wasm(
    out: &mut [u8],
    source: &[u8],
    width: u32,
    height: u32,
    kernel: &[f32],
) {
    blur_surface_pixels_horizontal_weighted(out, source, width, height, kernel);
}

#[wasm_bindgen]
pub fn blur_surface_pixels_vertical_wasm(
    out: &mut [u8],
    source: &[u8],
    width: u32,
    height: u32,
    radius: u32,
) {
    blur_surface_pixels_vertical(out, source, width, height, radius);
}

#[wasm_bindgen]
pub fn blur_surface_pixels_vertical_weighted_wasm(
    out: &mut [u8],
    source: &[u8],
    width: u32,
    height: u32,
    kernel: &[f32],
) {
    blur_surface_pixels_vertical_weighted(out, source, width, height, kernel);
}

#[wasm_bindgen]
pub fn box_blur_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    radius_x: u32,
    radius_y: u32,
    passes: u32,
) {
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceBoxBlurOptions { radius_x, radius_y, passes };
    box_blur_surface(out, scratch, &source, &options);
}

#[wasm_bindgen]
pub fn color_matrix_surface_wasm(out: &mut [u8], source_data: &[u8], source_desc: &[u32], matrix: &[f32]) {
    let source = region_from_desc(source_data, source_desc);
    let matrix: &[f32; 20] = matrix.try_into().expect("color matrix must have 20 entries");
    color_matrix_surface(out, &source, matrix);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn convolve_surface_wasm(
    out: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    matrix: &[f32],
    matrix_x: u32,
    matrix_y: u32,
    bias: f32,
    edge: u8,
    fill_color: u32,
    divisor: f32,
    preserve_alpha: bool,
) {
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceConvolutionOptions {
        bias,
        edge: surface_convolution_edge_from_u8(edge),
        fill_color,
        divisor,
        matrix: matrix.to_vec(),
        matrix_x,
        matrix_y,
        preserve_alpha,
    };
    convolve_surface(out, &source, &options);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn displace_surface_wasm(
    out: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    map_data: &[u8],
    map_desc: &[u32],
    component_x: u8,
    component_y: u8,
    scale_x: f32,
    scale_y: f32,
    mode: u8,
    fill_color: u32,
) {
    let source = region_from_desc(source_data, source_desc);
    let map = region_from_desc(map_data, map_desc);
    let options = SurfaceDisplacementMapOptions {
        map,
        component_x,
        component_y,
        scale_x,
        scale_y,
        mode: surface_displacement_mode_from_u8(mode),
        fill_color,
    };
    displace_surface(out, &source, &options);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn drop_shadow_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    radius_x: u32,
    radius_y: u32,
    passes: u32,
    color: u32,
    intensity: f32,
) {
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceDropShadowOptions { radius_x, radius_y, passes, color, intensity };
    drop_shadow_surface(out, scratch, &source, &options);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn gaussian_blur_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    sigma_x: f32,
    sigma_y: f32,
    passes: u32,
) {
    let source = region_from_desc(source_data, source_desc);
    gaussian_blur_surface(out, scratch, &source, sigma_x, sigma_y, passes);
}

#[wasm_bindgen]
pub fn median_surface_wasm(out: &mut [u8], source_data: &[u8], source_desc: &[u32], radius: u32) {
    let source = region_from_desc(source_data, source_desc);
    median_surface(out, &source, radius);
}

#[wasm_bindgen]
pub fn pixelate_surface_wasm(out: &mut [u8], source_data: &[u8], source_desc: &[u32], block_size: u32) {
    let source = region_from_desc(source_data, source_desc);
    pixelate_surface(out, &source, block_size);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn glow_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    radius_x: u32,
    radius_y: u32,
    passes: u32,
    color: u32,
    intensity: f32,
) {
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceGlowOptions { radius_x, radius_y, passes, color, intensity };
    glow_surface(out, scratch, &source, &options);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn gradient_bevel_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    ramp: &[u8],
    angle: f32,
    distance: f32,
    radius_x: u32,
    radius_y: u32,
    passes: u32,
    intensity: f32,
    bevel_type: u8,
) {
    let source = region_from_desc(source_data, source_desc);
    let ramp: &[u8; 1024] = ramp.try_into().expect("gradient ramp must have 1024 entries");
    let options = SurfaceGradientBevelOptions {
        angle,
        distance,
        radius_x,
        radius_y,
        passes,
        intensity,
        bevel_type: surface_bevel_type_from_u8(bevel_type),
    };
    gradient_bevel_surface(out, scratch, &source, ramp, &options);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn gradient_glow_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    ramp: &[u8],
    radius_x: u32,
    radius_y: u32,
    passes: u32,
    intensity: f32,
) {
    let source = region_from_desc(source_data, source_desc);
    let ramp: &[u8; 1024] = ramp.try_into().expect("gradient ramp must have 1024 entries");
    let options = SurfaceGradientGlowOptions { radius_x, radius_y, passes, intensity };
    gradient_glow_surface(out, scratch, &source, ramp, &options);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn inner_glow_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    radius_x: u32,
    radius_y: u32,
    passes: u32,
    color: u32,
    intensity: f32,
) {
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceInnerGlowOptions { radius_x, radius_y, passes, color, intensity };
    inner_glow_surface(out, scratch, &source, &options);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn inner_shadow_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    radius_x: u32,
    radius_y: u32,
    passes: u32,
    color: u32,
    intensity: f32,
) {
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceInnerShadowOptions { radius_x, radius_y, passes, color, intensity };
    inner_shadow_surface(out, scratch, &source, &options);
}

#[wasm_bindgen]
pub fn sharpen_surface_wasm(
    out: &mut [u8],
    scratch: &mut [u8],
    source_data: &[u8],
    source_desc: &[u32],
    amount: f32,
    radius_x: u32,
    radius_y: u32,
    passes: u32,
) {
    let source = region_from_desc(source_data, source_desc);
    let options = SurfaceSharpenOptions { amount, radius_x, radius_y, passes };
    sharpen_surface(out, scratch, &source, &options);
}

fn blend_mode_from_u8(value: u8) -> BlendMode {
    match value {
        0 => BlendMode::Add,
        1 => BlendMode::Alpha,
        2 => BlendMode::Darken,
        3 => BlendMode::Difference,
        4 => BlendMode::Erase,
        5 => BlendMode::Hardlight,
        6 => BlendMode::Invert,
        7 => BlendMode::Layer,
        8 => BlendMode::Lighten,
        9 => BlendMode::Multiply,
        11 => BlendMode::Overlay,
        12 => BlendMode::Screen,
        13 => BlendMode::Shader,
        14 => BlendMode::Subtract,
        _ => BlendMode::Normal,
    }
}

fn image_channel_from_u8(value: u8) -> ImageChannel {
    match value {
        0 => ImageChannel::Red,
        1 => ImageChannel::Green,
        2 => ImageChannel::Blue,
        _ => ImageChannel::Alpha,
    }
}

// Interprets a palette channel map: 256 bytes means "present", an empty slice
// means "absent" (the native `None`, leaving that channel unchanged).
fn map_256(map: &[u8]) -> Option<&[u8; 256]> {
    <&[u8; 256]>::try_from(map).ok()
}

fn pixel_order_from_u8(value: u8) -> PixelOrder {
    match value {
        0 => PixelOrder::Abgr,
        1 => PixelOrder::Argb,
        2 => PixelOrder::Bgra,
        _ => PixelOrder::Rgba,
    }
}

// Rebuilds a `SurfaceRegion` from the flat pixel buffer and a 6-element
// descriptor `[surface_width, surface_height, x, y, region_width,
// region_height]`. `create_surface` supplies the default alpha/format/color-
// space fields the surface ops do not depend on; only `data` and the
// dimensions carry meaning here.
fn region_from_desc(data: &[u8], desc: &[u32]) -> SurfaceRegion {
    let surface = surface_from_parts(data, desc[0], desc[1]);
    create_surface_region(surface, desc[2], desc[3], desc[4], desc[5])
}

fn resize_mode_from_u8(value: u8) -> flighthq_surface::SurfaceResizeMode {
    match value {
        0 => flighthq_surface::SurfaceResizeMode::Bicubic,
        1 => flighthq_surface::SurfaceResizeMode::Bilinear,
        _ => flighthq_surface::SurfaceResizeMode::Nearest,
    }
}

fn surface_bevel_type_from_u8(value: u8) -> SurfaceBevelType {
    match value {
        0 => SurfaceBevelType::Both,
        2 => SurfaceBevelType::Outer,
        _ => SurfaceBevelType::Inner,
    }
}

fn surface_convolution_edge_from_u8(value: u8) -> SurfaceConvolutionEdge {
    match value {
        1 => SurfaceConvolutionEdge::Fill,
        2 => SurfaceConvolutionEdge::Wrap,
        _ => SurfaceConvolutionEdge::Clamp,
    }
}

fn surface_displacement_mode_from_u8(value: u8) -> SurfaceDisplacementMapMode {
    match value {
        0 => SurfaceDisplacementMapMode::Clamp,
        1 => SurfaceDisplacementMapMode::Color,
        2 => SurfaceDisplacementMapMode::Ignore,
        _ => SurfaceDisplacementMapMode::Wrap,
    }
}

fn surface_from_parts(data: &[u8], width: u32, height: u32) -> Surface {
    let mut surface = create_surface(width, height, 0);
    surface.data.copy_from_slice(data);
    surface
}

fn threshold_op_from_u8(value: u8) -> ThresholdOperation {
    match value {
        0 => ThresholdOperation::NotEqual,
        1 => ThresholdOperation::LessThan,
        2 => ThresholdOperation::LessEqual,
        3 => ThresholdOperation::Equal,
        4 => ThresholdOperation::GreaterThan,
        _ => ThresholdOperation::GreaterEqual,
    }
}
