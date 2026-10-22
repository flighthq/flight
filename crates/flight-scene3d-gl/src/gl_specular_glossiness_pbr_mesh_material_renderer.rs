use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear, LinearColor};
use flight_materials::{
    Material3D, MaterialAlphaMode, SpecularGlossinessPbrMaterial,
    SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND,
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

const DIELECTRIC_SPECULAR: f32 = 0.04;

pub struct GlSpecularGlossinessPbrMeshMaterialRenderer;

fn convert_specular_glossiness(
    material: &SpecularGlossinessPbrMaterial,
) -> ([f32; 4], f32, f32) {
    let mut diffuse = allocate_linear_color();
    unpack_color_to_linear(&mut diffuse, material.diffuse);
    let mut specular = allocate_linear_color();
    unpack_color_to_linear(&mut specular, material.specular);

    let specular_brightness = specular.r.max(specular.g).max(specular.b);
    let one_minus_specular_strength = 1.0 - specular_brightness;
    let diffuse_brightness = diffuse.r.max(diffuse.g).max(diffuse.b);
    let metallic = solve_metallic(
        diffuse_brightness,
        specular_brightness,
        one_minus_specular_strength,
    );

    let roughness = 1.0 - material.glossiness;
    let denom = (1.0 - DIELECTRIC_SPECULAR).max(1e-4);
    let r = lerp(
        (diffuse.r * one_minus_specular_strength) / denom,
        specular.r,
        metallic,
    );
    let g = lerp(
        (diffuse.g * one_minus_specular_strength) / denom,
        specular.g,
        metallic,
    );
    let b = lerp(
        (diffuse.b * one_minus_specular_strength) / denom,
        specular.b,
        metallic,
    );
    return ([r, g, b, diffuse.a], metallic, roughness);
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    return a + (b - a) * t;
}

pub fn register_gl_specular_glossiness_pbr_material(state: &GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND.to_string(),
        Arc::new(GlSpecularGlossinessPbrMeshMaterialRenderer),
    );
}

fn solve_metallic(diffuse: f32, specular: f32, one_minus_specular_strength: f32) -> f32 {
    if specular < DIELECTRIC_SPECULAR {
        return 0.0;
    }
    let a = DIELECTRIC_SPECULAR;
    let b = (diffuse * one_minus_specular_strength) / (1.0 - DIELECTRIC_SPECULAR) + specular
        - 2.0 * DIELECTRIC_SPECULAR;
    let c = DIELECTRIC_SPECULAR - specular;
    let discriminant = (b * b - 4.0 * a * c).max(0.0);
    return ((-b + discriminant.sqrt()) / (2.0 * a)).clamp(0.0, 1.0);
}

impl GlMeshMaterialRenderer for GlSpecularGlossinessPbrMeshMaterialRenderer {
    fn bind(
        &self,
        state: &GlRenderState,
        material: &dyn Material3D,
        light_block: &Scene3DLightBlock,
        camera: &Camera3D,
    ) {
        let sg = material
            .as_any()
            .downcast_ref::<SpecularGlossinessPbrMaterial>();
        let define_key = GlPbrDefineKey {
            alpha_mask_enabled: sg.map_or(false, |s| {
                s.material3d_fields().alpha_mode == MaterialAlphaMode::Mask
            }),
            has_alpha_map: false,
            has_base_color_map: sg.map_or(false, |s| s.diffuse_map.is_some()),
            has_color_adjustment: false,
            has_color_matrix: false,
            has_emissive_map: sg.map_or(false, |s| s.emissive_map.is_some()),
            has_instanced: false,
            has_metallic_roughness_map: false,
            has_normal_map: sg.map_or(false, |s| s.normal_map.is_some()),
            has_occlusion_map: sg.map_or(false, |s| s.occlusion_map.is_some()),
            has_skin: false,
            has_uv_transform: false,
            has_ibl: get_gl_scene3d_runtime(state, |rt| rt.ibl.is_some()),
            has_shadow: get_gl_scene3d_runtime(state, |rt| rt.shadow.is_some()),
            extension_define_key: String::new(),
            modifier_define_key: String::new(),
        };
        let program = ensure_gl_pbr_program(state, &define_key, "", "");
        let double_sided = sg.map_or(false, |s| s.material3d_fields().double_sided);
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

        if let Some(s) = sg {
            let (base_color, metallic, roughness) = convert_specular_glossiness(s);
            let mut emissive_rgb = allocate_linear_color();
            unpack_color_to_linear(&mut emissive_rgb, s.emissive);
            bind_gl_pbr_standard_block(
                state,
                &program,
                light_block,
                &base_color,
                metallic,
                roughness,
                &[emissive_rgb.r, emissive_rgb.g, emissive_rgb.b],
                s.emissive_strength,
                s.normal_scale,
                s.occlusion_strength,
                s.material3d_fields().alpha_cutoff,
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
