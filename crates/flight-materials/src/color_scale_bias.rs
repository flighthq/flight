use flight_entity::allocate_entity;

use crate::ColorScaleBias;

pub fn create_color_scale_bias() -> ColorScaleBias {
    let mut out: ColorScaleBias = allocate_entity();
    initialize_color_scale_bias(
        &mut out, None, None, None, None, None, None, None, None,
    );
    return out;
}

fn create_color_scale_bias_from(source: &ColorScaleBias) -> ColorScaleBias {
    let mut out: ColorScaleBias = allocate_entity();
    initialize_color_scale_bias(
        &mut out,
        Some(source.red_scale),
        Some(source.green_scale),
        Some(source.blue_scale),
        Some(source.alpha_scale),
        Some(source.red_bias),
        Some(source.green_bias),
        Some(source.blue_bias),
        Some(source.alpha_bias),
    );
    return out;
}

pub fn initialize_color_scale_bias(
    out: &mut ColorScaleBias,
    red_scale: Option<f32>,
    green_scale: Option<f32>,
    blue_scale: Option<f32>,
    alpha_scale: Option<f32>,
    red_bias: Option<f32>,
    green_bias: Option<f32>,
    blue_bias: Option<f32>,
    alpha_bias: Option<f32>,
) {
    out.red_scale = red_scale.unwrap_or(1.0);
    out.green_scale = green_scale.unwrap_or(1.0);
    out.blue_scale = blue_scale.unwrap_or(1.0);
    out.alpha_scale = alpha_scale.unwrap_or(1.0);
    out.red_bias = red_bias.unwrap_or(0.0);
    out.green_bias = green_bias.unwrap_or(0.0);
    out.blue_bias = blue_bias.unwrap_or(0.0);
    out.alpha_bias = alpha_bias.unwrap_or(0.0);
}

pub fn clone_color_scale_bias(source: &ColorScaleBias) -> ColorScaleBias {
    return create_color_scale_bias_from(source);
}

pub fn concat_color_scale_bias(
    out: &mut ColorScaleBias,
    source: &ColorScaleBias,
    other: &ColorScaleBias,
) {
    let s_red_scale = source.red_scale;
    let s_green_scale = source.green_scale;
    let s_blue_scale = source.blue_scale;
    let s_alpha_scale = source.alpha_scale;
    let s_red_bias = source.red_bias;
    let s_green_bias = source.green_bias;
    let s_blue_bias = source.blue_bias;
    let s_alpha_bias = source.alpha_bias;
    let o_red_bias = other.red_bias;
    let o_green_bias = other.green_bias;
    let o_blue_bias = other.blue_bias;
    let o_alpha_bias = other.alpha_bias;
    let o_red_scale = other.red_scale;
    let o_green_scale = other.green_scale;
    let o_blue_scale = other.blue_scale;
    let o_alpha_scale = other.alpha_scale;
    out.red_bias = s_red_scale * o_red_bias + s_red_bias;
    out.green_bias = s_green_scale * o_green_bias + s_green_bias;
    out.blue_bias = s_blue_scale * o_blue_bias + s_blue_bias;
    out.alpha_bias = s_alpha_scale * o_alpha_bias + s_alpha_bias;
    out.red_scale = s_red_scale * o_red_scale;
    out.green_scale = s_green_scale * o_green_scale;
    out.blue_scale = s_blue_scale * o_blue_scale;
    out.alpha_scale = s_alpha_scale * o_alpha_scale;
}

pub fn copy_color_scale_bias(out: &mut ColorScaleBias, source: &ColorScaleBias) {
    out.red_scale = source.red_scale;
    out.green_scale = source.green_scale;
    out.blue_scale = source.blue_scale;
    out.alpha_scale = source.alpha_scale;
    out.red_bias = source.red_bias;
    out.green_bias = source.green_bias;
    out.blue_bias = source.blue_bias;
    out.alpha_bias = source.alpha_bias;
}

pub fn copy_color_scale_bias_to_arrays(
    out_color_scales: &mut [f32],
    out_color_biases: &mut [f32],
    source: &ColorScaleBias,
) {
    out_color_scales[0] = source.red_scale;
    out_color_scales[1] = source.green_scale;
    out_color_scales[2] = source.blue_scale;
    out_color_scales[3] = source.alpha_scale;
    out_color_biases[0] = source.red_bias;
    out_color_biases[1] = source.green_bias;
    out_color_biases[2] = source.blue_bias;
    out_color_biases[3] = source.alpha_bias;
}

pub fn equals_color_scale_bias(a: &ColorScaleBias, b: &ColorScaleBias) -> bool {
    return equals_color_scale_bias_biases(a, b, true)
        && equals_color_scale_bias_scales(a, b, true);
}

pub fn equals_color_scale_bias_biases(
    a: &ColorScaleBias,
    b: &ColorScaleBias,
    compare_alpha: bool,
) -> bool {
    return a.red_bias == b.red_bias
        && a.green_bias == b.green_bias
        && a.blue_bias == b.blue_bias
        && (!compare_alpha || a.alpha_bias == b.alpha_bias);
}

pub fn equals_color_scale_bias_scales(
    a: &ColorScaleBias,
    b: &ColorScaleBias,
    compare_alpha: bool,
) -> bool {
    return a.red_scale == b.red_scale
        && a.green_scale == b.green_scale
        && a.blue_scale == b.blue_scale
        && (!compare_alpha || a.alpha_scale == b.alpha_scale);
}

pub fn get_color_scale_bias_bias_rgb(source: &ColorScaleBias) -> u32 {
    return ((f32::round(source.red_bias * 255.0) as u32) << 16)
        | ((f32::round(source.green_bias * 255.0) as u32) << 8)
        | (f32::round(source.blue_bias * 255.0) as u32);
}

pub fn get_color_scale_bias_bias_rgba(source: &ColorScaleBias) -> u32 {
    return ((f32::round(source.red_bias * 255.0) as u32) << 24)
        | ((f32::round(source.green_bias * 255.0) as u32) << 16)
        | ((f32::round(source.blue_bias * 255.0) as u32) << 8)
        | (f32::round(source.alpha_bias * 255.0) as u32);
}

pub fn invert_color_scale_bias(out: &mut ColorScaleBias, source: &ColorScaleBias) {
    let rs = source.red_scale;
    let gs = source.green_scale;
    let bs = source.blue_scale;
    let als = source.alpha_scale;
    let rb = source.red_bias;
    let gb = source.green_bias;
    let bb = source.blue_bias;
    let ab = source.alpha_bias;
    out.red_scale = if rs != 0.0 { 1.0 / rs } else { 1.0 };
    out.green_scale = if gs != 0.0 { 1.0 / gs } else { 1.0 };
    out.blue_scale = if bs != 0.0 { 1.0 / bs } else { 1.0 };
    out.alpha_scale = if als != 0.0 { 1.0 / als } else { 1.0 };
    out.red_bias = -rb;
    out.green_bias = -gb;
    out.blue_bias = -bb;
    out.alpha_bias = -ab;
}

pub fn is_identity_color_scale_bias(source: &ColorScaleBias, compare_alpha_scale: bool) -> bool {
    let identity = create_color_scale_bias();
    return equals_color_scale_bias_biases(source, &identity, true)
        && equals_color_scale_bias_scales(source, &identity, compare_alpha_scale);
}

pub fn set_color_scale_bias(
    out: &mut ColorScaleBias,
    red_scale: f32,
    green_scale: f32,
    blue_scale: f32,
    alpha_scale: f32,
    red_bias: f32,
    green_bias: f32,
    blue_bias: f32,
    alpha_bias: f32,
) {
    out.red_scale = red_scale;
    out.green_scale = green_scale;
    out.blue_scale = blue_scale;
    out.alpha_scale = alpha_scale;
    out.red_bias = red_bias;
    out.green_bias = green_bias;
    out.blue_bias = blue_bias;
    out.alpha_bias = alpha_bias;
}

pub fn set_color_scale_bias_bias_rgb(out: &mut ColorScaleBias, value: u32) {
    out.red_bias = ((value >> 16) & 0xff) as f32 / 255.0;
    out.green_bias = ((value >> 8) & 0xff) as f32 / 255.0;
    out.blue_bias = (value & 0xff) as f32 / 255.0;
    out.alpha_bias = 0.0;
    out.red_scale = 0.0;
    out.green_scale = 0.0;
    out.blue_scale = 0.0;
    out.alpha_scale = 1.0;
}

pub fn set_color_scale_bias_bias_rgba(out: &mut ColorScaleBias, value: u32) {
    out.red_bias = ((value >> 24) & 0xff) as f32 / 255.0;
    out.green_bias = ((value >> 16) & 0xff) as f32 / 255.0;
    out.blue_bias = ((value >> 8) & 0xff) as f32 / 255.0;
    out.alpha_bias = (value & 0xff) as f32 / 255.0;
    out.red_scale = 0.0;
    out.green_scale = 0.0;
    out.blue_scale = 0.0;
    out.alpha_scale = 0.0;
}

pub fn set_color_scale_bias_identity(out: &mut ColorScaleBias) {
    set_color_scale_bias(out, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
}
