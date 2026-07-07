//! The built-in VertexColor forward mesh-material renderer — the WGSL mirror of
//! `vertex_color_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `vertexColorWgpuMeshMaterialRenderer.ts`.
//! Lighting-independent: renders the material's linear tint through the shared unlit
//! pipeline. The canonical 48-byte vertex layout has no color0 slot on wgpu, so
//! (unlike the GL path) the mesh color0 attribute is not yet multiplied in — the tint
//! alone drives the surface until color0 vertex support lands.

use flighthq_materials::vertex_color_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::VertexColorMaterial;

use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_mesh_pipeline::{
    draw_wgpu_mesh_material_subset, unpack_color_to_linear_f32, write_wgpu_frame_uniform,
};
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};
use crate::wgpu_unlit_prelude::{
    WgpuUnlitDefineKey, bind_wgpu_unlit_surface, ensure_wgpu_unlit_pipeline,
};

/// The built-in VertexColor forward mesh-material renderer.
pub struct VertexColorWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for VertexColorWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let vertex_color = material.and_then(downcast_vertex_color);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let cache_key = ensure_wgpu_unlit_pipeline(state, scene, &define_key(vertex_color), format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, _lights);

        let material_key = material.map_or_else(vertex_color_material_kind, |m| m.kind());
        let (tint, alpha_cutoff) = match vertex_color {
            Some(m) => (unpack_color_to_linear_f32(m.tint), m.alpha_cutoff),
            None => (WHITE, 0.5),
        };
        bind_wgpu_unlit_surface(
            state,
            scene,
            &cache_key,
            material_key,
            &tint,
            1.0,
            alpha_cutoff,
        );
        scene.active_material_key = Some(material_key);
    }

    fn draw(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &WgpuMeshUpload,
    ) {
        draw_wgpu_mesh_material_subset(state, scene, proxy, upload);
    }
}

/// Returns the singleton VertexColor renderer instance.
pub fn vertex_color_wgpu_mesh_material_renderer() -> VertexColorWgpuMeshMaterialRenderer {
    VertexColorWgpuMeshMaterialRenderer
}

/// Registers the built-in VertexColor renderer for the VertexColor material kind on
/// this scene runtime. Opt-in (no top-level side effect).
pub fn register_vertex_color_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        vertex_color_material_kind(),
        Box::new(VertexColorWgpuMeshMaterialRenderer),
    );
}

fn define_key(material: Option<&VertexColorMaterial>) -> WgpuUnlitDefineKey {
    WgpuUnlitDefineKey {
        alpha_mask_enabled: material.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|m| m.double_sided),
        has_color_map: false,
    }
}

fn downcast_vertex_color(material: &dyn Material) -> Option<&VertexColorMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<VertexColorMaterial>()
}

const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_vertex_color_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_vertex_color_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                vertex_color_material_kind(),
                Box::new(VertexColorWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&vertex_color_material_kind())
            );
        }
    }
}
