use flight_textureatlas::TextureAtlas;

use crate::json::RawScale;
use crate::types::*;

/// Reads a positive finite page scale. Missing, invalid and non-positive values use the source
/// default of one.
pub fn read_texture_atlas_scale(scale: Option<&TextureAtlasScale>) -> f32 {
    let value = match scale {
        None => 1.0,
        Some(TextureAtlasScale::Number(value)) => value.value,
        Some(TextureAtlasScale::String(value)) => parse_js_float(&value.value),
    };
    if value.is_finite() && value > 0.0 {
        return value;
    }
    return 1.0;
}

/// Resets only page metadata. Regions and the retained page texture remain caller-owned.
pub fn reset_texture_atlas_page_meta(atlas: &mut TextureAtlas) {
    atlas.image_height = 0.0;
    atlas.image_name = None;
    atlas.image_width = 0.0;
    atlas.scale = 1.0;
}

pub(crate) fn parse_js_float(value: &str) -> f32 {
    let value = value.trim_start();
    let bytes = value.as_bytes();
    let mut index = 0;
    if bytes
        .get(index)
        .is_some_and(|value| *value == b'+' || *value == b'-')
    {
        index += 1;
    }
    let mut digits = 0;
    while bytes.get(index).is_some_and(u8::is_ascii_digit) {
        digits += 1;
        index += 1;
    }
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            digits += 1;
            index += 1;
        }
    }
    if digits == 0 {
        return f32::NAN;
    }
    if bytes
        .get(index)
        .is_some_and(|value| *value == b'e' || *value == b'E')
    {
        let exponent_start = index;
        index += 1;
        if bytes
            .get(index)
            .is_some_and(|value| *value == b'+' || *value == b'-')
        {
            index += 1;
        }
        let exponent_digits_start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        if index == exponent_digits_start {
            index = exponent_start;
        }
    }
    return value[..index].parse::<f32>().unwrap_or(f32::NAN);
}

pub(crate) fn read_raw_texture_atlas_scale(scale: Option<&RawScale>) -> f32 {
    let value = match scale {
        None => 1.0,
        Some(scale) => match scale.number {
            Some(value) => value,
            None => parse_js_float(scale.string.as_deref().unwrap_or("")),
        },
    };
    if value.is_finite() && value > 0.0 {
        return value;
    }
    return 1.0;
}
