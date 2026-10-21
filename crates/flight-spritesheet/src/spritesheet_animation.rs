use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::types::*;

pub fn create_spritesheet_animation(
    obj: Option<&SpritesheetAnimationOptions>,
) -> Ref<SpritesheetAnimation> {
    let mut out: SpritesheetAnimation = allocate_entity();
    initialize_spritesheet_animation(&mut out, obj);
    return Arc::new(RwLock::new(out));
}

/// An animation over the sheet frames whose atlas region (looked up by the frame's id as a region
/// index) is named and matches `pattern`, in frame order; `None` without an atlas or a match.
// flight-lint: allow(f64) D1: animation frame references are JS numbers
pub fn create_spritesheet_animation_from_frame_names(
    spritesheet: &Spritesheet,
    pattern: &SpritesheetFramePattern,
    options: Option<&SpritesheetAnimationFrameNameOptions>,
) -> Option<Ref<SpritesheetAnimation>> {
    let atlas = spritesheet.atlas.as_ref()?;
    let atlas = atlas.read().unwrap();
    let mut matched = Vec::new();
    for (i, frame) in spritesheet.frames.iter().enumerate() {
        let region_id = frame.read().unwrap().id;
        let Some(region) = usize::try_from(region_id)
            .ok()
            .and_then(|index| atlas.regions.get(index))
        else {
            continue;
        };
        let Some(name) = region.read().unwrap().name.clone() else {
            continue;
        };
        let matches = match pattern {
            SpritesheetFramePattern::Name(pattern) => {
                name == pattern.value || name.starts_with(&pattern.value)
            }
            SpritesheetFramePattern::Test(pattern) => (pattern.test)(&name),
        };
        if matches {
            matched.push(i as f64);
        }
    }
    if matched.is_empty() {
        return None;
    }
    let make: fn() -> SpritesheetAnimationFrameNameOptions =
        SpritesheetAnimationFrameNameOptions::default;
    let defaults = make();
    let options = options.unwrap_or(&defaults);
    return Some(create_spritesheet_animation(Some(
        &SpritesheetAnimationOptions {
            direction: options.direction,
            frame_duration: options.frame_duration,
            frame_durations: options.frame_durations.clone(),
            frames: Some(matched),
            origin_x: options.origin_x,
            origin_y: options.origin_y,
            repeat_count: options.repeat_count,
        },
    )));
}

/// The construction initializer of `create_spritesheet_animation`: each field from `obj`, or forward,
/// zero duration, no per-frame durations, no frames, zero origin, no extra repeats.
pub fn initialize_spritesheet_animation(
    out: &mut SpritesheetAnimation,
    obj: Option<&SpritesheetAnimationOptions>,
) {
    let make: fn() -> SpritesheetAnimationOptions = SpritesheetAnimationOptions::default;
    let defaults = make();
    let obj = obj.unwrap_or(&defaults);
    out.direction = obj
        .direction
        .unwrap_or(SpritesheetAnimationDirection::Forward);
    out.frame_duration = obj.frame_duration.unwrap_or(0.0);
    out.frame_durations = obj.frame_durations.clone();
    out.frames = obj.frames.clone().unwrap_or_default();
    out.origin_x = obj.origin_x.unwrap_or(0.0);
    out.origin_y = obj.origin_y.unwrap_or(0.0);
    out.repeat_count = obj.repeat_count.unwrap_or(0);
    out.cumulative_durations = Mutex::new(None);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SpritesheetAnimationDirection string union; the TS package exports no get_/parse_ free functions
pub fn get_spritesheet_animation_direction_string(
    value: SpritesheetAnimationDirection,
) -> &'static str {
    return match value {
        SpritesheetAnimationDirection::Forward => "forward",
        SpritesheetAnimationDirection::Pingpong => "pingpong",
        SpritesheetAnimationDirection::PingpongReverse => "pingpong_reverse",
        SpritesheetAnimationDirection::Reverse => "reverse",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SpritesheetAnimationDirection string union; the TS package exports no get_/parse_ free functions
pub fn parse_spritesheet_animation_direction(value: &str) -> Option<SpritesheetAnimationDirection> {
    return match value {
        "forward" => Some(SpritesheetAnimationDirection::Forward),
        "pingpong" => Some(SpritesheetAnimationDirection::Pingpong),
        "pingpong_reverse" => Some(SpritesheetAnimationDirection::PingpongReverse),
        "reverse" => Some(SpritesheetAnimationDirection::Reverse),
        _ => None,
    };
}
