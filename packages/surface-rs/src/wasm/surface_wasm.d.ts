/* tslint:disable */
/* eslint-disable */

export function apply_surface_color_transform_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, red_multiplier: number, green_multiplier: number, blue_multiplier: number, alpha_multiplier: number, red_offset: number, green_offset: number, blue_offset: number, alpha_offset: number): void;

export function apply_surface_palette_map_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, red_map: Uint8Array, green_map: Uint8Array, blue_map: Uint8Array, alpha_map: Uint8Array): void;

export function apply_surface_threshold_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, operation: number, threshold_value: number, color: number, mask: number, copy_source: boolean): number;

export function bevel_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, angle: number, distance: number, radius_x: number, radius_y: number, passes: number, highlight_color: number, shadow_color: number, intensity: number, bevel_type: number): void;

export function blur_surface_pixels_horizontal_wasm(out: Uint8Array, source: Uint8Array, width: number, height: number, radius: number): void;

export function blur_surface_pixels_horizontal_weighted_wasm(out: Uint8Array, source: Uint8Array, width: number, height: number, kernel: Float32Array): void;

export function blur_surface_pixels_vertical_wasm(out: Uint8Array, source: Uint8Array, width: number, height: number, radius: number): void;

export function blur_surface_pixels_vertical_weighted_wasm(out: Uint8Array, source: Uint8Array, width: number, height: number, kernel: Float32Array): void;

export function box_blur_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, radius_x: number, radius_y: number, passes: number): void;

export function color_matrix_surface_wasm(out: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, matrix: Float32Array): void;

export function composite_surface_pixels_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, pixels: Uint8Array, blend_mode: number): void;

export function composite_surface_region_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, blend_mode: number): void;

export function convert_surface_pixel_order_wasm(out: Uint8Array, source: Uint8Array, length: number, from: number, to: number): void;

export function convolve_surface_wasm(out: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, matrix: Float32Array, matrix_x: number, matrix_y: number, bias: number, edge: number, fill_color: number, divisor: number, preserve_alpha: boolean): void;

export function copy_surface_channel_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, dest_channel: number, source_data: Uint8Array, source_desc: Uint32Array, source_channel: number): void;

export function copy_surface_pixels_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, composite: boolean): void;

export function dilate_surface_wasm(out: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, radius: number): void;

export function displace_surface_wasm(out: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, map_data: Uint8Array, map_desc: Uint32Array, component_x: number, component_y: number, scale_x: number, scale_y: number, mode: number, fill_color: number): void;

export function dissolve_surface_pixels_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, seed: number, pixel_count: number, fill_color: number): number;

export function drop_shadow_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, radius_x: number, radius_y: number, passes: number, color: number, intensity: number): void;

export function equalize_surface_histogram_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function erode_surface_wasm(out: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, radius: number): void;

export function extract_surface_pixels_32_wasm(out: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function extract_surface_pixels_wasm(out: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function fill_surface_noise_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, seed: number, low: number, high: number, gray_scale: boolean): void;

export function fill_surface_perlin_noise_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, base_x: number, base_y: number, octaves: number, seed: number, gray_scale: boolean): void;

export function fill_surface_rectangle_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, color: number): void;

export function flip_surface_horizontal_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function flip_surface_vertical_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function flood_fill_surface_wasm(data: Uint8Array, width: number, height: number, x: number, y: number, color: number): void;

export function gaussian_blur_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, sigma_x: number, sigma_y: number, passes: number): void;

export function get_surface_color_bounds_rectangle_wasm(out_rect: Float64Array, source_data: Uint8Array, source_desc: Uint32Array, mask: number, color: number, find_color: boolean): boolean;

export function get_surface_coverage_wasm(data: Uint8Array, width: number, height: number, background_color: number, channel_tolerance: number): number;

export function get_surface_histogram_wasm(out: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function glow_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, radius_x: number, radius_y: number, passes: number, color: number, intensity: number): void;

export function gradient_bevel_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, ramp: Uint8Array, angle: number, distance: number, radius_x: number, radius_y: number, passes: number, intensity: number, bevel_type: number): void;

export function gradient_glow_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, ramp: Uint8Array, radius_x: number, radius_y: number, passes: number, intensity: number): void;

export function inner_glow_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, radius_x: number, radius_y: number, passes: number, color: number, intensity: number): void;

export function inner_shadow_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, radius_x: number, radius_y: number, passes: number, color: number, intensity: number): void;

export function median_surface_wasm(out: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, radius: number): void;

export function merge_surface_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, red_multiplier: number, green_multiplier: number, blue_multiplier: number, alpha_multiplier: number): void;

export function pixelate_surface_wasm(out: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, block_size: number): void;

export function premultiply_surface_pixels_wasm(out: Uint8Array, source: Uint8Array, length: number): void;

export function resize_surface_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, mode: number, premultiplied: boolean): void;

export function rotate_surface_180_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function rotate_surface_clockwise_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function rotate_surface_counter_clockwise_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array): void;

export function rotate_surface_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, source_data: Uint8Array, source_desc: Uint32Array, angle: number, pivot_x: number, pivot_y: number): void;

export function scroll_surface_wasm(data: Uint8Array, width: number, height: number, dx: number, dy: number): void;

export function sharpen_surface_wasm(out: Uint8Array, scratch: Uint8Array, source_data: Uint8Array, source_desc: Uint32Array, amount: number, radius_x: number, radius_y: number, passes: number): void;

export function unpremultiply_surface_pixels_wasm(out: Uint8Array, source: Uint8Array, length: number): void;

export function write_surface_pixels_32_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, pixels: Uint32Array): void;

export function write_surface_pixels_wasm(dest_data: Uint8Array, dest_desc: Uint32Array, pixels: Uint8Array): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly apply_surface_color_transform_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number) => void;
    readonly apply_surface_palette_map_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number) => void;
    readonly apply_surface_threshold_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => number;
    readonly bevel_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number) => void;
    readonly blur_surface_pixels_horizontal_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly blur_surface_pixels_horizontal_weighted_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly blur_surface_pixels_vertical_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly blur_surface_pixels_vertical_weighted_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly box_blur_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly color_matrix_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly composite_surface_pixels_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly composite_surface_region_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly convert_surface_pixel_order_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly convolve_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => void;
    readonly copy_surface_channel_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly copy_surface_pixels_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly dilate_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly displace_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number) => void;
    readonly dissolve_surface_pixels_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => number;
    readonly drop_shadow_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => void;
    readonly equalize_surface_histogram_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly erode_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly extract_surface_pixels_32_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly extract_surface_pixels_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly fill_surface_noise_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly fill_surface_perlin_noise_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly fill_surface_rectangle_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly flip_surface_horizontal_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly flip_surface_vertical_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly flood_fill_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly gaussian_blur_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly get_surface_color_bounds_rectangle_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
    readonly get_surface_coverage_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly get_surface_histogram_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly glow_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => void;
    readonly gradient_bevel_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number) => void;
    readonly gradient_glow_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => void;
    readonly inner_glow_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => void;
    readonly inner_shadow_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number) => void;
    readonly median_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly merge_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly pixelate_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly premultiply_surface_pixels_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly resize_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
    readonly rotate_surface_180_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly rotate_surface_clockwise_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly rotate_surface_counter_clockwise_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly rotate_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
    readonly scroll_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly sharpen_surface_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number) => void;
    readonly unpremultiply_surface_pixels_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly write_surface_pixels_32_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly write_surface_pixels_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
