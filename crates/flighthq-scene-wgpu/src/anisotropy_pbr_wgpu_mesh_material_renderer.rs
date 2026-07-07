//! The built-in Anisotropy (KHR_materials_anisotropy) forward-lit mesh-material
//! renderer — the WGSL mirror of `anisotropy_pbr_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `anisotropyPbrWgpuMeshMaterialRenderer.ts`.
//! Anisotropy stretches the specular highlight along the mesh tangent direction —
//! brushed metal, hair, vinyl — by splitting roughness into along-tangent and
//! across-tangent axes and evaluating an anisotropic GGX distribution (Burley) in
//! the shader's rotated tangent frame. It REQUIRES mesh tangents, which the
//! canonical PBR vertex record already carries (location 2). `bind` builds the
//! standard define key + sets `anisotropy_enabled`, packs the base block + the
//! anisotropy strength/rotation into the shared MaterialBlock (floats 24..25), and
//! binds through [`bind_wgpu_pbr_mesh_material`]. The lobe lives behind `const
//! ANISOTROPY` in the PBR uber-shader. The anisotropy direction map is reserved by
//! the descriptor but NOT sampled on wgpu yet (maps deferred).
//!
//! Cannot be visually captured without a GPU adapter; the GPU bind/draw path is
//! validated functionally (the parity matrix at the `wgpu` cell), matching the
//! sibling `flighthq-scene-gl` no-device test posture.

use flighthq_materials::anisotropy_pbr_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::AnisotropyPbrMaterial;
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

/// The built-in Anisotropy forward-lit mesh-material renderer.
pub struct AnisotropyPbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for AnisotropyPbrWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let anisotropy = material.and_then(downcast_anisotropy_pbr);
        let standard = anisotropy.map(|a| &a.standard);

        let mut key = WgpuPbrDefineKey {
            alpha_mask_enabled: anisotropy.is_some_and(|a| a.alpha_mode == MaterialAlphaMode::Mask),
            double_sided: anisotropy.is_some_and(|a| a.double_sided),
            ..Default::default()
        };
        key.anisotropy_enabled = true;

        let mut scratch = [0.0f32; MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(
            &mut scratch,
            standard,
            anisotropy.map_or(0.5, |a| a.alpha_cutoff),
        );
        // anisotropy group (floats 24..25): strength, rotation (radians).
        scratch[24] = anisotropy.map_or(0.0, |a| a.anisotropy_strength);
        scratch[25] = anisotropy.map_or(0.0, |a| a.anisotropy_rotation);

        let material_key = material.map_or_else(anisotropy_pbr_material_kind, |m| m.kind());
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

/// Returns the singleton Anisotropy renderer instance.
pub fn anisotropy_pbr_wgpu_mesh_material_renderer() -> AnisotropyPbrWgpuMeshMaterialRenderer {
    AnisotropyPbrWgpuMeshMaterialRenderer
}

/// Registers the built-in Anisotropy renderer for the Anisotropy material kind on
/// this scene runtime. Opt-in (no top-level side effect): `draw_wgpu_scene` only
/// draws Anisotropy subsets once this is called.
pub fn register_anisotropy_pbr_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        anisotropy_pbr_material_kind(),
        Box::new(AnisotropyPbrWgpuMeshMaterialRenderer),
    );
}

/// Downcasts a bound `&dyn Material` to the concrete [`AnisotropyPbrMaterial`] via
/// the `Material: Any` seam. Returns `None` for any other material.
fn downcast_anisotropy_pbr(material: &dyn Material) -> Option<&AnisotropyPbrMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<AnisotropyPbrMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_anisotropy_pbr_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_anisotropy_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                anisotropy_pbr_material_kind(),
                Box::new(AnisotropyPbrWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&anisotropy_pbr_material_kind())
            );
        }
    }

    mod anisotropy_pbr_wgpu_mesh_material_renderer {
        use super::*;

        #[test]
        fn returns_a_renderer_value() {
            let _renderer = anisotropy_pbr_wgpu_mesh_material_renderer();
        }
    }
}
