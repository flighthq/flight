use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{MatcapMaterial, Material3D, MaterialAlphaMode, MATCAP_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_matcap_prelude::ensure_gl_matcap_program;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{begin_gl_mesh_draw, set_gl_mesh_view_projection};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMatcapDefineKey, GlMeshMaterialRenderer, Scene3DLightBlock};

pub struct GlMatcapMeshMaterialRenderer;

pub fn register_gl_matcap_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        MATCAP_MATERIAL_KIND.to_string(),
        Arc::new(GlMatcapMeshMaterialRenderer),
    );
}

impl GlMeshMaterialRenderer for GlMatcapMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        _light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let matcap = material.as_any().downcast_ref::<MatcapMaterial>();
        let define_key = GlMatcapDefineKey {
            alpha_mask_enabled: matcap.map_or(false, |m| {
                m.material3d_fields().alpha_mode == MaterialAlphaMode::Mask
            }),
            has_instanced: false,
            has_matcap: matcap.map_or(false, |m| m.matcap.is_some()),
            has_skin: false,
        };
        let program = ensure_gl_matcap_program(state, &define_key);
        let double_sided = matcap.map_or(false, |m| m.material3d_fields().double_sided);
        begin_gl_mesh_draw(state, &program.base, double_sided);
        set_gl_mesh_view_projection(state, program.base.view_projection_location.clone(), camera);

        unsafe {
            if let Some(ref loc) = program.view_location {
                state
                    .gl
                    .uniform_matrix_4_f32_slice(Some(loc), false, &camera.view.read().unwrap().m);
            }
        }

        unsafe {
            if let Some(m) = matcap {
                let mut rgba = allocate_linear_color();
                unpack_color_to_linear(&mut rgba, m.tint);
                if let Some(ref loc) = program.tint_location {
                    state
                        .gl
                        .uniform_4_f32(Some(loc), rgba.r, rgba.g, rgba.b, rgba.a);
                }
                if let Some(ref loc) = program.alpha_cutoff_location {
                    state
                        .gl
                        .uniform_1_f32(Some(loc), m.material3d_fields().alpha_cutoff);
                }
            } else {
                if let Some(ref loc) = program.tint_location {
                    state.gl.uniform_4_f32(Some(loc), 1.0, 1.0, 1.0, 1.0);
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
