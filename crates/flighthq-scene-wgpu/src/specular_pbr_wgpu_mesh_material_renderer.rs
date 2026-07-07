//! The built-in Specular (KHR_materials_specular) forward-lit mesh-material
//! renderer — the WGSL mirror of `specular_pbr_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `specularPbrWgpuMeshMaterialRenderer.ts`. This
//! extension gives independent control of a dielectric's specular reflection:
//! `specular` scales the base reflectance and `specular_color` tints F0, letting a
//! surface be more or less reflective than the fixed 0.04 dielectric default
//! without changing its diffuse albedo (metals keep their albedo-tinted F0). The
//! shader recomputes `f0 = mix(min(0.04 * specularColor, 1) * specular, albedo,
//! metallic)` behind `const SPECULAR_EXT`. `bind` builds the standard define key +
//! sets `specular_enabled`, packs the base block + the specular scale /
//! linear-decoded specular color into the shared MaterialBlock (floats 32..35),
//! and binds through [`bind_wgpu_pbr_mesh_material`]. The specular strength/color
//! maps are reserved by the descriptor but NOT sampled on wgpu yet (maps
//! deferred).
//!
//! Cannot be visually captured without a GPU adapter; the GPU bind/draw path is
//! validated functionally (the parity matrix at the `wgpu` cell), matching the
//! sibling `flighthq-scene-gl` no-device test posture.

use flighthq_materials::specular_pbr_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::SpecularPbrMaterial;
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

/// The built-in Specular forward-lit mesh-material renderer.
pub struct SpecularPbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for SpecularPbrWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let specular = material.and_then(downcast_specular_pbr);
        let standard = specular.map(|s| &s.standard);

        let mut key = WgpuPbrDefineKey {
            alpha_mask_enabled: specular.is_some_and(|s| s.alpha_mode == MaterialAlphaMode::Mask),
            double_sided: specular.is_some_and(|s| s.double_sided),
            ..Default::default()
        };
        key.specular_enabled = true;

        let mut scratch = [0.0f32; MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(
            &mut scratch,
            standard,
            specular.map_or(0.5, |s| s.alpha_cutoff),
        );
        // specular group (floats 32..35): specular scale, specularColor.rgb (linear).
        if let Some(specular) = specular {
            let color = unpack_color_to_linear(specular.specular_color);
            scratch[32] = specular.specular;
            scratch[33] = color[0];
            scratch[34] = color[1];
            scratch[35] = color[2];
        } else {
            scratch[32] = 1.0;
            scratch[33] = 1.0;
            scratch[34] = 1.0;
            scratch[35] = 1.0;
        }

        let material_key = material.map_or_else(specular_pbr_material_kind, |m| m.kind());
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

/// Returns the singleton Specular renderer instance.
pub fn specular_pbr_wgpu_mesh_material_renderer() -> SpecularPbrWgpuMeshMaterialRenderer {
    SpecularPbrWgpuMeshMaterialRenderer
}

/// Registers the built-in Specular renderer for the Specular material kind on this
/// scene runtime. Opt-in (no top-level side effect): `draw_wgpu_scene` only draws
/// Specular subsets once this is called.
pub fn register_specular_pbr_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        specular_pbr_material_kind(),
        Box::new(SpecularPbrWgpuMeshMaterialRenderer),
    );
}

/// Downcasts a bound `&dyn Material` to the concrete [`SpecularPbrMaterial`] via the
/// `Material: Any` seam. Returns `None` for any other material (renderer packs the
/// neutral fallback).
fn downcast_specular_pbr(material: &dyn Material) -> Option<&SpecularPbrMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<SpecularPbrMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_specular_pbr_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_specular_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                specular_pbr_material_kind(),
                Box::new(SpecularPbrWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&specular_pbr_material_kind())
            );
        }
    }

    mod specular_pbr_wgpu_mesh_material_renderer {
        use super::*;

        #[test]
        fn returns_a_renderer_value() {
            let _renderer = specular_pbr_wgpu_mesh_material_renderer();
        }
    }
}
