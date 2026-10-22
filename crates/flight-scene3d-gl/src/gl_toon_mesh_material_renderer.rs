use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{Material3D, MaterialAlphaMode, ToonMaterial, TOON_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, set_gl_mesh_camera_position, set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_toon_prelude::ensure_gl_toon_program;
use crate::types::{GlMeshMaterialRenderer, GlToonDefineKey, Scene3DLightBlock};

pub struct GlToonMeshMaterialRenderer;

impl GlMeshMaterialRenderer for GlToonMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let toon = material.as_any().downcast_ref::<ToonMaterial>();
        let define_key = GlToonDefineKey {
            alpha_mask_enabled: toon.map_or(false, |t| {
                t.material3d_fields().alpha_mode == MaterialAlphaMode::Mask
            }),
            has_base_color_map: toon.map_or(false, |t| t.base_color_map.is_some()),
            has_instanced: false,
            has_ramp: toon.map_or(false, |t| t.ramp.is_some()),
            has_skin: false,
            has_uv_transform: false,
        };
        let program = ensure_gl_toon_program(state, &define_key);
        let double_sided = toon.map_or(false, |t| t.material3d_fields().double_sided);
        begin_gl_mesh_draw(state, &program.lit.base, double_sided);
        set_gl_mesh_view_projection(
            state,
            program.lit.base.view_projection_location.clone(),
            camera,
        );
        set_gl_mesh_camera_position(
            &state.gl,
            program.lit.base.camera_position_location.clone(),
            camera,
        );
        bind_gl_mesh_light_block(state, &program.lit, light_block);

        unsafe {
            if let Some(t) = toon {
                let mut rgba = allocate_linear_color();
                unpack_color_to_linear(&mut rgba, t.base_color);
                if let Some(ref loc) = program.base_color_location {
                    state
                        .gl
                        .uniform_4_f32(Some(loc), rgba.r, rgba.g, rgba.b, rgba.a);
                }
                if let Some(ref loc) = program.steps_location {
                    state.gl.uniform_1_f32(Some(loc), t.steps as f32);
                }
                if let Some(ref loc) = program.alpha_cutoff_location {
                    state
                        .gl
                        .uniform_1_f32(Some(loc), t.material3d_fields().alpha_cutoff);
                }
            } else {
                if let Some(ref loc) = program.base_color_location {
                    state.gl.uniform_4_f32(Some(loc), 1.0, 1.0, 1.0, 1.0);
                }
                if let Some(ref loc) = program.steps_location {
                    state.gl.uniform_1_f32(Some(loc), 3.0);
                }
                if let Some(ref loc) = program.alpha_cutoff_location {
                    state.gl.uniform_1_f32(Some(loc), 0.5);
                }
            }
        }
    }

    fn draw(
        &self,
        state: &GlRenderState,
        _proxy: &RenderProxy<GlRenderState>,
        _geometry: &MeshGeometry,
    ) {
        let active = get_gl_scene3d_runtime(state, |rt| rt.active_mesh_program);
        if active.is_none() {
            return;
        }
    }
}

pub fn register_gl_toon_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        TOON_MATERIAL_KIND.to_string(),
        Arc::new(GlToonMeshMaterialRenderer),
    );
}
