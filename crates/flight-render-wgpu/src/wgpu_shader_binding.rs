//! Per-node bitmap shader bindings (TS `wgpuShaderBinding.ts`). The source's module WeakMap keyed
//! by render proxy becomes a state-local table keyed by the proxy's source node id (D5, D12): one
//! proxy exists per node per state.

use flight_entity::get_entity_id;
use flight_node::NodeRef;
use flight_render::{RenderProxies2D, RenderProxy2D, get_or_create_render_proxy_2d};

use crate::types::*;

fn get_render_proxy_node_id(render_proxy: &RenderProxy2D<WgpuRenderState>) -> u64 {
    return get_entity_id(&*render_proxy.proxy.source.read().unwrap());
}

/// The shader bound to a proxy's node on this state, if any (TS `getWgpuShader`).
// flight-lint: allow(conform-params) D5: the state-local binding table replaces the module WeakMap
pub fn get_wgpu_shader(
    state: &WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) -> Option<WgpuBitmapShader> {
    return get_wgpu_shader_by_node_id(state, get_render_proxy_node_id(render_proxy));
}

fn get_wgpu_shader_by_node_id(state: &WgpuRenderState, id: u64) -> Option<WgpuBitmapShader> {
    return state.runtime.shader_bindings.get(&id).cloned();
}

/// The per-node shader binding through the installed resolver, or `None` (TS `resolveWgpuShader`).
/// The resolver is installed only once `set_wgpu_shader` is used.
pub fn resolve_wgpu_shader(
    state: &WgpuRenderState,
    render_proxy: &RenderProxy2D<WgpuRenderState>,
) -> Option<WgpuBitmapShader> {
    let resolver = state.runtime.webgpu_shader_binding_resolver?;
    return resolver(state, get_render_proxy_node_id(render_proxy));
}

/// Binds (or with `None` unbinds) a shader to a node's proxy on this state (TS `setWgpuShader`).
// flight-lint: allow(conform-params) D17: caller-owned proxy storage is explicit in Rust
pub fn set_wgpu_shader(
    state: &mut WgpuRenderState,
    proxies: &mut RenderProxies2D<WgpuRenderState>,
    node: &NodeRef,
    shader: Option<WgpuBitmapShader>,
) {
    let render_proxy = get_or_create_render_proxy_2d(state, proxies, node);
    let id = get_render_proxy_node_id(render_proxy);
    let Some(shader) = shader else {
        state.runtime.shader_bindings.remove(&id);
        return;
    };
    state.runtime.shader_bindings.insert(id, shader);
    state.runtime.webgpu_shader_binding_resolver = Some(get_wgpu_shader_by_node_id);
}
