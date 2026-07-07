//! The built-in classic Lambert forward-lit mesh-material renderer — the WGSL
//! mirror of `lambert_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `lambertWgpuMeshMaterialRenderer.ts`. `bind` selects
//! the classic uber-shader's `lambert` variant for the material's alpha mode + color
//! format, writes the shared Frame uniform (camera + packed light block), and binds
//! the material's linear diffuse color at group(2); `draw` issues the indexed draw.
//! Lambert has no view-dependent term, so the classic prelude compiles out its
//! specular branch (the specular color it binds is unused). Maps are deferred on
//! wgpu, so `has_diffuse_map` stays false and the placeholder is bound.

use flighthq_materials::lambert_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::classic_material::LambertMaterial;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::wgpu_classic_prelude::{
    WgpuClassicDefineKey, WgpuClassicLightingModel, bind_wgpu_classic_surface,
    ensure_wgpu_classic_pipeline,
};
use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_mesh_pipeline::{
    draw_wgpu_mesh_material_subset, unpack_color_to_linear_f32, write_wgpu_frame_uniform,
};
use crate::wgpu_scene_runtime::WgpuSceneRuntime;

/// The built-in classic Lambert forward-lit mesh-material renderer.
pub struct LambertWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for LambertWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let lambert = material.and_then(downcast_lambert);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let cache_key = ensure_wgpu_classic_pipeline(state, scene, &define_key(lambert), format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, lights);

        let material_key = material.map_or_else(lambert_material_kind, |m| m.kind());
        let (diffuse, alpha_cutoff) = match lambert {
            Some(m) => (unpack_color_to_linear_f32(m.diffuse), m.alpha_cutoff),
            None => (WHITE, 0.5),
        };
        bind_wgpu_classic_surface(
            state,
            scene,
            &cache_key,
            material_key,
            &diffuse,
            &WHITE,
            32.0,
            alpha_cutoff,
        );
        scene.active_material_key = Some(material_key);
    }

    fn draw(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &crate::wgpu_scene_runtime::WgpuMeshUpload,
    ) {
        draw_wgpu_mesh_material_subset(state, scene, proxy, upload);
    }
}

/// Returns the singleton Lambert renderer instance.
pub fn lambert_wgpu_mesh_material_renderer() -> LambertWgpuMeshMaterialRenderer {
    LambertWgpuMeshMaterialRenderer
}

/// Registers the built-in Lambert renderer for the Lambert material kind on this
/// scene runtime. Opt-in (no top-level side effect).
pub fn register_lambert_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        lambert_material_kind(),
        Box::new(LambertWgpuMeshMaterialRenderer),
    );
}

/// The classic define key for a Lambert material: the fixed `Lambert` lighting model
/// plus the alpha-mask + double-sided flags. Maps are deferred on wgpu.
fn define_key(material: Option<&LambertMaterial>) -> WgpuClassicDefineKey {
    WgpuClassicDefineKey {
        alpha_mask_enabled: material.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|m| m.double_sided),
        has_diffuse_map: false,
        has_normal_map: false,
        has_specular_map: false,
        lighting_model: WgpuClassicLightingModel::Lambert,
    }
}

fn downcast_lambert(material: &dyn Material) -> Option<&LambertMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<LambertMaterial>()
}

const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod define_key {
        use super::*;

        #[test]
        fn selects_the_lambert_lighting_model_and_no_maps() {
            let key = define_key(None);
            assert_eq!(key.lighting_model, WgpuClassicLightingModel::Lambert);
            assert!(!key.alpha_mask_enabled);
            assert!(!key.has_diffuse_map);
        }
    }

    // register_lambert_wgpu_material takes the GPU `state` (unused by the registry
    // path); the insert is exercised over the threaded runtime, mirroring the
    // `register_standard_pbr_wgpu_material` test.
    mod register_lambert_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_lambert_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                lambert_material_kind(),
                Box::new(LambertWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&lambert_material_kind())
            );
        }
    }
}
