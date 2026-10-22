use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{Material3D, MaterialAlphaMode, UnlitMaterial, UNLIT_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_unlit_prelude::ensure_gl_unlit_program;
use crate::types::{GlMeshMaterialRenderer, GlUnlitDefineKey, Scene3DLightBlock};

pub struct GlUnlitMeshMaterialRenderer;

impl GlMeshMaterialRenderer for GlUnlitMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        _light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let unlit = material.as_any().downcast_ref::<UnlitMaterial>();
        let has_color_map = unlit.map_or(false, |u| u.base_color_map.is_some());
        let define_key = GlUnlitDefineKey {
            alpha_mask_enabled: unlit.map_or(false, |u| {
                u.material3d_fields().alpha_mode == MaterialAlphaMode::Mask
            }),
            has_color_map,
            has_instanced: false,
            has_skin: false,
            has_uv_transform: false,
            vertex_color: false,
        };
        let program = ensure_gl_unlit_program(state, &define_key);
        let double_sided = unlit.map_or(false, |u| u.material3d_fields().double_sided);
        begin_gl_mesh_draw(state, &program.base, double_sided);
        set_gl_mesh_view_projection(state, program.base.view_projection_location.clone(), camera);

        unsafe {
            if let Some(u) = unlit {
                let mut rgba = allocate_linear_color();
                unpack_color_to_linear(&mut rgba, u.base_color);
                if let Some(ref loc) = program.color_location {
                    state.gl.uniform_4_f32(Some(loc), rgba.r, rgba.g, rgba.b, rgba.a);
                }
                if let Some(ref loc) = program.intensity_location {
                    state.gl.uniform_1_f32(Some(loc), 1.0);
                }
                if let Some(ref loc) = program.alpha_cutoff_location {
                    state.gl.uniform_1_f32(Some(loc), u.material3d_fields().alpha_cutoff);
                }
            } else {
                if let Some(ref loc) = program.color_location {
                    state.gl.uniform_4_f32(Some(loc), 1.0, 1.0, 1.0, 1.0);
                }
                if let Some(ref loc) = program.intensity_location {
                    state.gl.uniform_1_f32(Some(loc), 1.0);
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

pub fn register_gl_unlit_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        UNLIT_MATERIAL_KIND.to_string(),
        Arc::new(GlUnlitMeshMaterialRenderer),
    );
}
