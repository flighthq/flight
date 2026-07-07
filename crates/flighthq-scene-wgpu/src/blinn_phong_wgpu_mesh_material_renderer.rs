//! The built-in classic Blinn-Phong forward-lit mesh-material renderer — the WGSL
//! mirror of `blinn_phong_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `blinnPhongWgpuMeshMaterialRenderer.ts`. Lambert
//! diffuse plus a half-vector specular lobe: `bind` selects the classic uber-shader's
//! `blinnphong` variant, writes the shared Frame uniform (camera position + the
//! packed light block, since the specular term is view-dependent), and binds the
//! material's linear diffuse + specular colors and shininess at group(2); `draw`
//! issues the indexed draw. Maps are deferred on wgpu.

use flighthq_materials::blinn_phong_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::classic_material::BlinnPhongMaterial;
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
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// The built-in classic Blinn-Phong forward-lit mesh-material renderer.
pub struct BlinnPhongWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for BlinnPhongWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let blinn_phong = material.and_then(downcast_blinn_phong);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let cache_key =
            ensure_wgpu_classic_pipeline(state, scene, &define_key(blinn_phong), format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, lights);

        let material_key = material.map_or_else(blinn_phong_material_kind, |m| m.kind());
        let (diffuse, specular, shininess, alpha_cutoff) = match blinn_phong {
            Some(m) => (
                unpack_color_to_linear_f32(m.diffuse),
                unpack_color_to_linear_f32(m.specular),
                m.shininess,
                m.alpha_cutoff,
            ),
            None => (WHITE, WHITE, 32.0, 0.5),
        };
        bind_wgpu_classic_surface(
            state,
            scene,
            &cache_key,
            material_key,
            &diffuse,
            &specular,
            shininess,
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

/// Returns the singleton Blinn-Phong renderer instance.
pub fn blinn_phong_wgpu_mesh_material_renderer() -> BlinnPhongWgpuMeshMaterialRenderer {
    BlinnPhongWgpuMeshMaterialRenderer
}

/// Registers the built-in Blinn-Phong renderer for the Blinn-Phong material kind on
/// this scene runtime. Opt-in (no top-level side effect).
pub fn register_blinn_phong_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        blinn_phong_material_kind(),
        Box::new(BlinnPhongWgpuMeshMaterialRenderer),
    );
}

fn define_key(material: Option<&BlinnPhongMaterial>) -> WgpuClassicDefineKey {
    WgpuClassicDefineKey {
        alpha_mask_enabled: material.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|m| m.double_sided),
        has_diffuse_map: false,
        has_normal_map: false,
        has_specular_map: false,
        lighting_model: WgpuClassicLightingModel::BlinnPhong,
    }
}

fn downcast_blinn_phong(material: &dyn Material) -> Option<&BlinnPhongMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<BlinnPhongMaterial>()
}

const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod define_key {
        use super::*;

        #[test]
        fn selects_the_blinnphong_lighting_model() {
            assert_eq!(
                define_key(None).lighting_model,
                WgpuClassicLightingModel::BlinnPhong
            );
        }
    }

    mod register_blinn_phong_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_blinn_phong_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                blinn_phong_material_kind(),
                Box::new(BlinnPhongWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&blinn_phong_material_kind())
            );
        }
    }
}
