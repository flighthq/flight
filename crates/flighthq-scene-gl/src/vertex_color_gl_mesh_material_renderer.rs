//! The built-in VertexColor forward renderer.
//!
//! Ports `@flighthq/scene-gl` `vertexColorGlMeshMaterialRenderer.ts`. Lighting-
//! independent: the unlit shader's VERTEX_COLOR variant multiplies the mesh's
//! interpolated `color0` attribute by the linear tint. `bind` selects the variant,
//! uploads the camera view-projection and the linear tint, and defaults the
//! `color0` generic attribute to opaque white so a mesh WITHOUT a `color0`
//! attribute renders the tint alone. Lights are ignored.

use flighthq_materials::unlit_materials::vertex_color_material_kind;
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_view_projection,
};
use crate::gl_pbr_standard_bind::unpack_color_to_linear;
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};
use crate::gl_unlit_prelude::{GlUnlitDefineKey, bind_gl_unlit_surface, ensure_gl_unlit_program};

/// The built-in VertexColor renderer.
pub struct VertexColorGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for VertexColorGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let vertex_color = material.and_then(|m| m.as_vertex_color());
        let key = GlUnlitDefineKey {
            alpha_mask_enabled: vertex_color
                .is_some_and(|v| v.alpha_mode == MaterialAlphaMode::Mask),
            has_color_map: false,
            vertex_color: true,
        };
        let program = ensure_gl_unlit_program(state, scene, &key);
        begin_gl_mesh_draw(
            state,
            scene,
            &program.base,
            vertex_color.is_some_and(|v| v.double_sided),
        );
        set_gl_mesh_view_projection(&state.gl, program.base.loc_view_projection.as_ref(), camera);

        // Default the color0 generic vertex attribute to opaque white so a mesh
        // WITHOUT a color0 attribute renders the tint alone (matching the wgpu
        // path) instead of multiplying by the (0,0,0,1) default, which would
        // render black. A mesh that DOES carry color0 enables the array and
        // overrides this.
        unsafe {
            state.gl.vertex_attrib_4_f32(4, 1.0, 1.0, 1.0, 1.0);
        }

        let (color, alpha_cutoff) = match vertex_color {
            None => ([1.0, 1.0, 1.0, 1.0], 0.5),
            Some(v) => (unpack_color_to_linear(v.tint), v.alpha_cutoff),
        };
        bind_gl_unlit_surface(state, &program, &color, 1.0, alpha_cutoff);
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

/// Registers the built-in VertexColor renderer for `VertexColorMaterialKind`.
pub fn register_vertex_color_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        vertex_color_material_kind(),
        Box::new(VertexColorGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_materials::unlit_materials::vertex_color_material_kind;

    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_vertex_color_gl_material

    #[test]
    fn register_vertex_color_gl_material_registers_for_the_vertex_color_kind() {
        let mut scene = create_gl_scene_runtime();
        register_vertex_color_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, vertex_color_material_kind()).is_some());
    }
}
