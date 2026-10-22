use std::sync::Arc;

use flight_camera::Camera3D;
use flight_materials::{DepthMaterial, Material3D, DEPTH_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_debug_prelude::ensure_gl_debug_program;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlDebugDefineKey, GlDebugMode, GlMeshMaterialRenderer, Scene3DLightBlock};

pub struct GlDepthMeshMaterialRenderer;

impl GlMeshMaterialRenderer for GlDepthMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        _light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let depth = material.as_any().downcast_ref::<DepthMaterial>();
        let define_key = GlDebugDefineKey {
            has_instanced: false,
            has_normal_map: false,
            has_skin: false,
            mode: GlDebugMode::Depth,
        };
        let program = ensure_gl_debug_program(state, &define_key);
        let double_sided = depth.map_or(false, |d| d.material3d_fields().double_sided);
        begin_gl_mesh_draw(state, &program.base, double_sided);
        set_gl_mesh_view_projection(state, program.base.view_projection_location.clone(), camera);

        unsafe {
            if let Some(ref loc) = program.view_location {
                state.gl.uniform_matrix_4_f32_slice(Some(loc), false, &camera.view.m);
            }
        }

        let (near, far) = depth.map_or((0.0, 1.0), |d| (d.near, d.far));
        unsafe {
            if let Some(ref loc) = program.near_location {
                state.gl.uniform_1_f32(Some(loc), near);
            }
            if let Some(ref loc) = program.far_location {
                state.gl.uniform_1_f32(Some(loc), far);
            }
        }
    }

    fn draw(
        &self,
        state: &GlRenderState,
        proxy: &RenderProxy<GlRenderState>,
        geometry: &MeshGeometry,
    ) {
        let active = get_gl_scene3d_runtime(state, |rt| rt.active_mesh_program);
        if active.is_none() {
            return;
        }
    }
}

pub fn register_gl_depth_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        DEPTH_MATERIAL_KIND.to_string(),
        Arc::new(GlDepthMeshMaterialRenderer),
    );
}
