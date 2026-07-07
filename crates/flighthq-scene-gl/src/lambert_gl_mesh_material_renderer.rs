//! The built-in classic Lambert forward-lit renderer.
//!
//! Ports `@flighthq/scene-gl` `lambertGlMeshMaterialRenderer.ts`. Diffuse-only
//! Lambertian shading: `bind` selects the classic uber-shader's `lambert` variant
//! for the material's diffuse map / alpha mode, uploads the camera view-projection
//! and the packed light block, and the material's linear diffuse color. Lambert has
//! no view-dependent term, so it skips the camera position; the shared classic
//! prelude compiles out the specular branch for the `lambert` model.

use flighthq_materials::classic_materials::lambert_material_kind;
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
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_view_projection,
};
use crate::gl_pbr_standard_bind::{
    bind_gl_pbr_standard_texture, is_gl_texture_ready, unpack_color_to_linear,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in Lambert renderer.
pub struct LambertGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for LambertGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let lambert = material.and_then(|m| m.as_lambert());
        let key = GlClassicDefineKey {
            alpha_mask_enabled: lambert.is_some_and(|l| l.alpha_mode == MaterialAlphaMode::Mask),
            has_diffuse_map: lambert.is_some_and(|l| is_gl_texture_ready(l.diffuse_map.as_ref())),
            has_normal_map: false,
            has_specular_map: false,
            lighting_model: GlClassicLightingModel::Lambert,
        };
        let program = ensure_gl_classic_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.lit.base,
            lambert.is_some_and(|l| l.double_sided),
        );
        set_gl_mesh_view_projection(
            &state.gl,
            program.lit.base.loc_view_projection.as_ref(),
            camera,
        );
        bind_gl_mesh_light_block(state, scene, &program.lit, lights);

        let (diffuse, alpha_cutoff) = match lambert {
            None => ([1.0, 1.0, 1.0, 1.0], 0.5),
            Some(l) => (unpack_color_to_linear(l.diffuse), l.alpha_cutoff),
        };
        unsafe {
            state.gl.uniform_4_f32(
                program.loc_diffuse.as_ref(),
                diffuse[0],
                diffuse[1],
                diffuse[2],
                diffuse[3],
            );
            state
                .gl
                .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff);
        }
        bind_gl_pbr_standard_texture(
            state,
            lambert.and_then(|l| l.diffuse_map.as_ref()),
            program.loc_diffuse_map.as_ref(),
            0,
        );
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

/// Registers the built-in Lambert renderer for `LambertMaterialKind`.
pub fn register_lambert_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        lambert_material_kind(),
        Box::new(LambertGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::classic_materials::lambert_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_lambert_gl_material

    #[test]
    fn register_lambert_gl_material_registers_for_the_lambert_kind() {
        let mut scene = create_gl_scene_runtime();
        register_lambert_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, lambert_material_kind()).is_some());
    }
}
