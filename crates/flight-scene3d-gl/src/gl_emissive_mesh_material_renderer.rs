use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{EmissiveMaterial, Material3D, MaterialAlphaMode, EMISSIVE_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_unlit_prelude::ensure_gl_unlit_program;
use crate::types::{GlMeshMaterialRenderer, GlUnlitDefineKey, Scene3DLightBlock};

pub struct GlEmissiveMeshMaterialRenderer;

pub fn register_gl_emissive_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        EMISSIVE_MATERIAL_KIND.to_string(),
        Arc::new(GlEmissiveMeshMaterialRenderer),
    );
}

impl GlMeshMaterialRenderer for GlEmissiveMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        _light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let emissive = material.as_any().downcast_ref::<EmissiveMaterial>();
        let define_key = GlUnlitDefineKey {
            alpha_mask_enabled: emissive.map_or(false, |e| {
                e.material3d_fields().alpha_mode == MaterialAlphaMode::Mask
            }),
            has_color_map: emissive.map_or(false, |e| e.emissive_map.is_some()),
            has_instanced: false,
            has_skin: false,
            has_uv_transform: false,
            vertex_color: false,
        };
        let program = ensure_gl_unlit_program(state, &define_key);
        let double_sided = emissive.map_or(false, |e| e.material3d_fields().double_sided);
        begin_gl_mesh_draw(state, &program.base, double_sided);
        set_gl_mesh_view_projection(state, program.base.view_projection_location.clone(), camera);

        unsafe {
            if let Some(e) = emissive {
                let mut rgba = allocate_linear_color();
                unpack_color_to_linear(&mut rgba, e.emissive);
                if let Some(ref loc) = program.color_location {
                    state.gl.uniform_4_f32(Some(loc), rgba.r, rgba.g, rgba.b, rgba.a);
                }
                if let Some(ref loc) = program.intensity_location {
                    state.gl.uniform_1_f32(Some(loc), e.emissive_strength);
                }
                if let Some(ref loc) = program.alpha_cutoff_location {
                    state.gl.uniform_1_f32(Some(loc), e.material3d_fields().alpha_cutoff);
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
