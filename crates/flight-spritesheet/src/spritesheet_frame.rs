use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::types::*;

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored frame fields after canonical construction
pub fn create_spritesheet_frame() -> Ref<SpritesheetFrame> {
    let mut out: SpritesheetFrame = allocate_entity();
    initialize_spritesheet_frame(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Restores the canonical frame defaults without replacing the entity identity.
// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization establishes canonical frame defaults before authored assignment
pub fn initialize_spritesheet_frame(out: &mut SpritesheetFrame) {
    out.id = 0;
    out.offset_x = 0.0;
    out.offset_y = 0.0;
    out.pivot_x = None;
    out.pivot_y = None;
    out.rotated = false;
}
