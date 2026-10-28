use crate::{
    BaseRenderState, ColorAdjustmentUnsupportedGuard, RenderProxies2D, RenderState,
    RenderStateFields, RenderStateRuntime, Scene3DGraphSyncPolicy,
};

/// Creates a backend-free render state with the common defaults (TS `createRenderState`). Fields
/// are assigned after creation (D23 B).
// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f, foreman-40198ce5): assign state fields after create
pub fn create_render_state() -> BaseRenderState {
    let mut state = BaseRenderState {
        render: RenderStateFields::default(),
        runtime: RenderStateRuntime::default(),
        registries: crate::RenderRegistries::default(),
    };
    initialize_render_state(&mut state);
    return state;
}

/// Creates the package-private machinery for a state.
pub fn create_render_state_runtime<S: RenderState>() -> RenderStateRuntime<S> {
    return RenderStateRuntime::default();
}

/// Constructs a backend-free render state's common fields and machinery in place (TS
/// `initializeRenderState`): smoothing on, clip depth 0, pixel ratio 1, alpha 1, Normal blend, no
/// pixel rounding, and the refresh-derived-state sync policy.
// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f, foreman-40198ce5)
pub fn initialize_render_state(state: &mut BaseRenderState) {
    // Field by field: the fields struct carries the state's entity runtime (D12).
    state.render.allow_smoothing = true;
    state.render.current_clip_depth = 0;
    state.render.pixel_ratio = 1.0;
    state.render.render_alpha = 1.0;
    state.render.render_blend_mode = Some(flight_materials::BLEND_MODE_NORMAL.to_string());
    state.render.round_pixels = false;
    state.render.scene_graph_sync_policy = Scene3DGraphSyncPolicy::RefreshDerivedState;
    state.runtime = create_render_state_runtime();
    state.registries = crate::RenderRegistries::default();
}

/// Runs every live proxy teardown callback and clears common traversal/diagnostic state.
// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust and the TS transpile contract
pub fn destroy_render_state<S: RenderState>(state: &mut S, proxies: &mut RenderProxies2D<S>) {
    for slot in &mut proxies.entries {
        let Some(mut proxy) = slot.take() else {
            continue;
        };
        if let Some(data) = proxy.renderer_data.take()
            && let Some(destroy) = proxy.renderer.and_then(|renderer| renderer.destroy_data)
        {
            destroy(state, data);
        }
    }
    proxies.by_uid.clear();
    proxies.temp_stack.clear();
    let runtime = state.render_runtime_mut();
    if let Some(signals) = runtime.registry_signals.take() {
        flight_signals::clear_signal(&signals.on_registry_miss);
    }
    runtime.render_proxy_adapter_map.clear();
    runtime.registry_guard_enabled = false;
    runtime.registry_misses.write().unwrap().clear();
    runtime.registry_guard_log = None;
    runtime.color_adjustment_guard_log = None;
    runtime.scene_render_guard_log = None;
    runtime.prepared_scene3d = None;
    state.render_registries_mut().effect_padding_resolvers = None;
}

pub fn get_color_adjustment_unsupported_guard<S: RenderState>(
    state: &S,
) -> Option<ColorAdjustmentUnsupportedGuard<S>> {
    return state.render_registries().color_adjustment_unsupported_guard;
}

pub fn get_render_state_runtime<S: RenderState>(state: &S) -> &RenderStateRuntime<S> {
    return state.render_runtime();
}

// flight-lint: allow(conform-extra) D12 generic RenderState needs an explicit mutable runtime accessor in Rust
pub fn get_render_state_runtime_mut<S: RenderState>(state: &mut S) -> &mut RenderStateRuntime<S> {
    return state.render_runtime_mut();
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
