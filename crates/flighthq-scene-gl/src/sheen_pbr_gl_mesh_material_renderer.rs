//! The built-in Sheen (KHR_materials_sheen) forward-lit mesh-material renderer.
//!
//! Ports `@flighthq/scene-gl` `sheenPbrGlMeshMaterialRenderer.ts`. Sheen adds a
//! retroreflective Charlie ("inverted GGX") lobe on top of the base specular — the
//! soft grazing-angle glow of velvet, satin, and other cloth — tinted by
//! `sheen_color` and widened by `sheen_roughness`. `bind` composes the material's
//! `standard` block through the shared bind prologue and then uploads the sheen
//! color/roughness; the lobe lives behind `#define SHEEN` in the PBR uber-shader.
//! The packed sRGB `sheen_color` is decoded to linear on the CPU
//! (`unpack_color_to_linear`), matching the linear HDR radiance output. The sheen
//! maps are reserved by the descriptor but not yet sampled here.

use flighthq_render_gl::GlRenderState;
use flighthq_types::SheenPbrMaterial;
use flighthq_types::camera::Camera;
use flighthq_types::kind::KindId;
use flighthq_types::pbr_material::MaterialAlphaMode;
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_pbr_standard_bind::{
    bind_gl_pbr_mesh_common, build_gl_pbr_standard_define_key, unpack_color_to_linear,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};
use crate::standard_pbr_gl_mesh_material_renderer::draw_gl_pbr_mesh_subset;

/// The built-in Sheen forward-lit mesh-material renderer. See
/// [`register_sheen_pbr_gl_material`] to install it.
pub struct SheenPbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for SheenPbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let sheen = material.and_then(|m| m.as_sheen_pbr());
        let standard = sheen.map(|s| &s.standard);

        let mut key = build_gl_pbr_standard_define_key(
            standard,
            sheen.is_some_and(|s| s.alpha_mode == MaterialAlphaMode::Mask),
        );
        key.sheen_enabled = true;
        let program = bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            sheen.is_some_and(|s| s.double_sided),
            standard,
            sheen.map_or(0.5, |s| s.alpha_cutoff),
            lights,
            camera,
        );

        let gl = &state.gl;
        unsafe {
            if let Some(sheen) = sheen {
                let color = unpack_color_to_linear(sheen.sheen_color);
                gl.uniform_3_f32(
                    program.loc_sheen_color.as_ref(),
                    color[0],
                    color[1],
                    color[2],
                );
                gl.uniform_1_f32(program.loc_sheen_roughness.as_ref(), sheen.sheen_roughness);
            } else {
                gl.uniform_3_f32(program.loc_sheen_color.as_ref(), 0.0, 0.0, 0.0);
                gl.uniform_1_f32(program.loc_sheen_roughness.as_ref(), 0.0);
            }
        }
    }

    fn draw(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &GlMeshUpload,
    ) {
        draw_gl_pbr_mesh_subset(state, scene, proxy, upload);
    }
}

/// Installs the built-in Sheen renderer for the Sheen material kind on this scene
/// runtime. Opt-in (no top-level side effect): `draw_gl_scene` only draws Sheen
/// subsets once this is called.
pub fn register_sheen_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        KindId::of::<SheenPbrMaterial>(),
        Box::new(SheenPbrGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_sheen_pbr_gl_material

    #[test]
    fn register_sheen_pbr_gl_material_registers_for_the_sheen_kind() {
        let mut scene = create_gl_scene_runtime();
        register_sheen_pbr_gl_material(&mut scene);
        assert!(get_gl_mesh_material_renderer(&scene, KindId::of::<SheenPbrMaterial>()).is_some());
    }
}
