//! The built-in toon forward renderer.
//!
//! Ports `@flighthq/scene-gl` `toonGlMeshMaterialRenderer.ts`.

use flighthq_materials::unlit_materials::toon_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in toon renderer.
pub struct ToonGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for ToonGlMeshMaterialRenderer {
    fn bind(
        &self,
        _state: &mut GlRenderState,
        _scene: &mut GlSceneRuntime,
        _material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        _camera: &Camera,
    ) {
        // Stub: requires the family prelude program + material uniform upload.
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

/// Registers the built-in toon renderer.
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
