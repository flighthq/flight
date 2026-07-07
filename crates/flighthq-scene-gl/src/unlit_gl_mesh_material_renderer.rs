//! The built-in Unlit forward renderer.
//!
//! Ports `@flighthq/scene-gl` `unlitGlMeshMaterialRenderer.ts`.

use flighthq_materials::unlit_materials::unlit_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in Unlit renderer.
pub struct UnlitGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for UnlitGlMeshMaterialRenderer {
    fn bind(
        &self,
        _state: &mut GlRenderState,
        _scene: &mut GlSceneRuntime,
        _material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        _camera: &Camera,
    ) {
        // Stub: requires ensure_gl_unlit_program + begin_gl_mesh_draw +
        // set_gl_mesh_view_projection + bind_gl_unlit_surface.
    }

    fn draw(
        &self,
        _state: &mut GlRenderState,
        _scene: &mut GlSceneRuntime,
        _proxy: &SceneRenderProxy,
        _upload: &GlMeshUpload,
    ) {
        // Stub: requires draw_gl_mesh_subset.
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
