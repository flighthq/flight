//! The built-in blinn phong forward renderer.
//!
//! Ports `@flighthq/scene-gl` `blinn_phongGlMeshMaterialRenderer.ts`.

use flighthq_materials::classic_materials::blinn_phong_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in blinn phong renderer.
pub struct BlinnPhongGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for BlinnPhongGlMeshMaterialRenderer {
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

/// Registers the built-in blinn phong renderer.
pub fn register_blinn_phong_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        blinn_phong_material_kind(),
        Box::new(BlinnPhongGlMeshMaterialRenderer),
    );
}
