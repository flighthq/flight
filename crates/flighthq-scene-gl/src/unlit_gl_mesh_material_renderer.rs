//! The built-in Unlit forward renderer.
//!
//! Ports `@flighthq/scene-gl` `unlitGlMeshMaterialRenderer.ts`. Lighting-
//! independent flat color: `bind` selects the unlit variant for the material's
//! base-color map / alpha mode, uploads the camera view-projection and the linear
//! base color, and `draw` issues the indexed draw. Lights are ignored.

use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use flighthq_materials::unlit_materials::unlit_material_kind;

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

/// The built-in Unlit renderer.
pub struct UnlitGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for UnlitGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let unlit = material.and_then(|m| m.as_unlit());
        let key = GlUnlitDefineKey {
            alpha_mask_enabled: unlit.is_some_and(|u| u.alpha_mode == MaterialAlphaMode::Mask),
            has_color_map: unlit.is_some_and(|u| is_gl_texture_ready(u.base_color_map.as_ref())),
            vertex_color: false,
        };
        let program = ensure_gl_unlit_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.base,
            unlit.is_some_and(|u| u.double_sided),
        );
        set_gl_mesh_view_projection(&state.gl, program.base.loc_view_projection.as_ref(), camera);

        let (color, alpha_cutoff) = match unlit {
            None => ([1.0, 1.0, 1.0, 1.0], 0.5),
            Some(u) => (unpack_color_to_linear(u.base_color), u.alpha_cutoff),
        };
        bind_gl_unlit_surface(state, &program, &color, 1.0, alpha_cutoff);
        bind_gl_pbr_standard_texture(
            state,
            unlit.and_then(|u| u.base_color_map.as_ref()),
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

/// Registers the built-in Unlit renderer for `UnlitMaterialKind`.
pub fn register_unlit_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        unlit_material_kind(),
        Box::new(UnlitGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::unlit_materials::unlit_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_unlit_gl_material

    #[test]
    fn register_unlit_gl_material_registers_for_the_unlit_kind() {
        let mut scene = create_gl_scene_runtime();
        register_unlit_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, unlit_material_kind()).is_some());
    }
}
