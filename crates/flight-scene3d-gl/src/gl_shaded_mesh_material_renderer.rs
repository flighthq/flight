use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{Material3D, MaterialAlphaMode};
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
use crate::gl_shaded_prelude::{ensure_gl_shaded_program, FLAG_HAS_ALPHA_MASK};
use crate::types::{GlMeshMaterialRenderer, GlShadedDefineKey, Scene3DLightBlock};

pub const SHADED_MATERIAL_KIND: &str = "ShadedMaterial";

pub struct GlShadedMeshMaterialRenderer;

pub fn register_gl_shaded_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        SHADED_MATERIAL_KIND.to_string(),
        Arc::new(GlShadedMeshMaterialRenderer),
    );
}

impl GlMeshMaterialRenderer for GlShadedMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let fields = material.material3d_fields();
        let mut base_flags: u32 = 0;
        if fields.alpha_mode == MaterialAlphaMode::Mask {
            base_flags |= FLAG_HAS_ALPHA_MASK;
        }
        let define_key = GlShadedDefineKey {
            base_flags,
            modifier_define_key: String::new(),
        };
        let program = ensure_gl_shaded_program(state, &define_key);
        begin_gl_mesh_draw(state, &program.lit.base, fields.double_sided);
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
            if let Some(ref loc) = program.time_location {
                let time = get_gl_scene3d_runtime(state, |rt| rt.time);
                state.gl.uniform_1_f32(Some(loc), time);
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
