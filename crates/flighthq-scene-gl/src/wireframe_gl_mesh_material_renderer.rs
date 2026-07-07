//! The built-in Wireframe forward renderer.
//!
//! Ports `@flighthq/scene-gl` `wireframeGlMeshMaterialRenderer.ts`. Draws the
//! mesh's triangle edges as GL lines in a single flat linear color. `bind` selects
//! the wireframe program, disables back-face culling (lines have no winding),
//! uploads the camera view-projection, and the line color.
//!
//! TS↔Rust divergence: the TS `draw` binds the derived line-index VAO
//! (`ensureGlWireframeUpload`) and issues a `gl.LINES` draw over the subset's line
//! range. The Rust port cannot yet complete that draw: `ensure_gl_wireframe_upload`
//! is a stub (no derived line-index buffer), and the shared mesh-material `draw`
//! seam supplies only the triangle [`GlMeshUpload`], not the geometry handle the
//! line-index derivation needs. So `draw` here uploads the per-draw model matrix
//! (real) but issues no line draw until the wireframe-upload port and a geometry
//! handle in the draw seam land. See the crate status log.

use flighthq_materials::unlit_materials::wireframe_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_mesh_program::{begin_gl_mesh_draw, set_gl_mesh_view_projection};
use crate::gl_pbr_standard_bind::unpack_color_to_linear;
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};
use crate::gl_wireframe_prelude::ensure_gl_wireframe_program;

/// The built-in Wireframe renderer.
pub struct WireframeGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for WireframeGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let wireframe = material.and_then(|m| m.as_wireframe());
        let program = ensure_gl_wireframe_program(state, scene);
        // double_sided = true: lines have no winding, so back-face culling must be
        // off.
        begin_gl_mesh_draw(state, scene, &program.base, true);
        set_gl_mesh_view_projection(&state.gl, program.base.loc_view_projection.as_ref(), camera);

        let color = wireframe.map_or([1.0, 1.0, 1.0, 1.0], |w| unpack_color_to_linear(w.color));
        unsafe {
            state.gl.uniform_4_f32(
                program.loc_color.as_ref(),
                color[0],
                color[1],
                color[2],
                color[3],
            );
        }
    }

    fn draw(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        proxy: &SceneRenderProxy,
        _upload: &GlMeshUpload,
    ) {
        let Some(program) = scene.active_mesh_program.clone() else {
            return;
        };
        unsafe {
            state.gl.uniform_matrix_4_f32_slice(
                program.loc_model.as_ref(),
                false,
                &proxy.world_matrix.m,
            );
        }
        // The GL_LINES draw over the derived line-index buffer awaits the
        // wireframe-upload port + a geometry handle in the draw seam (see the
        // module divergence note).
    }
}

/// Registers the built-in Wireframe renderer for `WireframeMaterialKind`.
pub fn register_wireframe_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        wireframe_material_kind(),
        Box::new(WireframeGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::unlit_materials::wireframe_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_wireframe_gl_material

    #[test]
    fn register_wireframe_gl_material_registers_for_the_wireframe_kind() {
        let mut scene = create_gl_scene_runtime();
        register_wireframe_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, wireframe_material_kind()).is_some());
    }
}
