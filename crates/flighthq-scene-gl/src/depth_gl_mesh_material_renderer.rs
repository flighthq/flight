//! The built-in Depth forward renderer.
//!
//! Ports `@flighthq/scene-gl` `depthGlMeshMaterialRenderer.ts`. A lighting-
//! independent debug/utility pass material: `bind` selects the debug program in
//! depth mode, uploads the camera view-projection, and sets the material's
//! `[near, far]` linearization range. The fragment stage linearizes window-space
//! depth into eye space and writes it as grayscale LINEAR color. Lights are ignored.

use flighthq_materials::unlit_materials::depth_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::gl_debug_prelude::{
    GlDebugDefineKey, GlDebugMode, bind_gl_debug_range, ensure_gl_debug_program,
};
use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_view_projection,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in Depth renderer.
pub struct DepthGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for DepthGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let depth = material.and_then(|m| m.as_depth());
        let key = GlDebugDefineKey {
            has_normal_map: false,
            mode: GlDebugMode::Depth,
        };
        let program = ensure_gl_debug_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.base,
            depth.is_some_and(|d| d.double_sided),
        );
        set_gl_mesh_view_projection(&state.gl, program.base.loc_view_projection.as_ref(), camera);

        let (near, far) = depth.map_or((0.0, 1.0), |d| (d.near, d.far));
        bind_gl_debug_range(state, &program, near, far);
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

/// Registers the built-in Depth renderer for `DepthMaterialKind`.
pub fn register_depth_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        depth_material_kind(),
        Box::new(DepthGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::unlit_materials::depth_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_depth_gl_material

    #[test]
    fn register_depth_gl_material_registers_for_the_depth_kind() {
        let mut scene = create_gl_scene_runtime();
        register_depth_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, depth_material_kind()).is_some());
    }
}
