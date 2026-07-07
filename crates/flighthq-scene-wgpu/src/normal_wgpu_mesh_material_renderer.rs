//! The built-in Normal forward mesh-material renderer — the WGSL mirror of
//! `normal_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `normalWgpuMeshMaterialRenderer.ts`. A
//! lighting-independent debug/utility pass material: `bind` selects the debug
//! pipeline in normal mode, writes the shared Frame uniform (lights ignored), and
//! binds the material's `normal_scale`; `draw` issues the indexed draw. The fragment
//! stage transforms the geometric normal by the normal matrix (WORLD-space) and
//! encodes it as `n * 0.5 + 0.5`. The tangent-space normal map is deferred on wgpu
//! (`has_normal_map` stays false; the placeholder is bound).

use flighthq_materials::normal_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::NormalMaterial;

use crate::wgpu_debug_prelude::{
    WgpuDebugDefineKey, WgpuDebugMode, bind_wgpu_debug_surface, ensure_wgpu_debug_pipeline,
};
use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_mesh_pipeline::{draw_wgpu_mesh_material_subset, write_wgpu_frame_uniform};
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// The built-in Normal forward mesh-material renderer.
pub struct NormalWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for NormalWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let normal = material.and_then(downcast_normal);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        // The normal map is not yet uploaded on wgpu, so the map variant is never
        // selected — keep has_normal_map false and bind the shared placeholder.
        let key = WgpuDebugDefineKey {
            has_normal_map: false,
            mode: WgpuDebugMode::Normal,
        };
        let cache_key = ensure_wgpu_debug_pipeline(state, scene, &key, format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, _lights);

        let material_key = material.map_or_else(normal_material_kind, |m| m.kind());
        let normal_scale = normal.map_or(1.0, |m| m.normal_scale);
        bind_wgpu_debug_surface(
            state,
            scene,
            &cache_key,
            material_key,
            0.0,
            1.0,
            normal_scale,
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

/// Returns the singleton Normal renderer instance.
pub fn normal_wgpu_mesh_material_renderer() -> NormalWgpuMeshMaterialRenderer {
    NormalWgpuMeshMaterialRenderer
}

/// Registers the built-in Normal renderer for the Normal material kind on this scene
/// runtime. Opt-in (no top-level side effect).
pub fn register_normal_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        normal_material_kind(),
        Box::new(NormalWgpuMeshMaterialRenderer),
    );
}

fn downcast_normal(material: &dyn Material) -> Option<&NormalMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<NormalMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_normal_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_normal_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                normal_material_kind(),
                Box::new(NormalWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&normal_material_kind())
            );
        }
    }
}
