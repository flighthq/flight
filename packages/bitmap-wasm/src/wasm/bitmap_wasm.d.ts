/* tslint:disable */
/* eslint-disable */

export function apply_bitmap_curve_wasm(
  dest_data: Uint8Array,
  dest_descriptor: Float64Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  red_lut: Uint8Array,
  green_lut: Uint8Array,
  blue_lut: Uint8Array,
  alpha_lut: Uint8Array,
): void;

export function apply_bitmap_levels_wasm(
  dest_data: Uint8Array,
  dest_descriptor: Float64Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  black_point: number,
  white_point: number,
  gamma: number,
): void;

export function apply_bitmap_palette_map_wasm(
  dest_data: Uint8Array,
  dest_descriptor: Float64Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  red_map: Uint8Array,
  green_map: Uint8Array,
  blue_map: Uint8Array,
  alpha_map: Uint8Array,
): void;

export function build_bitmap_brightness_color_matrix_wasm(out: Float64Array, amount: number): void;

export function build_bitmap_contrast_color_matrix_wasm(out: Float64Array, amount: number): void;

export function build_bitmap_grayscale_color_matrix_wasm(out: Float64Array): void;

export function build_bitmap_hue_rotation_color_matrix_wasm(out: Float64Array, degrees: number): void;

export function build_bitmap_invert_color_matrix_wasm(out: Float64Array): void;

export function build_bitmap_saturation_color_matrix_wasm(out: Float64Array, amount: number): void;

export function build_bitmap_sepia_color_matrix_wasm(out: Float64Array): void;

export function color_matrix_bitmap_wasm(
  out: Uint8Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  matrix: Float64Array,
): void;

export function compare_bitmap_fingerprints_wasm(
  first_cells: Uint8Array,
  first_grid_size: number,
  second_cells: Uint8Array,
  second_grid_size: number,
): number;

export function concat_bitmap_color_matrix_wasm(out: Float64Array, first: Float64Array, second: Float64Array): void;

export function convolve_bitmap_wasm(
  out: Uint8Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  matrix: Float64Array,
  matrix_x: number,
  matrix_y: number,
  bias: number,
  edge: string,
  divisor: number,
  preserve_alpha: boolean,
): void;

export function copy_bitmap_alpha_wasm(
  dest_data: Uint8Array,
  dest_descriptor: Float64Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
): void;

export function copy_bitmap_pixels_wasm(
  dest_data: Uint8Array,
  dest_descriptor: Float64Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  composite: boolean,
): void;

export function dilate_bitmap_wasm(
  out: Uint8Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  radius: number,
): void;

export function erode_bitmap_wasm(
  out: Uint8Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  radius: number,
): void;

export function fill_bitmap_noise_wasm(
  data: Uint8Array,
  descriptor: Float64Array,
  seed: number,
  low: number,
  high: number,
  gray_scale: boolean,
): void;

export function fill_bitmap_perlin_noise_wasm(
  data: Uint8Array,
  descriptor: Float64Array,
  base_x: number,
  base_y: number,
  octaves: number,
  seed: number,
  gray_scale: boolean,
  stitch: boolean,
  channel_options: number,
): void;

export function fill_bitmap_rectangle_wasm(data: Uint8Array, descriptor: Float64Array, color: number): void;

export function fill_bitmap_turbulence_wasm(
  data: Uint8Array,
  descriptor: Float64Array,
  base_x: number,
  base_y: number,
  octaves: number,
  seed: number,
  gray_scale: boolean,
  stitch: boolean,
  channel_options: number,
): void;

export function get_bitmap_color_bounds_rectangle_wasm(
  out: Float64Array,
  data: Uint8Array,
  descriptor: Float64Array,
  mask: number,
  color: number,
  find_color: boolean,
): boolean;

export function get_bitmap_coverage_wasm(
  data: Uint8Array,
  width: number,
  height: number,
  background_color: number,
  channel_tolerance: number,
): number;

export function get_bitmap_histogram_wasm(out: Float64Array, data: Uint8Array, descriptor: Float64Array): void;

export function get_bitmap_mismatch_wasm(
  out: Float64Array,
  source_data: Uint8Array,
  source_width: number,
  source_height: number,
  other_data: Uint8Array,
  other_width: number,
  other_height: number,
  channel_tolerance: number,
): void;

export function merge_bitmap_channels_wasm(
  out_data: Uint8Array,
  out_descriptor: Float64Array,
  red_data: Uint8Array,
  red_descriptor: Float64Array,
  green_data: Uint8Array,
  green_descriptor: Float64Array,
  blue_data: Uint8Array,
  blue_descriptor: Float64Array,
  alpha_data: Uint8Array,
  alpha_descriptor: Float64Array,
): void;

export function multiply_bitmap_alpha_wasm(data: Uint8Array, descriptor: Float64Array, factor: number): void;

export function pixelate_bitmap_wasm(
  out: Uint8Array,
  source_data: Uint8Array,
  source_descriptor: Float64Array,
  block_size: number,
): void;

export function premultiply_bitmap_pixels_wasm(out: Uint8Array, source: Uint8Array, length: number): void;

export function set_bitmap_alpha_wasm(data: Uint8Array, descriptor: Float64Array, alpha: number): void;

export function set_bitmap_color_matrix_identity_wasm(out: Float64Array): void;

export function unpremultiply_bitmap_pixels_wasm(out: Uint8Array, source: Uint8Array, length: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

export default function __wbg_init(
  module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>;
