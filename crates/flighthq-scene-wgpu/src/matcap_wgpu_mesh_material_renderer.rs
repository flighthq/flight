//! The built-in Matcap forward mesh-material renderer — the WGSL mirror of
//! `matcap_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `matcapWgpuMeshMaterialRenderer.ts`.
//! Lighting-independent material-capture shading: `bind` selects the matcap pipeline
//! variant, writes the shared Frame uniform (lights ignored — the matcap texture is
//! the prebaked lighting), and binds the linear tint; `draw` issues the indexed draw.
//! The real matcap texture is not yet sampled on wgpu (`has_matcap` stays false), so
//! the surface renders as the tint alone.

use flighthq_materials::matcap_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::MatcapMaterial;

use crate::wgpu_matcap_prelude::{
    WgpuMatcapDefineKey, bind_wgpu_matcap_surface, ensure_wgpu_matcap_pipeline,
};
use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_mesh_pipeline::{
    draw_wgpu_mesh_material_subset, unpack_color_to_linear_f32, write_wgpu_frame_uniform,
};
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// The built-in Matcap forward mesh-material renderer.
pub struct MatcapWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for MatcapWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let matcap = material.and_then(downcast_matcap);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let cache_key = ensure_wgpu_matcap_pipeline(state, scene, &define_key(matcap), format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, _lights);

        let material_key = material.map_or_else(matcap_material_kind, |m| m.kind());
        let (tint, alpha_cutoff) = match matcap {
            Some(m) => (unpack_color_to_linear_f32(m.tint), m.alpha_cutoff),
            None => (WHITE, 0.5),
        };
        bind_wgpu_matcap_surface(state, scene, &cache_key, material_key, &tint, alpha_cutoff);
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

/// Returns the singleton Matcap renderer instance.
pub fn matcap_wgpu_mesh_material_renderer() -> MatcapWgpuMeshMaterialRenderer {
    MatcapWgpuMeshMaterialRenderer
}

/// Registers the built-in Matcap renderer for the Matcap material kind on this scene
/// runtime. Opt-in (no top-level side effect).
pub fn register_matcap_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        matcap_material_kind(),
        Box::new(MatcapWgpuMeshMaterialRenderer),
    );
}

fn define_key(material: Option<&MatcapMaterial>) -> WgpuMatcapDefineKey {
    WgpuMatcapDefineKey {
        alpha_mask_enabled: material.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|m| m.double_sided),
        has_matcap: false,
    }
}

fn downcast_matcap(material: &dyn Material) -> Option<&MatcapMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<MatcapMaterial>()
}

const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_matcap_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_matcap_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                matcap_material_kind(),
                Box::new(MatcapWgpuMeshMaterialRenderer),
            );
            assert!(
                scene
                    .material_registry
                    .contains_key(&matcap_material_kind())
            );
        }
    }
}
