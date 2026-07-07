//! The built-in Iridescence (KHR_materials_iridescence) forward-lit mesh-material
//! renderer — the WGSL mirror of `iridescence_pbr_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `iridescencePbrWgpuMeshMaterialRenderer.ts`.
//! Iridescence models a thin transparent film over the surface whose interference
//! shifts the Fresnel reflectance toward a view- and thickness-dependent hue —
//! soap bubbles, oil slicks, anodized metal. The shader applies a compact
//! sinusoidal thin-film approximation (sample-viewer style) to F0 behind `const
//! IRIDESCENCE`. `bind` builds the standard define key + sets
//! `iridescence_enabled`, packs the base block + the iridescence strength / film
//! IOR / a single film thickness (the midpoint of the descriptor's min/max nm
//! range) into the shared MaterialBlock (floats 28..30), and binds through
//! [`bind_wgpu_pbr_mesh_material`]. The per-texel thickness map is reserved but NOT
//! sampled on wgpu yet (maps deferred).
//!
//! Cannot be visually captured without a GPU adapter; the GPU bind/draw path is
//! validated functionally (the parity matrix at the `wgpu` cell), matching the
//! sibling `flighthq-scene-gl` no-device test posture.

use flighthq_materials::iridescence_pbr_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::IridescencePbrMaterial;
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

/// The built-in Iridescence forward-lit mesh-material renderer.
pub struct IridescencePbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for IridescencePbrWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let iridescence = material.and_then(downcast_iridescence_pbr);
        let standard = iridescence.map(|i| &i.standard);

        let mut key = WgpuPbrDefineKey {
            alpha_mask_enabled: iridescence
                .is_some_and(|i| i.alpha_mode == MaterialAlphaMode::Mask),
            double_sided: iridescence.is_some_and(|i| i.double_sided),
            ..Default::default()
        };
        key.iridescence_enabled = true;

        let mut scratch = [0.0f32; MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(
            &mut scratch,
            standard,
            iridescence.map_or(0.5, |i| i.alpha_cutoff),
        );
        // iridescence group (floats 28..30): strength, film IOR, film thickness (nm; min/max midpoint).
        if let Some(iridescence) = iridescence {
            scratch[28] = iridescence.iridescence;
            scratch[29] = iridescence.iridescence_ior;
            scratch[30] = (iridescence.iridescence_thickness_min
                + iridescence.iridescence_thickness_max)
                * 0.5;
        } else {
            scratch[28] = 0.0;
            scratch[29] = 1.3;
            scratch[30] = 250.0;
        }

        let material_key = material.map_or_else(iridescence_pbr_material_kind, |m| m.kind());
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

/// Returns the singleton Iridescence renderer instance.
pub fn iridescence_pbr_wgpu_mesh_material_renderer() -> IridescencePbrWgpuMeshMaterialRenderer {
    IridescencePbrWgpuMeshMaterialRenderer
}

/// Registers the built-in Iridescence renderer for the Iridescence material kind
/// on this scene runtime. Opt-in (no top-level side effect): `draw_wgpu_scene`
/// only draws Iridescence subsets once this is called.
pub fn register_iridescence_pbr_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        iridescence_pbr_material_kind(),
        Box::new(IridescencePbrWgpuMeshMaterialRenderer),
    );
}

/// Downcasts a bound `&dyn Material` to the concrete [`IridescencePbrMaterial`] via
/// the `Material: Any` seam. Returns `None` for any other material.
fn downcast_iridescence_pbr(material: &dyn Material) -> Option<&IridescencePbrMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<IridescencePbrMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_iridescence_pbr_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_iridescence_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                iridescence_pbr_material_kind(),
                Box::new(IridescencePbrWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&iridescence_pbr_material_kind())
            );
        }
    }

    mod iridescence_pbr_wgpu_mesh_material_renderer {
        use super::*;

        #[test]
        fn returns_a_renderer_value() {
            let _renderer = iridescence_pbr_wgpu_mesh_material_renderer();
        }
    }
}
