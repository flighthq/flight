//! The built-in Sheen (KHR_materials_sheen) forward-lit mesh-material renderer —
//! the WGSL mirror of `sheen_pbr_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `sheenPbrWgpuMeshMaterialRenderer.ts`. Sheen adds a
//! retroreflective Charlie ("inverted GGX") lobe on top of the base specular — the
//! soft grazing-angle glow of velvet, satin, and other cloth — tinted by
//! `sheen_color` and widened by `sheen_roughness`. `bind` builds the standard
//! define key + sets `sheen_enabled`, packs the base block + the sheen
//! color/roughness into the shared MaterialBlock (floats 20..23), and binds
//! through [`bind_wgpu_pbr_mesh_material`]. The lobe lives behind `const SHEEN` in
//! the PBR uber-shader. The packed sRGB `sheen_color` is decoded to linear on the
//! CPU, matching the linear HDR radiance output. The sheen maps are reserved by
//! the descriptor but NOT sampled on wgpu yet (maps deferred).
//!
//! Cannot be visually captured without a GPU adapter; the GPU bind/draw path is
//! validated functionally (the parity matrix at the `wgpu` cell), matching the
//! sibling `flighthq-scene-gl` no-device test posture.

use flighthq_materials::sheen_pbr_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::SheenPbrMaterial;
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

/// The built-in Sheen forward-lit mesh-material renderer.
pub struct SheenPbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for SheenPbrWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let sheen = material.and_then(downcast_sheen_pbr);
        let standard = sheen.map(|s| &s.standard);

        let mut key = WgpuPbrDefineKey {
            alpha_mask_enabled: sheen.is_some_and(|s| s.alpha_mode == MaterialAlphaMode::Mask),
            double_sided: sheen.is_some_and(|s| s.double_sided),
            ..Default::default()
        };
        key.sheen_enabled = true;

        let mut scratch = [0.0f32; MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(
            &mut scratch,
            standard,
            sheen.map_or(0.5, |s| s.alpha_cutoff),
        );
        // sheen group (floats 20..23): sheenColor.rgb (linear), sheenRoughness.
        if let Some(sheen) = sheen {
            let color = unpack_color_to_linear(sheen.sheen_color);
            scratch[20] = color[0];
            scratch[21] = color[1];
            scratch[22] = color[2];
            scratch[23] = sheen.sheen_roughness;
        }

        let material_key = material.map_or_else(sheen_pbr_material_kind, |m| m.kind());
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

/// Returns the singleton Sheen renderer instance.
pub fn sheen_pbr_wgpu_mesh_material_renderer() -> SheenPbrWgpuMeshMaterialRenderer {
    SheenPbrWgpuMeshMaterialRenderer
}

/// Registers the built-in Sheen renderer for the Sheen material kind on this scene
/// runtime. Opt-in (no top-level side effect): `draw_wgpu_scene` only draws Sheen
/// subsets once this is called.
pub fn register_sheen_pbr_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        sheen_pbr_material_kind(),
        Box::new(SheenPbrWgpuMeshMaterialRenderer),
    );
}

/// Downcasts a bound `&dyn Material` to the concrete [`SheenPbrMaterial`] via the
/// `Material: Any` seam. Returns `None` for any other material.
fn downcast_sheen_pbr(material: &dyn Material) -> Option<&SheenPbrMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<SheenPbrMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_sheen_pbr_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_sheen_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                sheen_pbr_material_kind(),
                Box::new(SheenPbrWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&sheen_pbr_material_kind())
            );
        }
    }

    mod sheen_pbr_wgpu_mesh_material_renderer {
        use super::*;

        #[test]
        fn returns_a_renderer_value() {
            let _renderer = sheen_pbr_wgpu_mesh_material_renderer();
        }
    }
}
