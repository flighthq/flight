use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_materials::{
    ExtendedPbrMaterial, Material3D, MaterialAlphaMode, EXTENDED_PBR_MATERIAL_KIND,
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
use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::types::{GlMeshMaterialRenderer, GlPbrDefineKey, Scene3DLightBlock};

pub struct GlExtendedPbrMeshMaterialRenderer;

pub fn register_gl_extended_pbr_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        EXTENDED_PBR_MATERIAL_KIND.to_string(),
        Arc::new(GlExtendedPbrMeshMaterialRenderer),
    );
}

impl GlMeshMaterialRenderer for GlExtendedPbrMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let extended = material.as_any().downcast_ref::<ExtendedPbrMaterial>();
        let ext = match extended {
            Some(e) => e,
            None => {
                get_gl_scene3d_runtime_mut(state, |rt| {
                    rt.active_mesh_program = None;
                });
                return;
            }
        };
        let std_props = &ext.standard;
        let define_key = GlPbrDefineKey {
            alpha_mask_enabled: ext.material3d_fields().alpha_mode == MaterialAlphaMode::Mask,
            has_alpha_map: false,
            has_base_color_map: std_props.base_color_map.is_some(),
            has_color_adjustment: false,
            has_color_matrix: false,
            has_emissive_map: std_props.emissive_map.is_some(),
            has_instanced: false,
            has_metallic_roughness_map: std_props.metallic_roughness_map.is_some(),
            has_normal_map: std_props.normal_map.is_some(),
            has_occlusion_map: std_props.occlusion_map.is_some(),
            has_skin: false,
            has_uv_transform: false,
            has_ibl: get_gl_scene3d_runtime(state, |rt| rt.ibl.is_some()),
            has_shadow: get_gl_scene3d_runtime(state, |rt| rt.shadow.is_some()),
            extension_define_key: String::new(),
            modifier_define_key: String::new(),
        };
        let program = ensure_gl_pbr_program(state, &define_key, "", "");
        let double_sided = ext.material3d_fields().double_sided;
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

        let mut rgba = allocate_linear_color();
        unpack_color_to_linear(&mut rgba, std_props.base_color);
        let mut emissive_rgb = allocate_linear_color();
        unpack_color_to_linear(&mut emissive_rgb, std_props.emissive);
        bind_gl_pbr_standard_block(
            state,
            &program,
            light_block,
            &[rgba.r, rgba.g, rgba.b, rgba.a],
            std_props.metallic,
            std_props.roughness,
            &[emissive_rgb.r, emissive_rgb.g, emissive_rgb.b],
            std_props.emissive_strength,
            std_props.normal_scale,
            std_props.occlusion_strength,
            ext.material3d_fields().alpha_cutoff,
        );
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
