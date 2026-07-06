//! Per-node GL shader bindings — associates a custom `GlBitmapShader` with a
//! specific render proxy for a given render state.

use flighthq_types::kind::KindId;

use crate::render_state::GlRenderState;
use crate::shader::GlBitmapShader;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Returns the material-kind bitmap shader registered for `kind`, or `None`.
pub fn get_gl_material_shader(state: &GlRenderState, kind: KindId) -> Option<&GlBitmapShader> {
    state.runtime.material_shaders.get(&kind)
}

/// Returns the per-node shader override for `render_proxy_id`, if any.
pub fn get_gl_shader(state: &GlRenderState, render_proxy_id: u64) -> Option<&GlBitmapShader> {
    state.runtime.shader_bindings.get(&render_proxy_id)
}

/// Sets the state's default bitmap shader — the fallback `resolve_gl_shader`
/// returns when a node has neither a per-node binding nor a material-kind shader.
/// Ports TS `registerGlBitmapShader`.
pub fn register_gl_bitmap_shader(state: &mut GlRenderState, shader: GlBitmapShader) {
    state.runtime.default_bitmap_shader = Some(shader);
}

/// Registers a bitmap shader used for all nodes whose material has the given
/// `kind`. The render path resolves shaders by material kind.
pub fn register_gl_material_shader(
    state: &mut GlRenderState,
    kind: KindId,
    shader: GlBitmapShader,
) {
    state.runtime.material_shaders.insert(kind, shader);
}

/// Resolves the shader to use for `render_proxy_id`:
/// 1. Per-node binding (if set via `set_gl_shader`).
/// 2. Material-kind shader from the registry.
/// 3. `state`'s default bitmap shader.
///
/// # Panics
/// Panics if `state` has no default bitmap shader — that only happens before
/// `create_gl_render_state` has run, which is a programmer error.
pub fn resolve_gl_shader(
    state: &GlRenderState,
    render_proxy_id: u64,
    material_kind: Option<KindId>,
) -> &GlBitmapShader {
    if let Some(shader) = state.runtime.shader_bindings.get(&render_proxy_id) {
        return shader;
    }
    if let Some(kind) = material_kind
        && let Some(shader) = state.runtime.material_shaders.get(&kind)
    {
        return shader;
    }
    state
        .runtime
        .default_bitmap_shader
        .as_ref()
        .expect("default bitmap shader present after create_gl_render_state")
}

/// Binds `shader` to `render_proxy_id` for this render state, or removes the
/// binding when `shader` is `None`.
pub fn set_gl_shader(
    state: &mut GlRenderState,
    render_proxy_id: u64,
    shader: Option<GlBitmapShader>,
) {
    match shader {
        Some(shader) => {
            state
                .runtime
                .shader_bindings
                .insert(render_proxy_id, shader);
        }
        None => {
            state.runtime.shader_bindings.remove(&render_proxy_id);
        }
    }
}

#[cfg(test)]
mod tests {}
