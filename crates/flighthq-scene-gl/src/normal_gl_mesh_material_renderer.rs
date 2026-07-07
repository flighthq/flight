//! The built-in Normal forward renderer.
//!
//! Ports `@flighthq/scene-gl` `normalGlMeshMaterialRenderer.ts`. A lighting-
//! independent debug/utility pass material: `bind` selects the debug program in
//! normal mode (with the normal-map variant when the material binds one), uploads
//! the camera view-projection, and binds the optional tangent-space normal map plus
//! its scale. The fragment stage encodes the WORLD-space normal as `n * 0.5 + 0.5`
//! LINEAR color. Lights are ignored.

use flighthq_materials::unlit_materials::normal_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::gl_debug_prelude::{
    GlDebugDefineKey, GlDebugMode, bind_gl_debug_normal_map, ensure_gl_debug_program,
};
use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_view_projection,
};
use crate::gl_pbr_standard_bind::{bind_gl_pbr_standard_texture, is_gl_texture_ready};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in Normal renderer.
pub struct NormalGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for NormalGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let normal = material.and_then(|m| m.as_normal());
        let has_normal_map = normal.is_some_and(|n| is_gl_texture_ready(n.normal_map.as_ref()));
        let key = GlDebugDefineKey {
            has_normal_map,
            mode: GlDebugMode::Normal,
        };
        let program = ensure_gl_debug_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.base,
            normal.is_some_and(|n| n.double_sided),
        );
        set_gl_mesh_view_projection(&state.gl, program.base.loc_view_projection.as_ref(), camera);

        let normal_scale = normal.map_or(1.0, |n| n.normal_scale);
        bind_gl_debug_normal_map(state, &program, normal_scale);
        bind_gl_pbr_standard_texture(
            state,
            normal.and_then(|n| n.normal_map.as_ref()),
            program.loc_normal_map.as_ref(),
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

/// Registers the built-in Normal renderer for `NormalMaterialKind`.
pub fn register_normal_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        normal_material_kind(),
        Box::new(NormalGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::unlit_materials::normal_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_normal_gl_material

    #[test]
    fn register_normal_gl_material_registers_for_the_normal_kind() {
        let mut scene = create_gl_scene_runtime();
        register_normal_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, normal_material_kind()).is_some());
    }
}
