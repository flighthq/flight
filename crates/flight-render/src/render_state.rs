use crate::{
    BaseRenderState, ColorAdjustmentUnsupportedGuard, RenderProxies2D, RenderState,
    RenderStateFields, RenderStateInit, RenderStateRuntime,
};

/// Creates a backend-free render state with the common defaults.
pub fn create_render_state(obj: Option<&RenderStateInit>) -> BaseRenderState {
    let mut state = BaseRenderState {
        render: RenderStateFields::default(),
        runtime: RenderStateRuntime::default(),
        registries: crate::RenderRegistries::default(),
    };
    initialize_render_state(&mut state, obj);
    return state;
}

/// Creates the package-private machinery for a state.
pub fn create_render_state_runtime<S: RenderState>() -> RenderStateRuntime<S> {
    return RenderStateRuntime::default();
}

pub fn initialize_render_state(state: &mut BaseRenderState, obj: Option<&RenderStateInit>) {
    let default = RenderStateFields::default();
    state.render.allow_smoothing = obj
        .and_then(|value| value.allow_smoothing)
        .unwrap_or(default.allow_smoothing);
    state.render.current_clip_depth = obj
        .and_then(|value| value.current_clip_depth)
        .unwrap_or(default.current_clip_depth);
    state.render.pixel_ratio = obj
        .and_then(|value| value.pixel_ratio)
        .unwrap_or(default.pixel_ratio);
    state.render.render_alpha = obj
        .and_then(|value| value.render_alpha)
        .unwrap_or(default.render_alpha);
    state.render.render_blend_mode = obj
        .and_then(|value| value.render_blend_mode.clone())
        .unwrap_or(default.render_blend_mode);
    state.render.round_pixels = obj
        .and_then(|value| value.round_pixels)
        .unwrap_or(default.round_pixels);
    state.render.scene_graph_sync_policy = obj
        .and_then(|value| value.scene_graph_sync_policy)
        .unwrap_or(default.scene_graph_sync_policy);
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
