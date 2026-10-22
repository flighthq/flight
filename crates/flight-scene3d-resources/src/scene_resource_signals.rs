use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::create_signal;

use crate::types::*;

pub fn create_scene3d_resource_signals() -> Ref<Scene3DResourceSignals> {
    let mut out: Scene3DResourceSignals = allocate_entity();
    initialize_scene3d_resource_signals(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_scene3d_resource_signals(out: &mut Scene3DResourceSignals) {
    out.on_resource_failed = create_signal();
    out.on_resource_resolved = create_signal();
}

/// Enables (once) and returns the resolver's availability signals. Repeated calls return the same
/// group, so listeners connected earlier stay attached.
pub fn enable_scene3d_resource_signals(
    resolver: &Ref<Scene3DResourceResolver>,
) -> Ref<Scene3DResourceSignals> {
    let state = resolver.read().unwrap().state.clone();
    let mut runtime = state.write().unwrap();
    if let Some(signals) = &runtime.signals {
        return signals.clone();
    }
    let signals = create_scene3d_resource_signals();
    runtime.signals = Some(signals.clone());
    return signals;
}

/// Returns the resolver's availability signals, or `None` when they were never enabled.
pub fn get_scene3d_resource_signals(
    resolver: &Ref<Scene3DResourceResolver>,
) -> Option<Ref<Scene3DResourceSignals>> {
    let state = resolver.read().unwrap().state.clone();
    return state.read().unwrap().signals.clone();
}
