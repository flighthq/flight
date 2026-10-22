use flight_entity::{Ref, allocate_entity, get_record_value};

use crate::spritesheet_frame::create_spritesheet_frame;
use crate::types::*;

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored sheet fields after canonical construction
pub fn create_spritesheet() -> Spritesheet {
    let mut out: Spritesheet = allocate_entity();
    initialize_spritesheet(&mut out);
    return out;
}

/// Restores the canonical empty sheet fields without replacing the entity identity.
// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization establishes canonical sheet defaults before authored assignment
pub fn initialize_spritesheet(out: &mut Spritesheet) {
    out.atlas = None;
    out.animations = Default::default();
    out.frames = Vec::new();
}

/// A new sheet sharing the atlas and the animation objects (a shallow copy of the animation table)
/// but with new frames carrying the same field values.
pub fn clone_spritesheet(spritesheet: &Spritesheet) -> Spritesheet {
    let frames = spritesheet
        .frames
        .iter()
        .map(|frame| {
            let frame = frame.read().unwrap();
            let out = create_spritesheet_frame();
            {
                let mut out = out.write().unwrap();
                out.id = frame.id;
                out.offset_x = frame.offset_x;
                out.offset_y = frame.offset_y;
                out.pivot_x = frame.pivot_x;
                out.pivot_y = frame.pivot_y;
                out.rotated = frame.rotated;
            }
            return out;
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
