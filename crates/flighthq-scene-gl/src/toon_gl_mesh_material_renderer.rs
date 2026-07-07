//! The built-in Toon (cel-shading) forward-lit renderer.
//!
//! Ports `@flighthq/scene-gl` `toonGlMeshMaterialRenderer.ts`. `bind` selects the
//! uber-shader variant for the material's base-color map / ramp / alpha mode,
//! uploads the shared per-run uniforms (camera view-projection + position, the
//! packed light block), and the material's base color, step count, cutoff, and
//! textures. The diffuse N·L is quantized into stepped cel bands in the fragment
//! stage; output is LINEAR color for the rgba16f scene target.

use flighthq_materials::unlit_materials::toon_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

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
use crate::gl_toon_prelude::{GlToonDefineKey, ensure_gl_toon_program};

/// The built-in Toon renderer.
pub struct ToonGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for ToonGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let toon = material.and_then(|m| m.as_toon());
        let key = GlToonDefineKey {
            alpha_mask_enabled: toon.is_some_and(|t| t.alpha_mode == MaterialAlphaMode::Mask),
            has_base_color_map: toon
                .is_some_and(|t| is_gl_texture_ready(t.base_color_map.as_ref())),
            has_ramp: toon.is_some_and(|t| is_gl_texture_ready(t.ramp.as_ref())),
        };
        let program = ensure_gl_toon_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.lit.base,
            toon.is_some_and(|t| t.double_sided),
        );
        set_gl_mesh_view_projection(
            &state.gl,
            program.lit.base.loc_view_projection.as_ref(),
            camera,
        );
        set_gl_mesh_camera_position(&state.gl, program.lit.loc_camera_position.as_ref(), camera);
        bind_gl_mesh_light_block(state, scene, &program.lit, lights);

        match toon {
            None => unsafe {
                state
                    .gl
                    .uniform_4_f32(program.loc_base_color.as_ref(), 1.0, 1.0, 1.0, 1.0);
                state.gl.uniform_1_f32(program.loc_steps.as_ref(), 3.0);
                state
                    .gl
                    .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), 0.5);
            },
            Some(t) => {
                let base_color = unpack_color_to_linear(t.base_color);
                unsafe {
                    state.gl.uniform_4_f32(
                        program.loc_base_color.as_ref(),
                        base_color[0],
                        base_color[1],
                        base_color[2],
                        base_color[3],
                    );
                    state
                        .gl
                        .uniform_1_f32(program.loc_steps.as_ref(), t.steps as f32);
                    state
                        .gl
                        .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), t.alpha_cutoff);
                }
                bind_gl_pbr_standard_texture(
                    state,
                    t.base_color_map.as_ref(),
                    program.loc_base_color_map.as_ref(),
                    0,
                );
                bind_gl_pbr_standard_texture(state, t.ramp.as_ref(), program.loc_ramp.as_ref(), 1);
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

/// Registers the built-in Toon renderer for `ToonMaterialKind`.
pub fn register_toon_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        toon_material_kind(),
        Box::new(ToonGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::unlit_materials::toon_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_toon_gl_material

    #[test]
    fn register_toon_gl_material_registers_for_the_toon_kind() {
        let mut scene = create_gl_scene_runtime();
        register_toon_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, toon_material_kind()).is_some());
    }
}
