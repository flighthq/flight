//! The built-in classic Phong forward-lit renderer.
//!
//! Ports `@flighthq/scene-gl` `phongGlMeshMaterialRenderer.ts`. Lambert diffuse
//! plus a reflection-vector specular lobe: `bind` selects the classic uber-shader's
//! `phong` variant for the material's diffuse / specular / normal maps and alpha
//! mode, uploads the camera view-projection AND position (the specular term is
//! view-dependent), the packed light block, and the material's linear diffuse +
//! specular colors, shininess, and maps.

use flighthq_materials::classic_materials::phong_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

use crate::gl_classic_prelude::{
    GlClassicDefineKey, GlClassicLightingModel, ensure_gl_classic_program,
};
use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_camera_position,
    set_gl_mesh_view_projection,
};
use crate::gl_pbr_standard_bind::{
    bind_gl_pbr_standard_texture, is_gl_texture_ready, unpack_color_to_linear,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in Phong renderer.
pub struct PhongGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for PhongGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let phong = material.and_then(|m| m.as_phong());
        let key = GlClassicDefineKey {
            alpha_mask_enabled: phong.is_some_and(|p| p.alpha_mode == MaterialAlphaMode::Mask),
            has_diffuse_map: phong.is_some_and(|p| is_gl_texture_ready(p.diffuse_map.as_ref())),
            has_normal_map: phong.is_some_and(|p| is_gl_texture_ready(p.normal_map.as_ref())),
            has_specular_map: phong.is_some_and(|p| is_gl_texture_ready(p.specular_map.as_ref())),
            lighting_model: GlClassicLightingModel::Phong,
        };
        let program = ensure_gl_classic_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.lit.base,
            phong.is_some_and(|p| p.double_sided),
        );
        set_gl_mesh_view_projection(
            &state.gl,
            program.lit.base.loc_view_projection.as_ref(),
            camera,
        );
        set_gl_mesh_camera_position(&state.gl, program.lit.loc_camera_position.as_ref(), camera);
        bind_gl_mesh_light_block(state, scene, &program.lit, lights);

        match phong {
            None => unsafe {
                state
                    .gl
                    .uniform_4_f32(program.loc_diffuse.as_ref(), 1.0, 1.0, 1.0, 1.0);
                state
                    .gl
                    .uniform_4_f32(program.loc_specular.as_ref(), 1.0, 1.0, 1.0, 1.0);
                state.gl.uniform_1_f32(program.loc_shininess.as_ref(), 32.0);
                state
                    .gl
                    .uniform_1_f32(program.loc_normal_scale.as_ref(), 1.0);
                state
                    .gl
                    .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), 0.5);
            },
            Some(p) => {
                let diffuse = unpack_color_to_linear(p.diffuse);
                let specular = unpack_color_to_linear(p.specular);
                unsafe {
                    state.gl.uniform_4_f32(
                        program.loc_diffuse.as_ref(),
                        diffuse[0],
                        diffuse[1],
                        diffuse[2],
                        diffuse[3],
                    );
                    state.gl.uniform_4_f32(
                        program.loc_specular.as_ref(),
                        specular[0],
                        specular[1],
                        specular[2],
                        specular[3],
                    );
                    state
                        .gl
                        .uniform_1_f32(program.loc_shininess.as_ref(), p.shininess);
                    state
                        .gl
                        .uniform_1_f32(program.loc_normal_scale.as_ref(), p.normal_scale);
                    state
                        .gl
                        .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), p.alpha_cutoff);
                }
                bind_gl_pbr_standard_texture(
                    state,
                    p.diffuse_map.as_ref(),
                    program.loc_diffuse_map.as_ref(),
                    0,
                );
                bind_gl_pbr_standard_texture(
                    state,
                    p.specular_map.as_ref(),
                    program.loc_specular_map.as_ref(),
                    1,
                );
                bind_gl_pbr_standard_texture(
                    state,
                    p.normal_map.as_ref(),
                    program.loc_normal_map.as_ref(),
                    2,
                );
            }
        }
    }

    fn draw(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &GlMeshUpload,
    ) {
        draw_gl_mesh_subset(state, scene, proxy, upload);
    }
}

/// Registers the built-in Phong renderer for `PhongMaterialKind`.
pub fn register_phong_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        phong_material_kind(),
        Box::new(PhongGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::classic_materials::phong_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_phong_gl_material

    #[test]
    fn register_phong_gl_material_registers_for_the_phong_kind() {
        let mut scene = create_gl_scene_runtime();
        register_phong_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, phong_material_kind()).is_some());
    }
}
