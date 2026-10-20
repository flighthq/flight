use crate::srgb_channel_to_linear;

/// WCAG 2.x contrast ratio between two packed sRGB `0xRRGGBBAA` colors (alpha ignored).
/// Returns the ratio in [1, 21]; 1 = no contrast, 21 = black on white. The formula is
/// (L1 + 0.05) / (L2 + 0.05) where L1 >= L2 are the relative luminances.
pub fn get_color_contrast_ratio(a: u32, b: u32) -> f32 {
    let la = get_color_luminance(a);
    let lb = get_color_luminance(b);
    let lighter = la.max(lb);
    let darker = la.min(lb);
    return (lighter + 0.05) / (darker + 0.05);
}

/// Rec. 709 relative luminance of a packed sRGB `0xRRGGBBAA` color (alpha ignored).
/// Gamma-decodes RGB to linear, then applies the Rec. 709 luminance weights. Returns a
/// value in [0, 1] where 0 is black and 1 is white.
pub fn get_color_luminance(color: u32) -> f32 {
    let r = srgb_channel_to_linear(((color >> 24) & 0xff) as f32 / 255.0);
    let g = srgb_channel_to_linear(((color >> 16) & 0xff) as f32 / 255.0);
    let b = srgb_channel_to_linear(((color >> 8) & 0xff) as f32 / 255.0);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/// Rec. 2020 luminance weights (ITU-R BT.2020). Writes [r, g, b] weights into `out`.
/// L = 0.2627 * R + 0.6780 * G + 0.0593 * B.
pub fn get_rec2020_luminance_weights(out: &mut [f32; 3]) {
    out[0] = 0.2627;
    out[1] = 0.678;
    out[2] = 0.0593;
}

/// Rec. 709 / sRGB luminance weights (ITU-R BT.709). Writes [r, g, b] weights into `out`.
/// L = 0.2126 * R + 0.7152 * G + 0.0722 * B.
pub fn get_rec709_luminance_weights(out: &mut [f32; 3]) {
    out[0] = 0.2126;
    out[1] = 0.7152;
    out[2] = 0.0722;
}
