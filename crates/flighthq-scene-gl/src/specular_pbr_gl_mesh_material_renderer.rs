//! The built-in Specular (KHR_materials_specular) forward-lit mesh-material
//! renderer.
//!
//! Ports `@flighthq/scene-gl` `specularPbrGlMeshMaterialRenderer.ts`. This extension
//! gives independent control of a dielectric's specular reflection: `specular`
//! scales the base reflectance and `specular_color` tints F0, letting a surface be
//! more or less reflective than the fixed 0.04 dielectric default without changing
//! its diffuse albedo (metals keep their albedo-tinted F0). The shader recomputes
//! `f0 = mix(min(0.04 * specularColor, 1) * specular, albedo, metallic)` behind
//! `#define SPECULAR_EXT`. `bind` composes the material's `standard` block through
//! the shared bind prologue and uploads the specular scale + linear-decoded specular
//! color. The specular strength/color maps are reserved by the descriptor but not
//! yet sampled.

use flighthq_render_gl::GlRenderState;
use flighthq_types::SpecularPbrMaterial;
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

/// The built-in Specular forward-lit mesh-material renderer. See
/// [`register_specular_pbr_gl_material`] to install it.
pub struct SpecularPbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for SpecularPbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let specular = material.and_then(|m| m.as_specular_pbr());
        let standard = specular.map(|s| &s.standard);

        let mut key = build_gl_pbr_standard_define_key(
            standard,
            specular.is_some_and(|s| s.alpha_mode == MaterialAlphaMode::Mask),
        );
        key.specular_enabled = true;
        let program = bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            specular.is_some_and(|s| s.double_sided),
            standard,
            specular.map_or(0.5, |s| s.alpha_cutoff),
            lights,
            camera,
        );

        let gl = &state.gl;
        unsafe {
            if let Some(specular) = specular {
                let color = unpack_color_to_linear(specular.specular_color);
                gl.uniform_1_f32(program.loc_specular.as_ref(), specular.specular);
                gl.uniform_3_f32(
                    program.loc_specular_color.as_ref(),
                    color[0],
                    color[1],
                    color[2],
                );
            } else {
                gl.uniform_1_f32(program.loc_specular.as_ref(), 1.0);
                gl.uniform_3_f32(program.loc_specular_color.as_ref(), 1.0, 1.0, 1.0);
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

/// Installs the built-in Specular renderer for the Specular material kind on this
/// scene runtime. Opt-in (no top-level side effect): `draw_gl_scene` only draws
/// Specular subsets once this is called.
pub fn register_specular_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        KindId::of::<SpecularPbrMaterial>(),
        Box::new(SpecularPbrGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_specular_pbr_gl_material

    #[test]
    fn register_specular_pbr_gl_material_registers_for_the_specular_kind() {
        let mut scene = create_gl_scene_runtime();
        register_specular_pbr_gl_material(&mut scene);
        assert!(
            get_gl_mesh_material_renderer(&scene, KindId::of::<SpecularPbrMaterial>()).is_some()
        );
    }
}
