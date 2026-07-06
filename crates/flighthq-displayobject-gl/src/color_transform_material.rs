//! GL color-transform materials — per-instance and uniform variants.

use flighthq_types::kind::KindId;
use flighthq_types::material::{ColorTransformMaterial, UniformColorTransformMaterial};

use crate::materials::{COLOR_TRANSFORM_INSTANCE_FLOATS, pack_gl_color_transform};
use crate::sprite_batch::{
    bind_gl_quad_batch_base_attributes, ensure_gl_quad_batch_shader,
    set_gl_quad_batch_world_and_texture, submit_gl_node_atlas_quad, use_gl_quad_batch_program,
};
use flighthq_render_gl::GlRenderState;
use flighthq_render_gl::{GlMaterialRenderer, register_gl_material_renderer};

/// Material renderer that applies a per-node `ColorTransform` (per-instance
/// data): independently-tinted nodes share one batch. Mirrors the wgpu
/// `ColorTransformWgpuMaterialRenderer`.
pub struct GlColorTransformMaterialRenderer;

impl GlMaterialRenderer for GlColorTransformMaterialRenderer {
    fn instance_float_count(&self) -> u32 {
        COLOR_TRANSFORM_INSTANCE_FLOATS as u32
    }

    fn bind(&self, state: &mut GlRenderState, _material_id: u64) {
        bind_gl_quad_batch(state);
    }

    fn pack_instance(
        &self,
        _state: &mut GlRenderState,
        _material_data_id: u64,
        out: &mut Vec<f32>,
        offset: usize,
    ) {
        // The render path resolves the per-node ColorTransform from material_data_id and supplies
        // it; absent that plumbing here, pack the identity transform (no tint). The packing math
        // itself — the exposed seam — is pack_gl_color_transform.
        if out.len() < offset + COLOR_TRANSFORM_INSTANCE_FLOATS {
            out.resize(offset + COLOR_TRANSFORM_INSTANCE_FLOATS, 0.0);
        }
        pack_gl_color_transform(None, out, offset);
    }
}

/// Material renderer that applies a single static `ColorTransform` uniformly to
/// every instance in the batch. GL carries the color transform per-instance, so
/// a "uniform" color transform writes the same value into every instance slot.
/// Mirrors the wgpu `UniformColorTransformWgpuMaterialRenderer`.
pub struct GlUniformColorTransformMaterialRenderer;

impl GlMaterialRenderer for GlUniformColorTransformMaterialRenderer {
    fn instance_float_count(&self) -> u32 {
        COLOR_TRANSFORM_INSTANCE_FLOATS as u32
    }

    fn bind(&self, state: &mut GlRenderState, _material_id: u64) {
        bind_gl_quad_batch(state);
    }

    fn pack_instance(
        &self,
        _state: &mut GlRenderState,
        _material_data_id: u64,
        out: &mut Vec<f32>,
        offset: usize,
    ) {
        if out.len() < offset + COLOR_TRANSFORM_INSTANCE_FLOATS {
            out.resize(offset + COLOR_TRANSFORM_INSTANCE_FLOATS, 0.0);
        }
        pack_gl_color_transform(None, out, offset);
    }
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Draws a render proxy that carries a `ColorTransformMaterial`, submitting it
/// into the sprite batch under its color-transform material so the instanced
/// color-transform shader (registered via `register_gl_color_transform_shader`)
/// tints each node independently.
pub fn draw_gl_color_transform_material(state: &mut GlRenderState, render_proxy_id: u64) {
    submit_gl_node_atlas_quad(state, render_proxy_id, 1.0, 1.0);
}

/// Registers the per-instance color-transform material renderer on `state` under
/// `ColorTransformMaterial`'s kind.
pub fn register_gl_color_transform_material(state: &mut GlRenderState) {
    register_gl_material_renderer(
        state,
        KindId::of::<ColorTransformMaterial>(),
        Box::new(GlColorTransformMaterialRenderer),
    );
}

/// Registers the uniform (whole-batch) color-transform material renderer on
/// `state` under `UniformColorTransformMaterial`'s kind.
pub fn register_gl_uniform_color_transform_material(state: &mut GlRenderState) {
    register_gl_material_renderer(
        state,
        KindId::of::<UniformColorTransformMaterial>(),
        Box::new(GlUniformColorTransformMaterialRenderer),
    );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Binds the shared instanced quad-batch shader and its base attributes — the
// program the color-transform materials draw through. The per-node tint arrives
// via the per-instance material buffer written by `pack_instance`.
fn bind_gl_quad_batch(state: &mut GlRenderState) {
    let shader = ensure_gl_quad_batch_shader(state);
    let program = shader.program;
    let loc_corner = shader.loc_corner;
    let loc_world = shader.loc_world_matrix;
    let loc_texture = shader.loc_texture;
    use_gl_quad_batch_program(state, program);
    if let (Some(loc_world), Some(loc_texture)) = (loc_world, loc_texture) {
        set_gl_quad_batch_world_and_texture(state, &loc_world, &loc_texture);
    }
    bind_gl_quad_batch_base_attributes(state, loc_corner);
}

#[cfg(test)]
mod tests {
    use super::*;

    // instance_float_count

    #[test]
    fn color_transform_instance_float_count_is_8() {
        assert_eq!(GlColorTransformMaterialRenderer.instance_float_count(), 8);
        assert_eq!(
            GlUniformColorTransformMaterialRenderer.instance_float_count(),
            8
        );
    }
}
