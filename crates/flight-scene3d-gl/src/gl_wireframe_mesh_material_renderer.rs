use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{Material3D, MaterialAlphaMode, WireframeMaterial, WIREFRAME_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_wireframe_prelude::ensure_gl_wireframe_program;
use crate::types::{GlMeshMaterialRenderer, Scene3DLightBlock};

pub struct GlWireframeMeshMaterialRenderer;

impl GlMeshMaterialRenderer for GlWireframeMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        _light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let wireframe = material.as_any().downcast_ref::<WireframeMaterial>();
        let alpha_mask_enabled = wireframe.map_or(false, |w| {
            w.material3d_fields().alpha_mode == MaterialAlphaMode::Mask
        });
        let program = ensure_gl_wireframe_program(state, alpha_mask_enabled);
        begin_gl_mesh_draw(state, &program.base, true);
        set_gl_mesh_view_projection(state, program.base.view_projection_location.clone(), camera);

        unsafe {
            if let Some(w) = wireframe {
                let mut rgba = allocate_linear_color();
                unpack_color_to_linear(&mut rgba, w.color);
                if let Some(ref loc) = program.color_location {
                    state.gl.uniform_4_f32(Some(loc), rgba.r, rgba.g, rgba.b, rgba.a);
                }
                if alpha_mask_enabled {
                    if let Some(ref loc) = program.alpha_cutoff_location {
                        state.gl.uniform_1_f32(Some(loc), w.material3d_fields().alpha_cutoff);
                    }
                }
            } else {
                if let Some(ref loc) = program.color_location {
                    state.gl.uniform_4_f32(Some(loc), 1.0, 1.0, 1.0, 1.0);
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

pub fn register_gl_wireframe_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        WIREFRAME_MATERIAL_KIND.to_string(),
        Arc::new(GlWireframeMeshMaterialRenderer),
    );
}
