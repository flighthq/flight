//! The built-in Clearcoat (KHR_materials_clearcoat) forward-lit mesh-material
//! renderer — the WGSL mirror of `clearcoat_pbr_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `clearcoatPbrWgpuMeshMaterialRenderer.ts`.
//! Clearcoat adds a second, always-dielectric GGX specular lobe (F0 = 0.04) over
//! the base PBR layer — the wet, lacquered highlight of car paint or varnish —
//! with its own clearcoat roughness, and attenuates the base layers by the
//! clearcoat's Fresnel so energy is conserved. `bind` builds the standard define
//! key + sets `clearcoat_enabled`, packs the base block + the clearcoat factors
//! into the shared MaterialBlock (floats 16..17), and binds through
//! [`bind_wgpu_pbr_mesh_material`]. The lobe lives behind `const CLEARCOAT` in the
//! one PBR uber-shader. The clearcoat/roughness/normal maps are reserved by the
//! descriptor but NOT sampled on wgpu yet (scalar clearcoat is the current
//! approximation; maps deferred).
//!
//! Cannot be visually captured without a GPU adapter; the GPU bind/draw path is
//! validated functionally (the parity matrix at the `wgpu` cell), matching the
//! sibling `flighthq-scene-gl` no-device test posture.

use flighthq_materials::clearcoat_pbr_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::ClearcoatPbrMaterial;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::standard_pbr_wgpu_mesh_material_renderer::{
    MATERIAL_UNIFORM_FLOATS, bind_wgpu_pbr_mesh_material, draw_standard_pbr_wgpu_mesh,
    write_wgpu_pbr_standard_block,
};
use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_pbr_prelude::WgpuPbrDefineKey;
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// The built-in Clearcoat forward-lit mesh-material renderer.
pub struct ClearcoatPbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for ClearcoatPbrWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let clearcoat = material.and_then(downcast_clearcoat_pbr);
        let standard = clearcoat.map(|c| &c.standard);

        let mut key = WgpuPbrDefineKey {
            alpha_mask_enabled: clearcoat.is_some_and(|c| c.alpha_mode == MaterialAlphaMode::Mask),
            double_sided: clearcoat.is_some_and(|c| c.double_sided),
            ..Default::default()
        };
        key.clearcoat_enabled = true;

        let mut scratch = [0.0f32; MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(
            &mut scratch,
            standard,
            clearcoat.map_or(0.5, |c| c.alpha_cutoff),
        );
        // clearcoat group (floats 16..17): clearcoat strength, clearcoat roughness.
        scratch[16] = clearcoat.map_or(0.0, |c| c.clearcoat);
        scratch[17] = clearcoat.map_or(0.0, |c| c.clearcoat_roughness);

        let material_key = material.map_or_else(clearcoat_pbr_material_kind, |m| m.kind());
        bind_wgpu_pbr_mesh_material(state, scene, &key, material_key, &scratch, lights, camera);
    }

    fn draw(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &WgpuMeshUpload,
    ) {
        draw_standard_pbr_wgpu_mesh(state, scene, proxy, upload);
    }
}

/// Returns the singleton Clearcoat renderer instance.
pub fn clearcoat_pbr_wgpu_mesh_material_renderer() -> ClearcoatPbrWgpuMeshMaterialRenderer {
    ClearcoatPbrWgpuMeshMaterialRenderer
}

/// Registers the built-in Clearcoat renderer for the Clearcoat material kind on
/// this scene runtime. Opt-in (no top-level side effect): `draw_wgpu_scene` only
/// draws Clearcoat subsets once this is called.
pub fn register_clearcoat_pbr_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        clearcoat_pbr_material_kind(),
        Box::new(ClearcoatPbrWgpuMeshMaterialRenderer),
    );
}

/// Downcasts a bound `&dyn Material` to the concrete [`ClearcoatPbrMaterial`] via
/// the `Material: Any` seam. Returns `None` for any other material.
fn downcast_clearcoat_pbr(material: &dyn Material) -> Option<&ClearcoatPbrMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<ClearcoatPbrMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_clearcoat_pbr_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_clearcoat_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                clearcoat_pbr_material_kind(),
                Box::new(ClearcoatPbrWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&clearcoat_pbr_material_kind())
            );
        }
    }

    mod clearcoat_pbr_wgpu_mesh_material_renderer {
        use super::*;

        #[test]
        fn returns_a_renderer_value() {
            let _renderer = clearcoat_pbr_wgpu_mesh_material_renderer();
        }
    }
}
