/// Premultiplies the RGB channels of a packed sRGB `0xRRGGBBAA` color by its alpha channel
/// and returns a new packed color. Output RGB = round(RGB * alpha). The alpha channel
/// is preserved unchanged. Fully-transparent (alpha=0) results in black-with-alpha-0.
/// Used when a renderer requires premultiplied-alpha color values.
pub fn premultiply_color_alpha(color: u32) -> u32 {
    let a = (color & 0xff) as f32 / 255.0;
    let r = (((color >> 24) & 0xff) as f32 * a).round() as u32;
    let g = (((color >> 16) & 0xff) as f32 * a).round() as u32;
    let b = (((color >> 8) & 0xff) as f32 * a).round() as u32;
    return (r << 24) | (g << 16) | (b << 8) | (color & 0xff);
}

/// Reverses premultiplied-alpha encoding for a packed sRGB `0xRRGGBBAA` color.
/// Output RGB = round(RGB / alpha), clamped to [0, 255]. Returns the input unchanged
/// when alpha is 0 (division-by-zero guard: fully-transparent stays black-with-alpha-0).
pub fn unpremultiply_color_alpha(color: u32) -> u32 {
    let a = (color & 0xff) as f32 / 255.0;
    if a == 0.0 {
        return color;
    }
    let r = (((color >> 24) & 0xff) as f32 / a).round().min(255.0) as u32;
    let g = (((color >> 16) & 0xff) as f32 / a).round().min(255.0) as u32;
    let b = (((color >> 8) & 0xff) as f32 / a).round().min(255.0) as u32;
    return (r << 24) | (g << 16) | (b << 8) | (color & 0xff);
}
