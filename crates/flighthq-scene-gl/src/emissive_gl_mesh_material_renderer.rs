//! The built-in Emissive forward renderer.
//!
//! Ports `@flighthq/scene-gl` `emissiveGlMeshMaterialRenderer.ts`. Self-
//! illuminating and lighting-independent: `bind` selects the unlit variant for the
//! emissive map / alpha mode and uploads the linear emissive color scaled by
//! `emissive_strength` (values > 1 drive bloom over the rgba16f scene target).
//! Lights are ignored.

use flighthq_materials::unlit_materials::emissive_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

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
use crate::gl_unlit_prelude::{GlUnlitDefineKey, bind_gl_unlit_surface, ensure_gl_unlit_program};

/// The built-in Emissive renderer.
pub struct EmissiveGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for EmissiveGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let emissive = material.and_then(|m| m.as_emissive());
        let key = GlUnlitDefineKey {
            alpha_mask_enabled: emissive.is_some_and(|e| e.alpha_mode == MaterialAlphaMode::Mask),
            has_color_map: emissive.is_some_and(|e| is_gl_texture_ready(e.emissive_map.as_ref())),
            vertex_color: false,
        };
        let program = ensure_gl_unlit_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.base,
            emissive.is_some_and(|e| e.double_sided),
        );
        set_gl_mesh_view_projection(&state.gl, program.base.loc_view_projection.as_ref(), camera);

        let (color, intensity, alpha_cutoff) = match emissive {
            None => ([1.0, 1.0, 1.0, 1.0], 1.0, 0.5),
            Some(e) => (
                unpack_color_to_linear(e.emissive),
                e.emissive_strength,
                e.alpha_cutoff,
            ),
        };
        bind_gl_unlit_surface(state, &program, &color, intensity, alpha_cutoff);
        bind_gl_pbr_standard_texture(
            state,
            emissive.and_then(|e| e.emissive_map.as_ref()),
            program.loc_color_map.as_ref(),
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

/// Registers the built-in Emissive renderer for `EmissiveMaterialKind`.
pub fn register_emissive_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        emissive_material_kind(),
        Box::new(EmissiveGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::unlit_materials::emissive_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_emissive_gl_material

    #[test]
    fn register_emissive_gl_material_registers_for_the_emissive_kind() {
        let mut scene = create_gl_scene_runtime();
        register_emissive_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, emissive_material_kind()).is_some());
    }
}
