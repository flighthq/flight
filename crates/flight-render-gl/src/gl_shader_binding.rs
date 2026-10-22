// flight-lint: allow-file(contract-vocabulary) D17 shader resolution returns native Result diagnostics

use std::sync::Arc;

use flight_entity::{Kind, get_entity_id};
use flight_node::NodeRef;
use flight_render::{RenderProxies2D, RenderProxy2D, get_or_create_render_proxy_2d};

use crate::{GlBitmapShader, GlRenderState, ensure_default_gl_bitmap_shader};

pub fn get_gl_material_shader(state: &GlRenderState, kind: &Kind) -> Option<Arc<GlBitmapShader>> {
    return state
        .gl_runtime
        .borrow()
        .material_bitmap_shader_map
        .get(kind)
        .cloned();
}

// flight-lint: allow(conform-params) D12 shader lookup reads the explicit generic render-state registry rather than hidden state
pub fn get_gl_shader(
    state: &GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
) -> Option<Arc<GlBitmapShader>> {
    return state
        .gl_runtime
        .borrow()
        .shader_bindings
        .get(&get_entity_id(&render_proxy.proxy))
        .cloned();
}

pub fn register_gl_material_shader(state: &GlRenderState, kind: Kind, shader: Arc<GlBitmapShader>) {
    state
        .gl_runtime
        .borrow_mut()
        .material_bitmap_shader_map
        .insert(kind, shader);
}

pub fn resolve_gl_shader(
    state: &mut GlRenderState,
    render_proxy: &RenderProxy2D<GlRenderState>,
) -> Result<Arc<GlBitmapShader>, String> {
    if let Some(shader) = get_gl_shader(state, render_proxy) {
        return Ok(shader);
    }
    let material_kind = render_proxy
        .material
        .as_ref()
        .map(|material| material.read().unwrap().material_fields().kind.clone());
    if let Some(shader) = material_kind.and_then(|kind| {
        state
            .gl_runtime
            .borrow()
            .material_bitmap_shader_map
            .get(&kind)
            .cloned()
    }) {
        return Ok(shader);
    }
    return ensure_default_gl_bitmap_shader(state);
}

// flight-lint: allow(conform-params) D17 caller-owned proxy storage is explicit in Rust
pub fn set_gl_shader(
    state: &mut GlRenderState,
    proxies: &mut RenderProxies2D<GlRenderState>,
    node: &NodeRef,
    shader: Option<Arc<GlBitmapShader>>,
) {
    let proxy = get_or_create_render_proxy_2d(state, proxies, node);
    let id = get_entity_id(&proxy.proxy);
    match shader {
        Some(shader) => {
            state
                .gl_runtime
                .borrow_mut()
                .shader_bindings
                .insert(id, shader);
        }
        None => {
            state.gl_runtime.borrow_mut().shader_bindings.remove(&id);
        }
    }
}
