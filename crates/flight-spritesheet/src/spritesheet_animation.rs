use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{Ref, allocate_entity};

use flight_regexp::test_reg_exp;

use crate::types::*;

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored animation fields after canonical construction
pub fn create_spritesheet_animation() -> Ref<SpritesheetAnimation> {
    let mut out: SpritesheetAnimation = allocate_entity();
    initialize_spritesheet_animation(&mut out);
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
            SpritesheetFramePattern::Pattern(pattern) => test_reg_exp(&pattern.value, &name),
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
    let animation = create_spritesheet_animation();
    {
        let mut animation = animation.write().unwrap();
        animation.direction = options
            .direction
            .unwrap_or(SpritesheetAnimationDirection::Forward);
        animation.frame_duration = options.frame_duration.unwrap_or(0.0);
        animation.frame_durations = options.frame_durations.clone();
        animation.frames = matched;
        animation.origin_x = options.origin_x.unwrap_or(0.0);
        animation.origin_y = options.origin_y.unwrap_or(0.0);
        animation.repeat_count = options.repeat_count.unwrap_or(0);
    }
    return Some(animation);
}

/// Restores the canonical animation defaults and clears the derived duration cache without replacing
/// the entity identity.
// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization establishes canonical animation defaults before authored assignment
pub fn initialize_spritesheet_animation(out: &mut SpritesheetAnimation) {
    out.direction = SpritesheetAnimationDirection::Forward;
    out.frame_duration = 0.0;
    out.frame_durations = None;
    out.frames = Vec::new();
    out.origin_x = 0.0;
    out.origin_y = 0.0;
    out.repeat_count = 0;
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
