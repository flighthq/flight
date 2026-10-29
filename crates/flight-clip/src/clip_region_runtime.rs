//! flight-compiler: nullable-options
//! flight-compiler: entity-runtime-state ClipRegionState.state

use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};

use crate::clip_region_state::get_clip_region_state_binding;
use crate::types::{
    ClipRegion, ClipRegionContoursGuard, ClipRegionReleaseGuard, ClipRegionUseGuard,
};

pub(crate) struct ClipRegionState {
    runtime: EntityRuntimeSlot,
    pub(crate) state: Ref<ClipRegionRuntime>,
}

pub(crate) struct ClipRegionRuntime {
    pub pool: Vec<Ref<ClipRegion>>,
    pub pool_size: usize,
    pub contours_guard: Option<ClipRegionContoursGuard>,
    pub release_guard: Option<ClipRegionReleaseGuard>,
    pub use_guard: Option<ClipRegionUseGuard>,
}

impl Default for ClipRegionState {
    fn default() -> Self {
        return ClipRegionState {
            runtime: EntityRuntimeSlot::default(),
            state: Arc::new(RwLock::new(ClipRegionRuntime {
                pool: Vec::new(),
                pool_size: 0,
                contours_guard: None,
                release_guard: None,
                use_guard: None,
            })),
        };
    }
}

flight_entity::impl_entity!(ClipRegionState);

pub fn create_clip_region_state() -> Ref<ClipRegionState> {
    let mut out: ClipRegionState = allocate_entity();
    out.state = Arc::new(RwLock::new(ClipRegionRuntime {
        pool: Vec::new(),
        pool_size: 0,
        contours_guard: None,
        release_guard: None,
        use_guard: None,
    }));
    return Arc::new(RwLock::new(out));
}

fn get_clip_region_runtime(state: &ClipRegionState) -> Ref<ClipRegionRuntime> {
    return state.state.clone();
}

fn get_bound_clip_region_runtime() -> Ref<ClipRegionRuntime> {
    let binding: Ref<ClipRegionState> = get_clip_region_state_binding();
    let state = binding.read().unwrap();
    return get_clip_region_runtime(&state);
}

pub fn acquire_clip_region_from_pool() -> Option<Ref<ClipRegion>> {
    let runtime = get_bound_clip_region_runtime();
    let mut runtime = runtime.write().unwrap();
    if runtime.pool_size == 0 {
        return None;
    }
    runtime.pool_size -= 1;
    return Some(runtime.pool[runtime.pool_size].clone());
}

pub fn get_clip_region_contours_guard() -> Option<ClipRegionContoursGuard> {
    let runtime = get_bound_clip_region_runtime();
    let runtime = runtime.read().unwrap();
    return runtime.contours_guard.clone();
}

pub fn is_clip_region_released(clip: &Ref<ClipRegion>) -> bool {
    let runtime = get_bound_clip_region_runtime();
    let runtime = runtime.read().unwrap();
    return clip_region_runtime_contains(&runtime, clip);
}

pub fn release_clip_region_to_pool(clip: &Ref<ClipRegion>) {
    let runtime = get_bound_clip_region_runtime();
    let mut runtime = runtime.write().unwrap();
    let index = runtime.pool_size;
    if index < runtime.pool.len() {
        runtime.pool[index] = clip.clone();
    } else {
        runtime.pool.push(clip.clone());
    }
    runtime.pool_size += 1;
}

pub fn set_clip_region_contours_guard_slot(guard: Option<ClipRegionContoursGuard>) {
    let runtime = get_bound_clip_region_runtime();
    let mut runtime = runtime.write().unwrap();
    runtime.contours_guard = guard;
}

pub fn set_clip_region_release_guard_slot(guard: Option<ClipRegionReleaseGuard>) {
    let runtime = get_bound_clip_region_runtime();
    let mut runtime = runtime.write().unwrap();
    runtime.release_guard = guard;
}

pub fn set_clip_region_use_guard_slot(guard: Option<ClipRegionUseGuard>) {
    let runtime = get_bound_clip_region_runtime();
    let mut runtime = runtime.write().unwrap();
    runtime.use_guard = guard;
}

pub fn snapshot_clip_region_release_guard(
    clip: &Ref<ClipRegion>,
) -> (Option<ClipRegionReleaseGuard>, bool) {
    let runtime = get_bound_clip_region_runtime();
    let runtime = runtime.read().unwrap();
    return (
        runtime.release_guard.clone(),
        clip_region_runtime_contains(&runtime, clip),
    );
}

pub fn snapshot_clip_region_use_guard(
    clip: &Ref<ClipRegion>,
) -> (Option<ClipRegionUseGuard>, bool) {
    let runtime = get_bound_clip_region_runtime();
    let runtime = runtime.read().unwrap();
    return (
        runtime.use_guard.clone(),
        clip_region_runtime_contains(&runtime, clip),
    );
}

fn clip_region_runtime_contains(runtime: &ClipRegionRuntime, clip: &Ref<ClipRegion>) -> bool {
    for index in 0..runtime.pool_size {
        if Arc::ptr_eq(&runtime.pool[index], clip) {
            return true;
        }
    }
    return false;
}
