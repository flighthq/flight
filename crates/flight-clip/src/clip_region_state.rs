//! flight-compiler: target-native
//!
//! Rust keeps Clip's module state thread-local, matching JavaScript's per-execution-thread module
//! binding. The TypeScript counterpart uses one lazy package-private binding.

use flight_entity::Ref;

use crate::clip_region_runtime::{ClipRegionState, create_clip_region_state};

thread_local! {
    static CLIP_REGION_STATE_BINDING: Ref<ClipRegionState> = create_clip_region_state();
}

pub(crate) fn get_clip_region_state_binding() -> Ref<ClipRegionState> {
    return CLIP_REGION_STATE_BINDING.with(Clone::clone);
}
