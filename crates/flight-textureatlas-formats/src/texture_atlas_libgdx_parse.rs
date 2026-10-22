use flight_textureatlas::{
    TextureAtlas, TextureAtlasRegionOptions, TextureAtlasRotation, create_texture_atlas_region,
    set_texture_atlas_region,
};

use crate::texture_atlas_page_meta::{reset_texture_atlas_page_meta, texture_atlas_parse_js_float};

/// Parses the libGDX/Spine line grammar, concatenating regions from every page in source order.
// flight-lint: allow(conform-params) D9: mutable output is first and the source chaining return is unit
pub fn parse_texture_atlas_libgdx_atlas(atlas: &mut TextureAtlas, text: &str) {
    atlas.regions.clear();
    reset_texture_atlas_page_meta(atlas);
    let lines: Vec<&str> = text.lines().collect();
    let mut index = 0;
    let mut region_id = 0;
    let mut page_name: Option<String> = None;
    while index < lines.len() {
        while index < lines.len() && lines[index].trim().is_empty() {
            index += 1;
        }
        if index >= lines.len() {
            break;
        }
        let maybe_image = lines[index].trim();
        if !maybe_image.contains(':') {
            page_name = Some(maybe_image.to_string());
            if atlas.image_name.is_none() {
                atlas.image_name = page_name.clone();
            }
            index += 1;
            while index < lines.len() && !lines[index].trim().is_empty() {
                if lines[index].trim().contains(':') {
                    index += 1;
                } else {
                    break;
                }
            }
        }
        while index < lines.len() && !lines[index].trim().is_empty() {
            let line = lines[index].trim();
            if line.contains(':') {
                index += 1;
                continue;
            }
            let region_name = line;
            index += 1;
            let mut atlas_x = 0.0;
            let mut atlas_y = 0.0;
            let mut atlas_width = 0.0;
            let mut atlas_height = 0.0;
            let mut original_width = 0.0;
            let mut original_height = 0.0;
            let mut offset_x = 0.0;
            let mut offset_y = 0.0;
            let mut rotation = TextureAtlasRotation::None;
            let mut ordinal: Option<i32> = None;
            while index < lines.len() {
                let key_value = lines[index].trim();
                if key_value.is_empty() || !key_value.contains(':') {
                    break;
                }
                let colon = key_value.find(':').unwrap();
                let key = key_value[..colon].trim();
                let value = key_value[colon + 1..].trim();
                index += 1;
                match key {
                    "rotate" => {
                        if value == "true" {
                            rotation = TextureAtlasRotation::Counterclockwise90;
                        } else if value != "false" {
                            let degrees = texture_atlas_parse_js_float(value);
                            if degrees == 90.0 {
                                rotation = TextureAtlasRotation::Counterclockwise90;
                            } else if degrees == 270.0 {
                                rotation = TextureAtlasRotation::Clockwise90;
                            }
                        }
                    }
                    "xy" => {
                        let (x, y) = texture_atlas_libgdx_parse_pair(value);
                        atlas_x = x;
                        atlas_y = y;
                    }
                    "size" => {
                        let (width, height) = texture_atlas_libgdx_parse_pair(value);
                        atlas_width = width;
                        atlas_height = height;
                    }
                    "orig" => {
                        let (width, height) = texture_atlas_libgdx_parse_pair(value);
                        original_width = width;
                        original_height = height;
                    }
                    "offset" => {
                        let (x, y) = texture_atlas_libgdx_parse_pair(value);
                        offset_x = x;
                        offset_y = y;
                    }
                    "index" => ordinal = texture_atlas_libgdx_parse_integer_prefix(value),
                    _ => {}
                }
            }
            let name = match ordinal {
                Some(ordinal) if ordinal >= 0 => format!("{}_{}", region_name, ordinal),
                _ => region_name.to_string(),
            };
            let rotated = rotation != TextureAtlasRotation::None;
            let logical_width = if rotated { atlas_height } else { atlas_width };
            let logical_height = if rotated { atlas_width } else { atlas_height };
            let trimmed = original_width > 0.0
                && original_height > 0.0
                && (original_width != logical_width || original_height != logical_height);
            let options = TextureAtlasRegionOptions {
                height: Some(atlas_height),
                id: Some(region_id),
                name: Some(name),
                original_height: if trimmed { Some(original_height) } else { None },
                original_width: if trimmed { Some(original_width) } else { None },
                page_name: page_name.clone(),
                pivot_x: None,
                pivot_y: None,
                rotation: Some(rotation),
                source_x: Some(offset_x),
                source_y: Some(offset_y),
                trimmed: Some(trimmed),
                width: Some(atlas_width),
                x: Some(atlas_x),
                y: Some(atlas_y),
            };
            let region = create_texture_atlas_region();
            set_texture_atlas_region(&mut region.write().unwrap(), &options);
            atlas.regions.push(region);
            region_id += 1;
        }
    }
}

fn texture_atlas_libgdx_parse_integer_prefix(value: &str) -> Option<i32> {
    let value = value.trim_start();
    let bytes = value.as_bytes();
    let mut index = 0;
    if bytes
        .get(index)
        .is_some_and(|value| *value == b'+' || *value == b'-')
    {
        index += 1;
    }
    let digits_start = index;
    while bytes.get(index).is_some_and(u8::is_ascii_digit) {
        index += 1;
    }
    if index == digits_start {
        return None;
    }
    return value[..index].parse::<i32>().ok();
}

fn texture_atlas_libgdx_parse_pair(value: &str) -> (f32, f32) {
    let mut values = value.split(',');
    let first = texture_atlas_parse_js_float(values.next().unwrap_or("0").trim());
    let second = texture_atlas_parse_js_float(values.next().unwrap_or("0").trim());
    return (first, second);
}
