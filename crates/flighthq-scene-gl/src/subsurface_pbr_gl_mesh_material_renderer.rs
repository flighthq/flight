//! The built-in Subsurface forward-lit mesh-material renderer (Flight extension;
//! flagged non-interop — there is no glTF equivalent).
//!
//! Ports `@flighthq/scene-gl` `subsurfacePbrGlMeshMaterialRenderer.ts`. It
//! approximates subsurface scattering with a wrapped-diffuse term: light wrapping
//! past the terminator re-emerges tinted by `subsurface_color`, scaled by
//! `subsurface` strength and inversely by `thickness` (thinner material = more
//! translucency). This is a cheap stand-in for true diffusion-profile SSS — plausible
//! for skin, wax, marble, foliage at forward-pass cost — and lives behind `#define
//! SUBSURFACE` in the PBR uber-shader. `bind` composes the material's `standard`
//! block through the shared bind prologue and uploads the subsurface scalars +
//! linear-decoded subsurface color. The subsurface/thickness maps are reserved but
//! not yet sampled.

use flighthq_render_gl::GlRenderState;
use flighthq_types::SubsurfacePbrMaterial;
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

/// The built-in Subsurface forward-lit mesh-material renderer. See
/// [`register_subsurface_pbr_gl_material`] to install it.
pub struct SubsurfacePbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for SubsurfacePbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let subsurface = material.and_then(|m| m.as_subsurface_pbr());
        let standard = subsurface.map(|s| &s.standard);

        let mut key = build_gl_pbr_standard_define_key(
            standard,
            subsurface.is_some_and(|s| s.alpha_mode == MaterialAlphaMode::Mask),
        );
        key.subsurface_enabled = true;
        let program = bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            subsurface.is_some_and(|s| s.double_sided),
            standard,
            subsurface.map_or(0.5, |s| s.alpha_cutoff),
            lights,
            camera,
        );

        let gl = &state.gl;
        unsafe {
            if let Some(subsurface) = subsurface {
                let color = unpack_color_to_linear(subsurface.subsurface_color);
                gl.uniform_1_f32(program.loc_subsurface.as_ref(), subsurface.subsurface);
                gl.uniform_3_f32(
                    program.loc_subsurface_color.as_ref(),
                    color[0],
                    color[1],
                    color[2],
                );
                gl.uniform_1_f32(program.loc_thickness.as_ref(), subsurface.thickness);
            } else {
                gl.uniform_1_f32(program.loc_subsurface.as_ref(), 0.0);
                gl.uniform_3_f32(program.loc_subsurface_color.as_ref(), 1.0, 1.0, 1.0);
                gl.uniform_1_f32(program.loc_thickness.as_ref(), 0.0);
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

/// Installs the built-in Subsurface renderer for the Subsurface material kind on this
/// scene runtime. Opt-in (no top-level side effect): `draw_gl_scene` only draws
/// Subsurface subsets once this is called.
pub fn register_subsurface_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        KindId::of::<SubsurfacePbrMaterial>(),
        Box::new(SubsurfacePbrGlMeshMaterialRenderer),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // register_subsurface_pbr_gl_material

    #[test]
    fn register_subsurface_pbr_gl_material_registers_for_the_subsurface_kind() {
        let mut scene = create_gl_scene_runtime();
        register_subsurface_pbr_gl_material(&mut scene);
        assert!(
            get_gl_mesh_material_renderer(&scene, KindId::of::<SubsurfacePbrMaterial>()).is_some()
        );
    }
}
