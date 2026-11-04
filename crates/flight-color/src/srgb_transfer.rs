/// The IEC 61966-2-1 linear-to-sRGB inverse OETF for a single channel in [0, 1].
/// The canonical linear-to-sRGB channel transfer for the whole SDK; the packed form is
/// `pack_linear_to_color`. Does not clamp -- callers that need HDR clamping do so explicitly.
pub fn linear_channel_to_srgb(value: f32) -> f32 {
    if value <= 0.0031308 {
        return value * 12.92;
    }
    return 1.055 * value.powf(1.0 / 2.4) - 0.055;
}

/// The IEC 61966-2-1 sRGB electro-optical transfer function for a single channel in [0, 1].
/// The canonical sRGB-to-linear channel transfer for the whole SDK -- the single decode seam
/// that `unpack_color_to_linear` and `get_color_luminance` build on. Does not clamp.
pub fn srgb_channel_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        return value / 12.92;
    }
    return ((value + 0.055) / 1.055).powf(2.4);
}
