//! The built-in Depth forward mesh-material renderer — the WGSL mirror of
//! `depth_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `depthWgpuMeshMaterialRenderer.ts`. A
//! lighting-independent debug/utility pass material: `bind` selects the debug
//! pipeline in depth mode, writes the shared Frame uniform (lights ignored), and
//! binds the material's `[near, far]` linearization range; `draw` issues the indexed
//! draw. The fragment stage linearizes window-space depth into eye space and writes
//! it as grayscale.

use flighthq_materials::depth_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::DepthMaterial;

use crate::wgpu_debug_prelude::{
    WgpuDebugDefineKey, WgpuDebugMode, bind_wgpu_debug_surface, ensure_wgpu_debug_pipeline,
};
use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_mesh_pipeline::{draw_wgpu_mesh_material_subset, write_wgpu_frame_uniform};
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// The built-in Depth forward mesh-material renderer.
pub struct DepthWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for DepthWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let depth = material.and_then(downcast_depth);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let key = WgpuDebugDefineKey {
            has_normal_map: false,
            mode: WgpuDebugMode::Depth,
        };
        let cache_key = ensure_wgpu_debug_pipeline(state, scene, &key, format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, _lights);

        let material_key = material.map_or_else(depth_material_kind, |m| m.kind());
        let (near, far) = match depth {
            Some(m) => (m.near, m.far),
            None => (0.0, 1.0),
        };
        bind_wgpu_debug_surface(state, scene, &cache_key, material_key, near, far, 1.0);
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

/// Returns the singleton Depth renderer instance.
pub fn depth_wgpu_mesh_material_renderer() -> DepthWgpuMeshMaterialRenderer {
    DepthWgpuMeshMaterialRenderer
}

/// Registers the built-in Depth renderer for the Depth material kind on this scene
/// runtime. Opt-in (no top-level side effect).
pub fn register_depth_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        depth_material_kind(),
        Box::new(DepthWgpuMeshMaterialRenderer),
    );
}

fn downcast_depth(material: &dyn Material) -> Option<&DepthMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<DepthMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_depth_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_depth_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                depth_material_kind(),
                Box::new(DepthWgpuMeshMaterialRenderer),
            );
            assert!(scene.material_registry.contains_key(&depth_material_kind()));
        }
    }
}
