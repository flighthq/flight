use flight_spritesheet::{
    SpritesheetAnimationData, SpritesheetAnimationDirection, SpritesheetFrameData,
    create_spritesheet_animation_data, create_spritesheet_frame_data,
};
use flight_textureatlas::{TextureAtlasRegion, TextureAtlasRotation};

pub(crate) fn frame_from_region(
    region: &TextureAtlasRegion,
    normalize_pivot: bool,
) -> SpritesheetFrameData {
    let rotated = region.rotation != TextureAtlasRotation::None;
    let width = if rotated { region.height } else { region.width };
    let height = if rotated { region.width } else { region.height };
    let source_width = region.original_width.unwrap_or(width);
    let source_height = region.original_height.unwrap_or(height);
    let mut frame = create_spritesheet_frame_data();
    frame.height = height;
    frame.name = region.name.clone().unwrap_or_default();
    frame.offset_x = region.source_x;
    frame.offset_y = region.source_y;
    frame.pivot_x = region.pivot_x.map(|value| {
        if normalize_pivot && source_width > 0.0 {
            value / source_width
        } else {
            value
        }
    });
    frame.pivot_y = region.pivot_y.map(|value| {
        if normalize_pivot && source_height > 0.0 {
            value / source_height
        } else {
            value
        }
    });
    frame.rotated = rotated;
    frame.source_height = source_height;
    frame.source_width = source_width;
    frame.width = width;
    frame.x = region.x;
    frame.y = region.y;
    return frame;
}

// flight-lint: allow(f64) D1: frame timings are source JavaScript numbers
pub(crate) fn infer_animations(
    frame_names: &[String],
    frame_duration: f64,
) -> Vec<SpritesheetAnimationData> {
    let mut groups: Vec<(String, Vec<(i32, String)>)> = Vec::new();
    for name in frame_names {
        let no_extension = strip_word_extension(name);
        let Some((base, index)) = split_numeric_suffix(no_extension) else {
            continue;
        };
        if let Some((_, entries)) = groups.iter_mut().find(|(candidate, _)| candidate == base) {
            entries.push((index, name.clone()));
        } else {
            groups.push((base.to_string(), vec![(index, name.clone())]));
        }
    }
    let mut animations = Vec::new();
    for (base, mut entries) in groups {
        if entries.len() < 2 {
            continue;
        }
        entries.sort_by_key(|(index, _)| *index);
        let mut animation = create_spritesheet_animation_data();
        animation.direction = SpritesheetAnimationDirection::Forward;
        animation.frame_duration = frame_duration;
        animation.frame_names = entries.into_iter().map(|(_, name)| name).collect();
        animation.name = base;
        animation.repeat_count = -1;
        animations.push(animation);
    }
    return animations;
}

fn split_numeric_suffix(value: &str) -> Option<(&str, i32)> {
    let bytes = value.as_bytes();
    let mut start = bytes.len();
    while start > 0 && bytes[start - 1].is_ascii_digit() {
        start -= 1;
    }
    if start == bytes.len() {
        return None;
    }
    let mut base_end = start;
    if base_end > 0 && bytes[base_end - 1] == b'_' {
        base_end -= 1;
    }
    return Some((&value[..base_end], value[start..].parse::<i32>().ok()?));
}

fn strip_word_extension(value: &str) -> &str {
    let Some(dot) = value.rfind('.') else {
        return value;
    };
    if dot + 1 < value.len()
        && value[dot + 1..]
            .chars()
            .all(|value| value == '_' || value.is_alphanumeric())
    {
        return &value[..dot];
    }
    return value;
}
