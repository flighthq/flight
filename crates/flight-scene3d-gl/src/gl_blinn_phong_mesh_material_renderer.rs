use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{
    BlinnPhongMaterial, Material3D, MaterialAlphaMode, BLINN_PHONG_MATERIAL_KIND,
};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_classic_prelude::ensure_gl_classic_program;
use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, set_gl_mesh_camera_position, set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{
    GlClassicDefineKey, GlClassicLightingModel, GlMeshMaterialRenderer, Scene3DLightBlock,
};

pub struct GlBlinnPhongMeshMaterialRenderer;

pub fn register_gl_blinn_phong_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        BLINN_PHONG_MATERIAL_KIND.to_string(),
        Arc::new(GlBlinnPhongMeshMaterialRenderer),
    );
}

impl GlMeshMaterialRenderer for GlBlinnPhongMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let bp = material.as_any().downcast_ref::<BlinnPhongMaterial>();
        let define_key = GlClassicDefineKey {
            alpha_mask_enabled: bp.map_or(false, |b| {
                b.material3d_fields().alpha_mode == MaterialAlphaMode::Mask
            }),
            has_alpha_map: false,
            has_color_adjustment: false,
            has_color_matrix: false,
            has_diffuse_map: bp.map_or(false, |b| b.diffuse_map.is_some()),
            has_instanced: false,
            has_normal_map: bp.map_or(false, |b| b.normal_map.is_some()),
            has_skin: false,
            has_specular_map: bp.map_or(false, |b| b.specular_map.is_some()),
            has_uv_transform: false,
            lighting_model: GlClassicLightingModel::BlinnPhong,
        };
        let program = ensure_gl_classic_program(state, &define_key);
        let double_sided = bp.map_or(false, |b| b.material3d_fields().double_sided);
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
            if let Some(b) = bp {
                let mut rgba = allocate_linear_color();
                unpack_color_to_linear(&mut rgba, b.diffuse);
                if let Some(ref loc) = program.diffuse_color_location {
                    state
                        .gl
                        .uniform_4_f32(Some(loc), rgba.r, rgba.g, rgba.b, rgba.a);
                }
                unpack_color_to_linear(&mut rgba, b.specular);
                if let Some(ref loc) = program.specular_color_location {
                    state
                        .gl
                        .uniform_4_f32(Some(loc), rgba.r, rgba.g, rgba.b, rgba.a);
                }
                if let Some(ref loc) = program.shininess_location {
                    state.gl.uniform_1_f32(Some(loc), b.shininess);
                }
                if let Some(ref loc) = program.normal_scale_location {
                    state.gl.uniform_1_f32(Some(loc), b.normal_scale);
                }
                if let Some(ref loc) = program.alpha_cutoff_location {
                    state
                        .gl
                        .uniform_1_f32(Some(loc), b.material3d_fields().alpha_cutoff);
                }
            } else {
                if let Some(ref loc) = program.diffuse_color_location {
                    state.gl.uniform_4_f32(Some(loc), 1.0, 1.0, 1.0, 1.0);
                }
                if let Some(ref loc) = program.specular_color_location {
                    state.gl.uniform_4_f32(Some(loc), 1.0, 1.0, 1.0, 1.0);
                }
                if let Some(ref loc) = program.shininess_location {
                    state.gl.uniform_1_f32(Some(loc), 32.0);
                }
                if let Some(ref loc) = program.normal_scale_location {
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
