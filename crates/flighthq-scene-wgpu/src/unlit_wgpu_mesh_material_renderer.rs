//! The built-in Unlit forward mesh-material renderer — the WGSL mirror of
//! `unlit_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `unlitWgpuMeshMaterialRenderer.ts`.
//! Lighting-independent flat color: `bind` selects the unlit pipeline variant for the
//! alpha mode + color format, writes the shared Frame uniform (lights ignored), and
//! binds the linear base color at group(2); `draw` issues the indexed draw. Maps are
//! deferred on wgpu.

use flighthq_materials::unlit_material_kind;
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::unlit_material::UnlitMaterial;

use crate::wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, register_wgpu_mesh_material_renderer,
};
use crate::wgpu_mesh_pipeline::{
    draw_wgpu_mesh_material_subset, unpack_color_to_linear_f32, write_wgpu_frame_uniform,
};
use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};
use crate::wgpu_unlit_prelude::{
    WgpuUnlitDefineKey, bind_wgpu_unlit_surface, ensure_wgpu_unlit_pipeline,
};

/// The built-in Unlit forward mesh-material renderer.
pub struct UnlitWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for UnlitWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        _lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let unlit = material.and_then(downcast_unlit);
        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let cache_key = ensure_wgpu_unlit_pipeline(state, scene, &define_key(unlit), format);
        scene.active_pipeline_key = Some(cache_key.clone());
        write_wgpu_frame_uniform(state, scene, camera, _lights);

        let material_key = material.map_or_else(unlit_material_kind, |m| m.kind());
        let (color, alpha_cutoff) = match unlit {
            Some(m) => (unpack_color_to_linear_f32(m.base_color), m.alpha_cutoff),
            None => (WHITE, 0.5),
        };
        bind_wgpu_unlit_surface(
            state,
            scene,
            &cache_key,
            material_key,
            &color,
            1.0,
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

/// Returns the singleton Unlit renderer instance.
pub fn unlit_wgpu_mesh_material_renderer() -> UnlitWgpuMeshMaterialRenderer {
    UnlitWgpuMeshMaterialRenderer
}

/// Registers the built-in Unlit renderer for the Unlit material kind on this scene
/// runtime. Opt-in (no top-level side effect).
pub fn register_unlit_wgpu_material(state: &mut WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    register_wgpu_mesh_material_renderer(
        state,
        scene,
        unlit_material_kind(),
        Box::new(UnlitWgpuMeshMaterialRenderer),
    );
}

fn define_key(material: Option<&UnlitMaterial>) -> WgpuUnlitDefineKey {
    WgpuUnlitDefineKey {
        alpha_mask_enabled: material.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|m| m.double_sided),
        has_color_map: false,
    }
}

fn downcast_unlit(material: &dyn Material) -> Option<&UnlitMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<UnlitMaterial>()
}

const WHITE: [f32; 4] = [1.0, 1.0, 1.0, 1.0];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wgpu_scene_runtime::create_wgpu_scene_runtime;

    mod register_unlit_wgpu_material {
        use super::*;

        #[test]
        fn registers_the_renderer_under_the_unlit_kind() {
            let mut scene = create_wgpu_scene_runtime();
            scene.material_registry.insert(
                unlit_material_kind(),
                Box::new(UnlitWgpuMeshMaterialRenderer),
            );
            assert!(scene.material_registry.contains_key(&unlit_material_kind()));
        }
    }
}
