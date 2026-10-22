use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{
    Material3D, MaterialAlphaMode, StandardPbrMaterial, STANDARD_PBR_MATERIAL_KIND,
};
use flight_meshgeometry::MeshGeometry;
use flight_render::RenderProxy;
use flight_render_gl::GlRenderState;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, set_gl_mesh_camera_position, set_gl_mesh_view_projection,
};
use crate::gl_pbr_prelude::ensure_gl_pbr_program;
use crate::gl_pbr_standard_block::bind_gl_pbr_standard_block;
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMeshMaterialRenderer, GlPbrDefineKey, Scene3DLightBlock};

pub struct GlStandardPbrMeshMaterialRenderer;

pub fn register_gl_standard_pbr_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        STANDARD_PBR_MATERIAL_KIND.to_string(),
        Arc::new(GlStandardPbrMeshMaterialRenderer),
    );
}

impl GlMeshMaterialRenderer for GlStandardPbrMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let pbr = material.as_any().downcast_ref::<StandardPbrMaterial>();
        let define_key = GlPbrDefineKey {
            alpha_mask_enabled: pbr.map_or(false, |p| {
                p.material3d_fields().alpha_mode == MaterialAlphaMode::Mask
            }),
            has_alpha_map: pbr.map_or(false, |p| p.alpha_map.is_some()),
            has_base_color_map: pbr.map_or(false, |p| p.base_color_map.is_some()),
            has_color_adjustment: false,
            has_color_matrix: false,
            has_emissive_map: pbr.map_or(false, |p| p.emissive_map.is_some()),
            has_instanced: false,
            has_metallic_roughness_map: pbr.map_or(false, |p| p.metallic_roughness_map.is_some()),
            has_normal_map: pbr.map_or(false, |p| p.normal_map.is_some()),
            has_occlusion_map: pbr.map_or(false, |p| p.occlusion_map.is_some()),
            has_skin: false,
            has_uv_transform: false,
            has_ibl: get_gl_scene3d_runtime(state, |rt| rt.ibl.is_some()),
            has_shadow: get_gl_scene3d_runtime(state, |rt| rt.shadow.is_some()),
            extension_define_key: String::new(),
            modifier_define_key: String::new(),
        };
        let program = ensure_gl_pbr_program(state, &define_key, "", "");
        let double_sided = pbr.map_or(false, |p| p.material3d_fields().double_sided);
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

        if let Some(p) = pbr {
            let mut rgba = allocate_linear_color();
            unpack_color_to_linear(&mut rgba, p.base_color);
            let mut emissive_rgb = allocate_linear_color();
            unpack_color_to_linear(&mut emissive_rgb, p.emissive);
            bind_gl_pbr_standard_block(
                state,
                &program,
                light_block,
                &[rgba.r, rgba.g, rgba.b, rgba.a],
                p.metallic,
                p.roughness,
                &[emissive_rgb.r, emissive_rgb.g, emissive_rgb.b],
                p.emissive_strength,
                p.normal_scale,
                p.occlusion_strength,
                p.material3d_fields().alpha_cutoff,
            );
        } else {
            bind_gl_pbr_standard_block(
                state,
                &program,
                light_block,
                &[1.0, 1.0, 1.0, 1.0],
                0.0,
                0.5,
                &[0.0, 0.0, 0.0],
                1.0,
                1.0,
                1.0,
                0.5,
            );
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
