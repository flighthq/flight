#![forbid(unsafe_code)]

use flight_bitmap::{
    BitmapConvolutionOptions, BitmapEdgeMode, BitmapFingerprint, apply_bitmap_curve,
    apply_bitmap_levels, apply_bitmap_palette_map, build_bitmap_brightness_color_matrix,
    build_bitmap_contrast_color_matrix, build_bitmap_grayscale_color_matrix,
    build_bitmap_hue_rotation_color_matrix, build_bitmap_invert_color_matrix,
    build_bitmap_saturation_color_matrix, build_bitmap_sepia_color_matrix, color_matrix_bitmap,
    compare_bitmap_fingerprints, concat_bitmap_color_matrix, convolve_bitmap, copy_bitmap_alpha,
    copy_bitmap_pixels, create_bitmap, create_bitmap_region, dilate_bitmap, erode_bitmap,
    fill_bitmap_noise, fill_bitmap_perlin_noise, fill_bitmap_rectangle, fill_bitmap_turbulence,
    get_bitmap_color_bounds_rectangle, get_bitmap_coverage, get_bitmap_histogram,
    get_bitmap_mismatch, merge_bitmap_channels, multiply_bitmap_alpha, pixelate_bitmap,
    premultiply_bitmap_pixels, set_bitmap_alpha, set_bitmap_color_matrix_identity,
    unpremultiply_bitmap_pixels,
};
use wasm_bindgen::prelude::*;

// --- Marshalling helpers ---
//
// Wasm-bindgen passes flat typed arrays and scalars across the JS/Wasm boundary. These helpers
// convert between the flat representation and the domain types that `flight-bitmap` expects.
// A "descriptor" is `[bitmapWidth, bitmapHeight, x, y, width, height]` — six f64 values that
// fully describe a region's placement inside its bitmap.

fn bitmap_from_raw(data: &[u8], width: f64, height: f64) -> flight_bitmap::Bitmap {
    let w = width as u32;
    let h = height as u32;
    let mut bmp = create_bitmap(w, h, None);
    bmp.data = data.to_vec().into_boxed_slice();
    bmp
}

fn region_from_raw(data: &[u8], descriptor: &[f64]) -> flight_bitmap::BitmapRegion {
    assert_eq!(
        descriptor.len(),
        6,
        "bitmap region descriptor must contain [bitmapWidth, bitmapHeight, x, y, width, height]",
    );
    let bitmap = bitmap_from_raw(data, descriptor[0], descriptor[1]);
    create_bitmap_region(
        bitmap,
        descriptor[2] as i32,
        descriptor[3] as i32,
        descriptor[4] as i32,
        descriptor[5] as i32,
    )
}

fn fingerprint_from_raw(cells: &[u8], grid_size: f64) -> BitmapFingerprint {
    let mut fp = BitmapFingerprint::default();
    fp.grid_size = grid_size as u32;
    fp.cells = cells.to_vec();
    fp
}

fn copy_u8_output(out: &mut [u8], source: &[u8]) {
    assert_eq!(out.len(), source.len(), "output buffer length mismatch");
    out.copy_from_slice(source);
}

fn f64_slice_to_f32_20(slice: &[f64]) -> [f32; 20] {
    assert!(slice.len() >= 20, "color matrix must have 20 elements");
    let mut arr = [0.0f32; 20];
    for i in 0..20 {
        arr[i] = slice[i] as f32;
    }
    arr
}

fn f32_20_to_f64_slice(arr: &[f32; 20], out: &mut [f64]) {
    assert!(out.len() >= 20, "output must have room for 20 elements");
    for i in 0..20 {
        out[i] = arr[i] as f64;
    }
}

fn f64_slice_to_f32_vec(slice: &[f64]) -> Vec<f32> {
    slice.iter().map(|&v| v as f32).collect()
}

fn parse_edge_mode(s: &str) -> BitmapEdgeMode {
    match s {
        "transparent" => BitmapEdgeMode::Transparent,
        "wrap" => BitmapEdgeMode::Wrap,
        "mirror" => BitmapEdgeMode::Mirror,
        _ => BitmapEdgeMode::Clamp,
    }
}

fn optional_u8_map(values: &[u8]) -> Option<&[u8]> {
    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

// --- Alpha operations ---

#[wasm_bindgen]
pub fn multiply_bitmap_alpha_wasm(data: &mut [u8], descriptor: &[f64], factor: f64) {
    let mut target = region_from_raw(data, descriptor);
    multiply_bitmap_alpha(&mut target, factor as f32);
    copy_u8_output(data, &target.bitmap.data);
}

#[wasm_bindgen]
pub fn set_bitmap_alpha_wasm(data: &mut [u8], descriptor: &[f64], alpha: f64) {
    let mut target = region_from_raw(data, descriptor);
    set_bitmap_alpha(&mut target, alpha as f32);
    copy_u8_output(data, &target.bitmap.data);
}

#[wasm_bindgen]
pub fn copy_bitmap_alpha_wasm(
    dest_data: &mut [u8],
    dest_descriptor: &[f64],
    source_data: &[u8],
    source_descriptor: &[f64],
) {
    let mut dest = region_from_raw(dest_data, dest_descriptor);
    let source = region_from_raw(source_data, source_descriptor);
    copy_bitmap_alpha(&mut dest, &source);
    copy_u8_output(dest_data, &dest.bitmap.data);
}

// --- Color matrix operations ---

#[wasm_bindgen]
pub fn build_bitmap_brightness_color_matrix_wasm(out: &mut [f64], amount: f64) {
    let mut m = [0.0f32; 20];
    build_bitmap_brightness_color_matrix(&mut m, amount as f32);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn build_bitmap_contrast_color_matrix_wasm(out: &mut [f64], amount: f64) {
    let mut m = [0.0f32; 20];
    build_bitmap_contrast_color_matrix(&mut m, amount as f32);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn build_bitmap_grayscale_color_matrix_wasm(out: &mut [f64]) {
    let mut m = [0.0f32; 20];
    build_bitmap_grayscale_color_matrix(&mut m);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn build_bitmap_hue_rotation_color_matrix_wasm(out: &mut [f64], degrees: f64) {
    let mut m = [0.0f32; 20];
    build_bitmap_hue_rotation_color_matrix(&mut m, degrees as f32);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn build_bitmap_invert_color_matrix_wasm(out: &mut [f64]) {
    let mut m = [0.0f32; 20];
    build_bitmap_invert_color_matrix(&mut m);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn build_bitmap_saturation_color_matrix_wasm(out: &mut [f64], amount: f64) {
    let mut m = [0.0f32; 20];
    build_bitmap_saturation_color_matrix(&mut m, amount as f32);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn build_bitmap_sepia_color_matrix_wasm(out: &mut [f64]) {
    let mut m = [0.0f32; 20];
    build_bitmap_sepia_color_matrix(&mut m);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn set_bitmap_color_matrix_identity_wasm(out: &mut [f64]) {
    let mut m = [0.0f32; 20];
    set_bitmap_color_matrix_identity(&mut m);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn concat_bitmap_color_matrix_wasm(out: &mut [f64], first: &[f64], second: &[f64]) {
    let mut m = [0.0f32; 20];
    let f = f64_slice_to_f32_20(first);
    let s = f64_slice_to_f32_20(second);
    concat_bitmap_color_matrix(&mut m, &f, &s);
    f32_20_to_f64_slice(&m, out);
}

#[wasm_bindgen]
pub fn color_matrix_bitmap_wasm(
    out: &mut [u8],
    source_data: &[u8],
    source_descriptor: &[f64],
    matrix: &[f64],
) {
    let source = region_from_raw(source_data, source_descriptor);
    let m = f64_slice_to_f32_vec(matrix);
    color_matrix_bitmap(out, &source, &m);
}

// --- Convolution ---

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn convolve_bitmap_wasm(
    out: &mut [u8],
    source_data: &[u8],
    source_descriptor: &[f64],
    matrix: &[f64],
    matrix_x: f64,
    matrix_y: f64,
    bias: f64,
    edge: String,
    divisor: f64,
    preserve_alpha: bool,
) {
    let source = region_from_raw(source_data, source_descriptor);
    let options = BitmapConvolutionOptions {
        bias: Some(bias as f32),
        edge: Some(parse_edge_mode(&edge)),
        divisor: if divisor.is_nan() {
            None
        } else {
            Some(divisor as f32)
        },
        matrix: f64_slice_to_f32_vec(matrix),
        matrix_x: matrix_x as i32,
        matrix_y: matrix_y as i32,
        preserve_alpha: Some(preserve_alpha),
    };
    convolve_bitmap(out, &source, &options);
}

// --- Copy ---

#[wasm_bindgen]
pub fn copy_bitmap_pixels_wasm(
    dest_data: &mut [u8],
    dest_descriptor: &[f64],
    source_data: &[u8],
    source_descriptor: &[f64],
    composite: bool,
) {
    let mut dest = region_from_raw(dest_data, dest_descriptor);
    let source = region_from_raw(source_data, source_descriptor);
    copy_bitmap_pixels(&mut dest, &source, composite);
    copy_u8_output(dest_data, &dest.bitmap.data);
}

// --- Fill ---

#[wasm_bindgen]
pub fn fill_bitmap_rectangle_wasm(data: &mut [u8], descriptor: &[f64], color: f64) {
    let mut target = region_from_raw(data, descriptor);
    fill_bitmap_rectangle(&mut target, color as u32);
    copy_u8_output(data, &target.bitmap.data);
}

#[wasm_bindgen]
pub fn fill_bitmap_noise_wasm(
    data: &mut [u8],
    descriptor: &[f64],
    seed: f64,
    low: f64,
    high: f64,
    gray_scale: bool,
) {
    let mut target = region_from_raw(data, descriptor);
    fill_bitmap_noise(&mut target, seed as u32, low as u8, high as u8, gray_scale);
    copy_u8_output(data, &target.bitmap.data);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn fill_bitmap_perlin_noise_wasm(
    data: &mut [u8],
    descriptor: &[f64],
    base_x: f64,
    base_y: f64,
    octaves: f64,
    seed: f64,
    gray_scale: bool,
    stitch: bool,
    channel_options: f64,
) {
    let mut target = region_from_raw(data, descriptor);
    fill_bitmap_perlin_noise(
        &mut target,
        base_x,
        base_y,
        octaves as i32,
        seed as i32,
        gray_scale,
        stitch,
        channel_options as u32,
    );
    copy_u8_output(data, &target.bitmap.data);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn fill_bitmap_turbulence_wasm(
    data: &mut [u8],
    descriptor: &[f64],
    base_x: f64,
    base_y: f64,
    octaves: f64,
    seed: f64,
    gray_scale: bool,
    stitch: bool,
    channel_options: f64,
) {
    let mut target = region_from_raw(data, descriptor);
    fill_bitmap_turbulence(
        &mut target,
        base_x,
        base_y,
        octaves as i32,
        seed as i32,
        gray_scale,
        stitch,
        channel_options as u32,
    );
    copy_u8_output(data, &target.bitmap.data);
}

// --- Morphological ---

#[wasm_bindgen]
pub fn dilate_bitmap_wasm(
    out: &mut [u8],
    source_data: &[u8],
    source_descriptor: &[f64],
    radius: f64,
) {
    let source = region_from_raw(source_data, source_descriptor);
    dilate_bitmap(out, &source, radius as i32);
}

#[wasm_bindgen]
pub fn erode_bitmap_wasm(
    out: &mut [u8],
    source_data: &[u8],
    source_descriptor: &[f64],
    radius: f64,
) {
    let source = region_from_raw(source_data, source_descriptor);
    erode_bitmap(out, &source, radius as i32);
}

// --- Pixelate ---

#[wasm_bindgen]
pub fn pixelate_bitmap_wasm(
    out: &mut [u8],
    source_data: &[u8],
    source_descriptor: &[f64],
    block_size: f64,
) {
    let source = region_from_raw(source_data, source_descriptor);
    pixelate_bitmap(out, &source, block_size as i32);
}

// --- Premultiply ---

#[wasm_bindgen]
pub fn premultiply_bitmap_pixels_wasm(out: &mut [u8], source: &[u8], length: f64) {
    premultiply_bitmap_pixels(out, source, length as usize);
}

#[wasm_bindgen]
pub fn unpremultiply_bitmap_pixels_wasm(out: &mut [u8], source: &[u8], length: f64) {
    unpremultiply_bitmap_pixels(out, source, length as usize);
}

// --- Curve / Levels / Palette map ---

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn apply_bitmap_curve_wasm(
    dest_data: &mut [u8],
    dest_descriptor: &[f64],
    source_data: &[u8],
    source_descriptor: &[f64],
    red_lut: &[u8],
    green_lut: &[u8],
    blue_lut: &[u8],
    alpha_lut: &[u8],
) {
    let mut dest = region_from_raw(dest_data, dest_descriptor);
    let source = region_from_raw(source_data, source_descriptor);
    apply_bitmap_curve(
        &mut dest,
        &source,
        optional_u8_map(red_lut),
        optional_u8_map(green_lut),
        optional_u8_map(blue_lut),
        optional_u8_map(alpha_lut),
    );
    copy_u8_output(dest_data, &dest.bitmap.data);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn apply_bitmap_levels_wasm(
    dest_data: &mut [u8],
    dest_descriptor: &[f64],
    source_data: &[u8],
    source_descriptor: &[f64],
    black_point: f64,
    white_point: f64,
    gamma: f64,
) {
    let mut dest = region_from_raw(dest_data, dest_descriptor);
    let source = region_from_raw(source_data, source_descriptor);
    apply_bitmap_levels(
        &mut dest,
        &source,
        black_point as f32,
        white_point as f32,
        gamma as f32,
    );
    copy_u8_output(dest_data, &dest.bitmap.data);
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn apply_bitmap_palette_map_wasm(
    dest_data: &mut [u8],
    dest_descriptor: &[f64],
    source_data: &[u8],
    source_descriptor: &[f64],
    red_map: &[u8],
    green_map: &[u8],
    blue_map: &[u8],
    alpha_map: &[u8],
) {
    let mut dest = region_from_raw(dest_data, dest_descriptor);
    let source = region_from_raw(source_data, source_descriptor);
    apply_bitmap_palette_map(
        &mut dest,
        &source,
        optional_u8_map(red_map),
        optional_u8_map(green_map),
        optional_u8_map(blue_map),
        optional_u8_map(alpha_map),
    );
    copy_u8_output(dest_data, &dest.bitmap.data);
}

// --- Coverage / Histogram / Mismatch ---

#[wasm_bindgen]
pub fn get_bitmap_coverage_wasm(
    data: &[u8],
    width: f64,
    height: f64,
    background_color: f64,
    channel_tolerance: f64,
) -> f64 {
    get_bitmap_coverage(
        &bitmap_from_raw(data, width, height),
        background_color as u32,
        channel_tolerance as u32,
    )
}

#[wasm_bindgen]
pub fn get_bitmap_color_bounds_rectangle_wasm(
    out: &mut [f64],
    data: &[u8],
    descriptor: &[f64],
    mask: f64,
    color: f64,
    find_color: bool,
) -> bool {
    assert_eq!(out.len(), 4, "rectangle output must contain four values");
    let Some(rectangle) = get_bitmap_color_bounds_rectangle(
        &region_from_raw(data, descriptor),
        mask as u32,
        color as u32,
        find_color,
    ) else {
        return false;
    };
    out.copy_from_slice(&[rectangle.x, rectangle.y, rectangle.width, rectangle.height]);
    true
}

#[wasm_bindgen]
pub fn get_bitmap_histogram_wasm(out: &mut [f64], data: &[u8], descriptor: &[f64]) {
    assert_eq!(
        out.len(),
        1024,
        "histogram output must contain four 256-bin channels"
    );
    let histogram = get_bitmap_histogram(&region_from_raw(data, descriptor));
    for i in 0..256 {
        out[i] = histogram.red[i] as f64;
    }
    for i in 0..256 {
        out[256 + i] = histogram.green[i] as f64;
    }
    for i in 0..256 {
        out[512 + i] = histogram.blue[i] as f64;
    }
    for i in 0..256 {
        out[768 + i] = histogram.alpha[i] as f64;
    }
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn get_bitmap_mismatch_wasm(
    out: &mut [f64],
    source_data: &[u8],
    source_width: f64,
    source_height: f64,
    other_data: &[u8],
    other_width: f64,
    other_height: f64,
    channel_tolerance: f64,
) {
    assert_eq!(out.len(), 4, "mismatch output must contain four metrics");
    let mismatch = get_bitmap_mismatch(
        &bitmap_from_raw(source_data, source_width, source_height),
        &bitmap_from_raw(other_data, other_width, other_height),
        channel_tolerance as u32,
    );
    out.copy_from_slice(&[
        mismatch.mismatched_pixels as f64,
        mismatch.total_pixels as f64,
        mismatch.fraction,
        mismatch.max_channel_delta as f64,
    ]);
}

// --- Fingerprint ---

#[wasm_bindgen]
pub fn compare_bitmap_fingerprints_wasm(
    first_cells: &[u8],
    first_grid_size: f64,
    second_cells: &[u8],
    second_grid_size: f64,
) -> f64 {
    compare_bitmap_fingerprints(
        &fingerprint_from_raw(first_cells, first_grid_size),
        &fingerprint_from_raw(second_cells, second_grid_size),
    )
}

// --- Merge channels ---

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn merge_bitmap_channels_wasm(
    out_data: &mut [u8],
    out_descriptor: &[f64],
    red_data: &[u8],
    red_descriptor: &[f64],
    green_data: &[u8],
    green_descriptor: &[f64],
    blue_data: &[u8],
    blue_descriptor: &[f64],
    alpha_data: &[u8],
    alpha_descriptor: &[f64],
) {
    let mut out = region_from_raw(out_data, out_descriptor);
    let red = region_from_raw(red_data, red_descriptor);
    let green = region_from_raw(green_data, green_descriptor);
    let blue = region_from_raw(blue_data, blue_descriptor);
    let alpha = region_from_raw(alpha_data, alpha_descriptor);
    merge_bitmap_channels(&mut out, &red, &green, &blue, &alpha);
    copy_u8_output(out_data, &out.bitmap.data);
}
