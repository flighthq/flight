use std::sync::Arc;

use flight_camera::Camera3D;
use flight_materials::{Material3D, NormalMaterial, NORMAL_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_debug_prelude::ensure_gl_debug_program;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlDebugDefineKey, GlDebugMode, GlMeshMaterialRenderer, Scene3DLightBlock};

pub struct GlNormalMeshMaterialRenderer;

impl GlMeshMaterialRenderer for GlNormalMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        _light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let normal = material.as_any().downcast_ref::<NormalMaterial>();
        let has_normal_map = normal.map_or(false, |n| n.normal_map.is_some());
        let define_key = GlDebugDefineKey {
            has_instanced: false,
            has_normal_map,
            has_skin: false,
            mode: GlDebugMode::Normal,
        };
        let program = ensure_gl_debug_program(state, &define_key);
        let double_sided = normal.map_or(false, |n| n.material3d_fields().double_sided);
        begin_gl_mesh_draw(state, &program.base, double_sided);
        set_gl_mesh_view_projection(state, program.base.view_projection_location.clone(), camera);

        let normal_scale = normal.map_or(1.0, |n| n.normal_scale);
        unsafe {
            if let Some(ref loc) = program.normal_scale_location {
                state.gl.uniform_1_f32(Some(loc), normal_scale);
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

pub fn register_gl_normal_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        NORMAL_MATERIAL_KIND.to_string(),
        Arc::new(GlNormalMeshMaterialRenderer),
    );
}
