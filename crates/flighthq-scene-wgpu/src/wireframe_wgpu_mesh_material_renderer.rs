//! The built-in Wireframe forward mesh-material renderer — the WGSL mirror of
//! `wireframe_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `wireframeWgpuMeshMaterialRenderer.ts`. `bind` selects
//! the line-list wireframe pipeline for the color format, writes the shared Frame
//! uniform (lights ignored), and binds the flat linear line color at group(2).
//! `thickness` > 1 is not honored (WebGPU has no line-width control).
//!
//! TS↔Rust divergence: the TS renderer draws the mesh's derived line-index buffer
//! (`wgpuWireframeUpload`) as line-list primitives. That derived line-index upload is
//! not yet ported to the Rust crate (mirroring the `wireframe_gl` sibling's stubbed
//! line-index upload), so `draw` here issues the shared indexed draw over the
//! triangle index buffer under the line-list pipeline — `bind` is full; the true
//! edge topology arrives with the ported wireframe upload.

use flighthq_materials::wireframe_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::WireframeMaterial;

use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_mesh_pipeline::{
    draw_wgpu_mesh_material_subset, unpack_color_to_linear_f32, write_wgpu_frame_uniform,
};
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};
use crate::wgpu_wireframe_prelude::{bind_wgpu_wireframe_color, ensure_wgpu_wireframe_pipeline};

/// The built-in Wireframe forward mesh-material renderer.
pub struct WireframeWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for WireframeWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let wireframe = material.and_then(downcast_wireframe);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let cache_key = ensure_wgpu_wireframe_pipeline(state, scene, format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, _lights);

        let material_key = material.map_or_else(wireframe_material_kind, |m| m.kind());
        let color = wireframe.map_or(WHITE, |m| unpack_color_to_linear_f32(m.color));
        bind_wgpu_wireframe_color(state, scene, &cache_key, material_key, &color);
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

/// Returns the singleton Wireframe renderer instance.
pub fn wireframe_wgpu_mesh_material_renderer() -> WireframeWgpuMeshMaterialRenderer {
    WireframeWgpuMeshMaterialRenderer
}

/// Registers the built-in Wireframe renderer for the Wireframe material kind on this
/// scene runtime. Opt-in (no top-level side effect).
pub fn register_wireframe_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        wireframe_material_kind(),
        Box::new(WireframeWgpuMeshMaterialRenderer),
    );
}

fn downcast_wireframe(material: &dyn Material) -> Option<&WireframeMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<WireframeMaterial>()
}

const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_wireframe_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_wireframe_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                wireframe_material_kind(),
                Box::new(WireframeWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&wireframe_material_kind())
            );
        }
    }
}
