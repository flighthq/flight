use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::types::*;

pub fn create_spritesheet_frame(obj: Option<&SpritesheetFrameOptions>) -> Ref<SpritesheetFrame> {
    let mut out: SpritesheetFrame = allocate_entity();
    initialize_spritesheet_frame(&mut out, obj);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_spritesheet_frame`: each field from `obj`, or id 0, zero
/// offsets, no pivot, not rotated.
pub fn initialize_spritesheet_frame(
    out: &mut SpritesheetFrame,
    obj: Option<&SpritesheetFrameOptions>,
) {
    let make: fn() -> SpritesheetFrameOptions = SpritesheetFrameOptions::default;
    let defaults = make();
    let obj = obj.unwrap_or(&defaults);
    out.id = obj.id.unwrap_or(0);
    out.offset_x = obj.offset_x.unwrap_or(0.0);
    out.offset_y = obj.offset_y.unwrap_or(0.0);
    out.pivot_x = obj.pivot_x;
    out.pivot_y = obj.pivot_y;
    out.rotated = obj.rotated.unwrap_or(false);
}
