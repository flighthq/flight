use flight_entity::allocate_entity;

use crate::types::*;

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored descriptor fields after canonical construction
pub fn create_spritesheet_animation_data() -> SpritesheetAnimationData {
    let mut out: SpritesheetAnimationData = allocate_entity();
    initialize_spritesheet_animation_data(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored descriptor fields after canonical construction
pub fn create_spritesheet_data() -> SpritesheetData {
    let mut out: SpritesheetData = allocate_entity();
    initialize_spritesheet_data(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored descriptor fields after canonical construction
pub fn create_spritesheet_frame_data() -> SpritesheetFrameData {
    let mut out: SpritesheetFrameData = allocate_entity();
    initialize_spritesheet_frame_data(&mut out);
    return out;
}

/// Restores forward, 100 ms frames, no per-frame durations or names, an empty name, zero origin and
/// indefinite repetition without replacing the entity identity.
// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization establishes canonical descriptor defaults before authored assignment
pub fn initialize_spritesheet_animation_data(out: &mut SpritesheetAnimationData) {
    out.direction = SpritesheetAnimationDirection::Forward;
    out.frame_duration = 100.0;
    out.frame_durations = None;
    out.frame_names = Vec::new();
    out.name = String::new();
    out.origin_x = 0.0;
    out.origin_y = 0.0;
    out.repeat_count = -1;
}

/// Restores empty descriptor collections and image metadata with scale 1 without replacing identity.
// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization establishes canonical descriptor defaults before authored assignment
pub fn initialize_spritesheet_data(out: &mut SpritesheetData) {
    out.animations = Vec::new();
    out.frames = Vec::new();
    out.image_file = String::new();
    out.image_height = 0.0;
    out.image_width = 0.0;
    out.scale = 1.0;
}

/// Restores zero rects and offsets, an empty name, no pivot and no rotation without replacing identity.
// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization establishes canonical descriptor defaults before authored assignment
pub fn initialize_spritesheet_frame_data(out: &mut SpritesheetFrameData) {
    out.height = 0.0;
    out.name = String::new();
    out.offset_x = 0.0;
    out.offset_y = 0.0;
    out.pivot_x = None;
    out.pivot_y = None;
    out.rotated = false;
    out.source_height = 0.0;
    out.source_width = 0.0;
    out.width = 0.0;
    out.x = 0.0;
    out.y = 0.0;
}
