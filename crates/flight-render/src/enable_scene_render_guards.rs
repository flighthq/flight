use std::collections::HashMap;

use flight_log::{LogData, LogDataOrProvider, LogLevel, LogStateRef, LogValue, log_once};
use flight_scene3d::Mesh;

use crate::RenderState;

// flight-lint: allow(conform-params) D5 the guard is state-local instead of a hidden module global
pub fn disable_scene_render_guards<S: RenderState>(state: &mut S) {
    state.render_registries_mut().skinned_mesh_bounds_guard = None;
}

// flight-lint: allow(conform-params) D5 state-local guard and caller-owned LogState replace TS globals
pub fn enable_scene_render_guards<S: RenderState>(state: &mut S, log_state: Option<LogStateRef>) {
    state.render_runtime_mut().registry_guard_log = log_state;
    set_skinned_mesh_bounds_guard(state, Some(warn_on_unposed_skinned_mesh::<S>));
}

// flight-lint: allow(conform-params) D5 the guard is state-local instead of a hidden module global
pub fn set_skinned_mesh_bounds_guard<S: RenderState>(
    state: &mut S,
    guard: Option<fn(&mut S, &Mesh)>,
) {
    state.render_registries_mut().skinned_mesh_bounds_guard = guard;
}

fn warn_on_unposed_skinned_mesh<S: RenderState>(state: &mut S, _mesh: &Mesh) {
    let Some(log_state) = state.render_runtime().registry_guard_log.clone() else {
        return;
    };
    let mut data = HashMap::new();
    data.insert(
        "message".to_string(),
        LogValue::Str(
            "prepareScene3DRender: a skinned mesh has no posed bounds, so culling is testing it against its BIND POSE box and a deformed limb can be wrongly culled. Call prepareScene3DSkinning (@flighthq/skeleton3d) before prepareScene3DRender each frame."
                .to_string(),
        ),
    );
    log_once(
        &log_state,
        0.0,
        "render:skinned-mesh-without-deformed-bounds",
        LogLevel::Warn,
        LogDataOrProvider::Data(LogData::Record(data)),
        Some("render".to_string()),
    );
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
