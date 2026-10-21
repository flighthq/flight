use flight_entity::{Ref, allocate_entity, get_record_value};

use crate::spritesheet_frame::create_spritesheet_frame;
use crate::types::*;

pub fn create_spritesheet(obj: Option<SpritesheetOptions>) -> Spritesheet {
    let mut out: Spritesheet = allocate_entity();
    initialize_spritesheet(&mut out, obj);
    return out;
}

/// The construction initializer of `create_spritesheet`: the given atlas, animations and frames (used
/// directly), or none.
pub fn initialize_spritesheet(out: &mut Spritesheet, obj: Option<SpritesheetOptions>) {
    let obj = obj.unwrap_or_default();
    out.atlas = obj.atlas;
    out.animations = obj.animations.unwrap_or_default();
    out.frames = obj.frames.unwrap_or_default();
}

/// A new sheet sharing the atlas and the animation objects (a shallow copy of the animation table)
/// but with new frames carrying the same field values.
pub fn clone_spritesheet(spritesheet: &Spritesheet) -> Spritesheet {
    let frames = spritesheet
        .frames
        .iter()
        .map(|frame| {
            let frame = frame.read().unwrap();
            create_spritesheet_frame(Some(&SpritesheetFrameOptions {
                id: Some(frame.id),
                offset_x: Some(frame.offset_x),
                offset_y: Some(frame.offset_y),
                pivot_x: frame.pivot_x,
                pivot_y: frame.pivot_y,
                rotated: Some(frame.rotated),
            }))
        })
        .collect();
    let mut out: Spritesheet = allocate_entity();
    out.atlas = spritesheet.atlas.clone();
    out.animations = spritesheet.animations.clone();
    out.frames = frames;
    return out;
}

/// The animation stored under `label`, or `None`.
pub fn get_spritesheet_animation(
    spritesheet: &Spritesheet,
    label: &str,
) -> Option<Ref<SpritesheetAnimation>> {
    return get_record_value(&spritesheet.animations, label).cloned();
}
