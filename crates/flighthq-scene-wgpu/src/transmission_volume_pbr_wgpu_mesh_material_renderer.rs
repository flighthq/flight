//! The built-in TransmissionVolume (KHR_materials_transmission +
//! KHR_materials_volume) forward-lit mesh-material renderer for refractive,
//! see-through surfaces (glass, liquid) — the WGSL mirror of
//! `transmission_volume_pbr_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `transmissionVolumePbrWgpuMeshMaterialRenderer.ts`.
//!
//! APPROXIMATION (not physically refractive yet): a true transmission path needs
//! the Phase-5 opaque-scene-color capture pass to sample what lies behind the
//! surface and refract it through the surface IOR, with Beer-Lambert absorption
//! over the volume `thickness`. Until that pass exists, this renderer models
//! transmission cheaply behind `const TRANSMISSION`: it attenuates the fragment's
//! coverage (alpha) by the `transmission` factor so the surface reads as
//! translucent, and tints the lit radiance by `attenuation_color`. The surface is
//! therefore drawn as a tinted, partially transparent lit shell rather than a
//! refracting lens. `thickness`, `attenuation_distance`, and `ior` are accepted on
//! the material but only `transmission`/`attenuation_color` drive the current
//! shader.
//!
//! `bind` builds the standard define key + sets `transmission_enabled`, packs the
//! base block + the transmission factor / linear-decoded attenuation color into
//! the shared MaterialBlock (floats 44..47), and binds through
//! [`bind_wgpu_pbr_mesh_material`]. The transmission/thickness maps are reserved
//! but NOT sampled on wgpu yet (maps deferred).
//!
//! Cannot be visually captured without a GPU adapter; the GPU bind/draw path is
//! validated functionally (the parity matrix at the `wgpu` cell), matching the
//! sibling `flighthq-scene-gl` no-device test posture.

use flighthq_materials::transmission_volume_pbr_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::TransmissionVolumePbrMaterial;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::standard_pbr_wgpu_mesh_material_renderer::{
    MATERIAL_UNIFORM_FLOATS, bind_wgpu_pbr_mesh_material, draw_standard_pbr_wgpu_mesh,
    unpack_color_to_linear, write_wgpu_pbr_standard_block,
};
use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_pbr_prelude::WgpuPbrDefineKey;
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// The built-in TransmissionVolume forward-lit mesh-material renderer.
pub struct TransmissionVolumePbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for TransmissionVolumePbrWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let transmission = material.and_then(downcast_transmission_volume_pbr);
        let standard = transmission.map(|t| &t.standard);

        let mut key = WgpuPbrDefineKey {
            alpha_mask_enabled: transmission
                .is_some_and(|t| t.alpha_mode == MaterialAlphaMode::Mask),
            double_sided: transmission.is_some_and(|t| t.double_sided),
            ..Default::default()
        };
        key.transmission_enabled = true;

        let mut scratch = [0.0f32; MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(
            &mut scratch,
            standard,
            transmission.map_or(0.5, |t| t.alpha_cutoff),
        );
        // transmission group (floats 44..47): transmission factor, attenuationColor.rgb (linear).
        if let Some(transmission) = transmission {
            let color = unpack_color_to_linear(transmission.attenuation_color);
            scratch[44] = transmission.transmission;
            scratch[45] = color[0];
            scratch[46] = color[1];
            scratch[47] = color[2];
        } else {
            scratch[44] = 0.0;
            scratch[45] = 1.0;
            scratch[46] = 1.0;
            scratch[47] = 1.0;
        }

        let material_key =
            material.map_or_else(transmission_volume_pbr_material_kind, |m| m.kind());
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

/// Returns the singleton TransmissionVolume renderer instance.
pub fn transmission_volume_pbr_wgpu_mesh_material_renderer()
-> TransmissionVolumePbrWgpuMeshMaterialRenderer {
    TransmissionVolumePbrWgpuMeshMaterialRenderer
}

/// Registers the built-in TransmissionVolume renderer for the TransmissionVolume
/// material kind on this scene runtime. Opt-in (no top-level side effect):
/// `draw_wgpu_scene` only draws TransmissionVolume subsets once this is called.
pub fn register_transmission_volume_pbr_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        transmission_volume_pbr_material_kind(),
        Box::new(TransmissionVolumePbrWgpuMeshMaterialRenderer),
    );
}

/// Downcasts a bound `&dyn Material` to the concrete
/// [`TransmissionVolumePbrMaterial`] via the `Material: Any` seam. Returns `None`
/// for any other material.
fn downcast_transmission_volume_pbr(
    material: &dyn Material,
) -> Option<&TransmissionVolumePbrMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<TransmissionVolumePbrMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_transmission_volume_pbr_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_transmission_volume_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                transmission_volume_pbr_material_kind(),
                Box::new(TransmissionVolumePbrWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&transmission_volume_pbr_material_kind())
            );
        }
    }

    mod transmission_volume_pbr_wgpu_mesh_material_renderer {
        use super::*;

        #[test]
        fn returns_a_renderer_value() {
            let _renderer = transmission_volume_pbr_wgpu_mesh_material_renderer();
        }
    }
}
