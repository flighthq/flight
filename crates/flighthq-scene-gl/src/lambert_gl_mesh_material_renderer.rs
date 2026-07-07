//! The built-in lambert forward renderer.
//!
//! Ports `@flighthq/scene-gl` `lambertGlMeshMaterialRenderer.ts`.

use flighthq_materials::classic_materials::lambert_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in lambert renderer.
pub struct LambertGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for LambertGlMeshMaterialRenderer {
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

/// Registers the built-in lambert renderer.
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
