//! The built-in Toon (cel-shading) forward-lit mesh-material renderer — the WGSL
//! mirror of `toon_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `toonWgpuMeshMaterialRenderer.ts`. `bind` selects the
//! toon pipeline variant, writes the shared Frame uniform (camera + packed light
//! block), and binds the linear base color + step count at group(2); the diffuse N·L
//! is quantized into stepped cel bands in the fragment stage. Maps (base-color, ramp)
//! are deferred on wgpu, so the quantizer is always the scalar `steps` stepped floor.

use flighthq_materials::toon_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::ToonMaterial;

use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_mesh_pipeline::{
    draw_wgpu_mesh_material_subset, unpack_color_to_linear_f32, write_wgpu_frame_uniform,
};
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};
use crate::wgpu_toon_prelude::{
    WgpuToonDefineKey, bind_wgpu_toon_surface, ensure_wgpu_toon_pipeline,
};

/// The built-in Toon forward-lit mesh-material renderer.
pub struct ToonWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for ToonWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let toon = material.and_then(downcast_toon);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let cache_key = ensure_wgpu_toon_pipeline(state, scene, &define_key(toon), format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, lights);

        let material_key = material.map_or_else(toon_material_kind, |m| m.kind());
        let (base_color, steps, alpha_cutoff) = match toon {
            Some(m) => (
                unpack_color_to_linear_f32(m.base_color),
                m.steps as f32,
                m.alpha_cutoff,
            ),
            None => (WHITE, 3.0, 0.5),
        };
        bind_wgpu_toon_surface(
            state,
            scene,
            &cache_key,
            material_key,
            &base_color,
            steps,
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

/// Returns the singleton Toon renderer instance.
pub fn toon_wgpu_mesh_material_renderer() -> ToonWgpuMeshMaterialRenderer {
    ToonWgpuMeshMaterialRenderer
}

/// Registers the built-in Toon renderer for the Toon material kind on this scene
/// runtime. Opt-in (no top-level side effect).
pub fn register_toon_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        toon_material_kind(),
        Box::new(ToonWgpuMeshMaterialRenderer),
    );
}

fn define_key(material: Option<&ToonMaterial>) -> WgpuToonDefineKey {
    WgpuToonDefineKey {
        alpha_mask_enabled: material.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|m| m.double_sided),
        has_base_color_map: false,
        has_ramp: false,
    }
}

fn downcast_toon(material: &dyn Material) -> Option<&ToonMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<ToonMaterial>()
}

const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_toon_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_toon_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene
                .material_registry
                .insert(toon_material_kind(), Box::new(ToonWgpuMeshMaterialRenderer));
            assert!(scene.material_registry.contains_key(&toon_material_kind()));
        }
    }
}
