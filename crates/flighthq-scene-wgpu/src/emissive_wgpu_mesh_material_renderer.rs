//! The built-in Emissive forward mesh-material renderer — the WGSL mirror of
//! `emissive_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `emissiveWgpuMeshMaterialRenderer.ts`.
//! Self-illuminating, lighting-independent: binds the linear emissive color scaled by
//! `emissive_strength` through the shared unlit pipeline (values > 1 drive bloom over
//! the rgba16float scene target). Maps are deferred on wgpu.

use flighthq_materials::emissive_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::EmissiveMaterial;

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

/// The built-in Emissive forward mesh-material renderer.
pub struct EmissiveWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for EmissiveWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let emissive = material.and_then(downcast_emissive);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let cache_key = ensure_wgpu_unlit_pipeline(state, scene, &define_key(emissive), format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, _lights);

        let material_key = material.map_or_else(emissive_material_kind, |m| m.kind());
        let (color, intensity, alpha_cutoff) = match emissive {
            Some(m) => (
                unpack_color_to_linear_f32(m.emissive),
                m.emissive_strength,
                m.alpha_cutoff,
            ),
            None => (WHITE, 1.0, 0.5),
        };
        bind_wgpu_unlit_surface(
            state,
            scene,
            &cache_key,
            material_key,
            &color,
            intensity,
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

/// Returns the singleton Emissive renderer instance.
pub fn emissive_wgpu_mesh_material_renderer() -> EmissiveWgpuMeshMaterialRenderer {
    EmissiveWgpuMeshMaterialRenderer
}

/// Registers the built-in Emissive renderer for the Emissive material kind on this
/// scene runtime. Opt-in (no top-level side effect).
pub fn register_emissive_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        emissive_material_kind(),
        Box::new(EmissiveWgpuMeshMaterialRenderer),
    );
}

fn define_key(material: Option<&EmissiveMaterial>) -> WgpuUnlitDefineKey {
    WgpuUnlitDefineKey {
        alpha_mask_enabled: material.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|m| m.double_sided),
        has_color_map: false,
    }
}

fn downcast_emissive(material: &dyn Material) -> Option<&EmissiveMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<EmissiveMaterial>()
}

const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_emissive_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_emissive_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                emissive_material_kind(),
                Box::new(EmissiveWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&emissive_material_kind())
            );
        }
    }
}
