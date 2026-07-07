//! The built-in Subsurface forward-lit mesh-material renderer (Flight extension;
//! flagged non-interop — there is no glTF equivalent) — the WGSL mirror of
//! `subsurface_pbr_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `subsurfacePbrWgpuMeshMaterialRenderer.ts`. It
//! approximates subsurface scattering with a wrapped-diffuse term: light wrapping
//! past the terminator re-emerges tinted by `subsurface_color`, scaled by
//! `subsurface` strength and inversely by `thickness` (thinner material = more
//! translucency). This is a cheap stand-in for true diffusion-profile SSS —
//! plausible for skin, wax, marble, foliage at forward-pass cost — and lives
//! behind `const SUBSURFACE` in the PBR uber-shader. `bind` builds the standard
//! define key + sets `subsurface_enabled`, packs the base block + the subsurface
//! scalars / linear-decoded subsurface color into the shared MaterialBlock (floats
//! 36..39, plus thickness at float 40), and binds through
//! [`bind_wgpu_pbr_mesh_material`]. The subsurface/thickness maps are reserved but
//! NOT sampled on wgpu yet (maps deferred).
//!
//! Cannot be visually captured without a GPU adapter; the GPU bind/draw path is
//! validated functionally (the parity matrix at the `wgpu` cell), matching the
//! sibling `flighthq-scene-gl` no-device test posture.

use flighthq_materials::subsurface_pbr_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::SubsurfacePbrMaterial;
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

/// The built-in Subsurface forward-lit mesh-material renderer.
pub struct SubsurfacePbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for SubsurfacePbrWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let subsurface = material.and_then(downcast_subsurface_pbr);
        let standard = subsurface.map(|s| &s.standard);

        let mut key = WgpuPbrDefineKey {
            alpha_mask_enabled: subsurface.is_some_and(|s| s.alpha_mode == MaterialAlphaMode::Mask),
            double_sided: subsurface.is_some_and(|s| s.double_sided),
            ..Default::default()
        };
        key.subsurface_enabled = true;

        let mut scratch = [0.0f32; MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(
            &mut scratch,
            standard,
            subsurface.map_or(0.5, |s| s.alpha_cutoff),
        );
        // subsurface group (floats 36..39): strength, subsurfaceColor.rgb (linear); thickness at 40.
        if let Some(subsurface) = subsurface {
            let color = unpack_color_to_linear(subsurface.subsurface_color);
            scratch[36] = subsurface.subsurface;
            scratch[37] = color[0];
            scratch[38] = color[1];
            scratch[39] = color[2];
            scratch[40] = subsurface.thickness;
        } else {
            scratch[36] = 0.0;
            scratch[37] = 1.0;
            scratch[38] = 1.0;
            scratch[39] = 1.0;
            scratch[40] = 0.0;
        }

        let material_key = material.map_or_else(subsurface_pbr_material_kind, |m| m.kind());
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

/// Returns the singleton Subsurface renderer instance.
pub fn subsurface_pbr_wgpu_mesh_material_renderer() -> SubsurfacePbrWgpuMeshMaterialRenderer {
    SubsurfacePbrWgpuMeshMaterialRenderer
}

/// Registers the built-in Subsurface renderer for the Subsurface material kind on
/// this scene runtime. Opt-in (no top-level side effect): `draw_wgpu_scene` only
/// draws Subsurface subsets once this is called.
pub fn register_subsurface_pbr_wgpu_material(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        subsurface_pbr_material_kind(),
        Box::new(SubsurfacePbrWgpuMeshMaterialRenderer),
    );
}

/// Downcasts a bound `&dyn Material` to the concrete [`SubsurfacePbrMaterial`] via
/// the `Material: Any` seam. Returns `None` for any other material.
fn downcast_subsurface_pbr(material: &dyn Material) -> Option<&SubsurfacePbrMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<SubsurfacePbrMaterial>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_subsurface_pbr_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_subsurface_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                subsurface_pbr_material_kind(),
                Box::new(SubsurfacePbrWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&subsurface_pbr_material_kind())
            );
        }
    }

    mod subsurface_pbr_wgpu_mesh_material_renderer {
        use super::*;

        #[test]
        fn returns_a_renderer_value() {
            let _renderer = subsurface_pbr_wgpu_mesh_material_renderer();
        }
    }
}
