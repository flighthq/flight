use flight_entity::allocate_entity;

use crate::types::*;

pub fn create_spritesheet_animation_data(
    obj: Option<SpritesheetAnimationDataOptions>,
) -> SpritesheetAnimationData {
    let mut out: SpritesheetAnimationData = allocate_entity();
    initialize_spritesheet_animation_data(&mut out, obj);
    return out;
}

pub fn create_spritesheet_data(obj: Option<SpritesheetDataOptions>) -> SpritesheetData {
    let mut out: SpritesheetData = allocate_entity();
    initialize_spritesheet_data(&mut out, obj);
    return out;
}

pub fn create_spritesheet_frame_data(
    obj: Option<SpritesheetFrameDataOptions>,
) -> SpritesheetFrameData {
    let mut out: SpritesheetFrameData = allocate_entity();
    initialize_spritesheet_frame_data(&mut out, obj);
    return out;
}

/// The construction initializer of `create_spritesheet_animation_data`: forward, 100 ms frames, no
/// per-frame durations or names, an empty name, zero origin, repeating indefinitely (-1).
pub fn initialize_spritesheet_animation_data(
    out: &mut SpritesheetAnimationData,
    obj: Option<SpritesheetAnimationDataOptions>,
) {
    let obj = obj.unwrap_or_default();
    out.direction = obj
        .direction
        .unwrap_or(SpritesheetAnimationDirection::Forward);
    out.frame_duration = obj.frame_duration.unwrap_or(100.0);
    out.frame_durations = obj.frame_durations;
    out.frame_names = obj.frame_names.unwrap_or_default();
    out.name = obj.name.unwrap_or_default();
    out.origin_x = obj.origin_x.unwrap_or(0.0);
    out.origin_y = obj.origin_y.unwrap_or(0.0);
    out.repeat_count = obj.repeat_count.unwrap_or(-1);
}

/// The construction initializer of `create_spritesheet_data`: the given animations and frames (used
/// directly), an empty image file, zero image size, scale 1.
pub fn initialize_spritesheet_data(out: &mut SpritesheetData, obj: Option<SpritesheetDataOptions>) {
    let obj = obj.unwrap_or_default();
    out.animations = obj.animations.unwrap_or_default();
    out.frames = obj.frames.unwrap_or_default();
    out.image_file = obj.image_file.unwrap_or_default();
    out.image_height = obj.image_height.unwrap_or(0.0);
    out.image_width = obj.image_width.unwrap_or(0.0);
    out.scale = obj.scale.unwrap_or(1.0);
}

/// The construction initializer of `create_spritesheet_frame_data`: zero rects and offsets, an empty
/// name, no pivot, not rotated.
pub fn initialize_spritesheet_frame_data(
    out: &mut SpritesheetFrameData,
    obj: Option<SpritesheetFrameDataOptions>,
) {
    let obj = obj.unwrap_or_default();
    out.height = obj.height.unwrap_or(0.0);
    out.name = obj.name.unwrap_or_default();
    out.offset_x = obj.offset_x.unwrap_or(0.0);
    out.offset_y = obj.offset_y.unwrap_or(0.0);
    out.pivot_x = obj.pivot_x;
    out.pivot_y = obj.pivot_y;
    out.rotated = obj.rotated.unwrap_or(false);
    out.source_height = obj.source_height.unwrap_or(0.0);
    out.source_width = obj.source_width.unwrap_or(0.0);
    out.width = obj.width.unwrap_or(0.0);
    out.x = obj.x.unwrap_or(0.0);
    out.y = obj.y.unwrap_or(0.0);
}
