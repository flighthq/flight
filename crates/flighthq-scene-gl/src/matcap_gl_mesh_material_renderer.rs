//! The built-in Matcap forward renderer.
//!
//! Ports `@flighthq/scene-gl` `matcapGlMeshMaterialRenderer.ts`. Lighting-
//! independent material-capture shading: `bind` selects the matcap variant for the
//! material's matcap texture / alpha mode, uploads the camera view-projection plus
//! the camera view matrix (`u_view`, which the vertex stage uses to rotate the
//! world-space normal into view space), and the linear tint. Lights are ignored —
//! the matcap texture is the prebaked lighting.

use flighthq_materials::unlit_materials::matcap_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

use crate::gl_matcap_prelude::{
    GlMatcapDefineKey, bind_gl_matcap_surface, ensure_gl_matcap_program,
};
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

/// The built-in Matcap renderer.
pub struct MatcapGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for MatcapGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let matcap = material.and_then(|m| m.as_matcap());
        let key = GlMatcapDefineKey {
            alpha_mask_enabled: matcap.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
            has_matcap: matcap.is_some_and(|m| is_gl_texture_ready(m.matcap.as_ref())),
        };
        let program = ensure_gl_matcap_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.base,
            matcap.is_some_and(|m| m.double_sided),
        );
        set_gl_mesh_view_projection(&state.gl, program.base.loc_view_projection.as_ref(), camera);
        // u_view rotates the world-space normal into view space for the matcap
        // lookup.
        unsafe {
            state
                .gl
                .uniform_matrix_4_f32_slice(program.loc_view.as_ref(), false, &camera.view.m);
        }

        let (tint, alpha_cutoff) = match matcap {
            None => ([1.0, 1.0, 1.0, 1.0], 0.5),
            Some(m) => (unpack_color_to_linear(m.tint), m.alpha_cutoff),
        };
        bind_gl_matcap_surface(state, &program, &tint, alpha_cutoff);
        bind_gl_pbr_standard_texture(
            state,
            matcap.and_then(|m| m.matcap.as_ref()),
            program.loc_matcap.as_ref(),
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

/// Registers the built-in Matcap renderer for `MatcapMaterialKind`.
pub fn register_matcap_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        matcap_material_kind(),
        Box::new(MatcapGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::unlit_materials::matcap_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_matcap_gl_material

    #[test]
    fn register_matcap_gl_material_registers_for_the_matcap_kind() {
        let mut scene = create_gl_scene_runtime();
        register_matcap_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, matcap_material_kind()).is_some());
    }
}
