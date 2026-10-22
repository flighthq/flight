// flight-lint: allow-file(contract-vocabulary) D17 target-pool ownership uses native handles and Result diagnostics

use flight_entity::EntityRuntimeSlot;
use flight_render::RenderTargetClear;
use flight_render::{
    RenderTargetAxes, RenderTargetDescriptor, RenderTargetFormatPolicy,
    resolve_render_target_descriptor,
};

use crate::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, clear_gl_render_target,
    create_gl_texture_render_target, destroy_gl_texture_render_target,
    resolve_gl_render_target_axes,
};

pub fn create_gl_texture_render_target_pool() -> GlTextureRenderTargetPool {
    return GlTextureRenderTargetPool {
        runtime: EntityRuntimeSlot::default(),
        free: Vec::new(),
    };
}

pub fn initialize_gl_texture_render_target_pool(out: &mut GlTextureRenderTargetPool) {
    out.free.clear();
}

pub fn acquire_gl_texture_render_target(
    state: &GlRenderState,
    pool: &mut GlTextureRenderTargetPool,
    descriptor: &RenderTargetDescriptor,
    format_policy: Option<RenderTargetFormatPolicy>,
) -> Result<Option<GlTextureRenderTarget>, String> {
    let requested = resolve_render_target_descriptor(descriptor);
    let Some(effective) = resolve_gl_render_target_axes(state, descriptor, format_policy) else {
        return Ok(None);
    };
    if let Some(index) = pool
        .free
        .iter()
        .position(|candidate| matches_gl_render_target_axes(candidate, &effective))
    {
        let mut candidate = pool.free.remove(index);
        candidate.requested_axes = requested;
        clear_gl_render_target(
            &candidate,
            &RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                colors: None,
                depth: None,
                stencil: None,
            },
        );
        return Ok(Some(candidate));
    }
    return create_gl_texture_render_target(state, descriptor, format_policy);
}

pub fn destroy_gl_texture_render_target_pool(pool: &mut GlTextureRenderTargetPool) {
    for target in &mut pool.free {
        destroy_gl_texture_render_target(target);
    }
    pool.free.clear();
}

fn matches_gl_render_target_axes(target: &GlTextureRenderTarget, axes: &RenderTargetAxes) -> bool {
    return target.axes == *axes;
}

pub fn release_gl_texture_render_target(
    pool: &mut GlTextureRenderTargetPool,
    target: GlTextureRenderTarget,
) {
    pool.free.push(target);
}
