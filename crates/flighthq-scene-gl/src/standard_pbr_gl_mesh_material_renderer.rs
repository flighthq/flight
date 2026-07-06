//! The built-in StandardPbr forward-lit mesh-material renderer.
//!
//! Ports `@flighthq/scene-gl` `standardPbrGlMeshMaterialRenderer.ts`. `bind`
//! selects the uber-shader variant for the material's maps/alpha mode, uploads the
//! shared per-run uniforms (camera view-projection + position, the packed light
//! block) via [`gl_pbr_standard_bind`](crate::gl_pbr_standard_bind), and the
//! material's `standard` block through the shared
//! [`bind_gl_pbr_standard_block`]. `draw` sets the per-draw model + normal matrices
//! and issues the indexed draw over the proxy's subset with depth-test LESS +
//! depth-write on and back-face culling unless the material is double-sided.

use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::pbr_material::{MaterialAlphaMode, StandardPbrMaterial};
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use glow::HasContext;

use crate::gl_mesh_material_registry::{GlMeshMaterialRenderer, MeshMaterial};
use crate::gl_pbr_prelude::GlPbrDefineKey;
use crate::gl_pbr_standard_bind::{bind_gl_pbr_mesh_common, build_gl_pbr_standard_define_key};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The built-in StandardPbr forward-lit mesh-material renderer
/// (`GlMeshMaterialRenderer` for the StandardPbr material kind). See
/// [`register_standard_pbr_gl_material`](crate::register_standard_pbr_gl_material)
/// to install it.
pub struct StandardPbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for StandardPbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let pbr = material.and_then(|m| m.as_standard_pbr());
        let standard = pbr.map(|p| &p.standard);
        let alpha_mask_enabled = pbr.is_some_and(|p| p.alpha_mode == MaterialAlphaMode::Mask);

        // StandardPbr sets no extension flag — the base variant.
        let key = build_gl_pbr_standard_define_key(standard, alpha_mask_enabled);
        bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            pbr.is_some_and(|p| p.double_sided),
            standard,
            alpha_cutoff(pbr),
            lights,
            camera,
        );
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

/// Sets the per-draw model + normal matrices on the active PBR program and issues
/// the indexed (or array) draw over the proxy's subset. The shared draw body for
/// StandardPbr and every extension renderer — the lobe uniforms differ at `bind`,
/// but the geometry draw is identical (ports the shared TS `drawGlMeshSubset`). A
/// no-op when no PBR program is active (bind was skipped).
pub fn draw_gl_pbr_mesh_subset(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    proxy: &SceneRenderProxy,
    upload: &GlMeshUpload,
) {
    let Some(program) = scene.active_pbr_program.clone() else {
        return;
    };
    let gl = &state.gl;
    unsafe {
        gl.uniform_matrix_4_f32_slice(program.loc_model.as_ref(), false, &proxy.world_matrix.m);
        gl.uniform_matrix_3_f32_slice(
            program.loc_normal_matrix.as_ref(),
            false,
            &proxy.normal_matrix.m,
        );

        let subset = proxy.subset;
        if upload.index_buffer.is_some() {
            let element_size = if upload.index_type == glow::UNSIGNED_INT {
                4
            } else {
                2
            };
            gl.draw_elements(
                glow::TRIANGLES,
                subset.index_count as i32,
                upload.index_type,
                (subset.index_offset * element_size) as i32,
            );
        } else {
            gl.draw_arrays(
                glow::TRIANGLES,
                subset.index_offset as i32,
                subset.index_count as i32,
            );
        }
    }
}

/// The alpha-cutoff to upload: the material's own cutoff, or the neutral `0.5`
/// default when no concrete material resolved. Mirrors the TS trailing
/// `gl.uniform1f(program.locAlphaCutoff, …)`.
fn alpha_cutoff(pbr: Option<&StandardPbrMaterial>) -> f32 {
    pbr.map_or(0.5, |p| p.alpha_cutoff)
}

/// The feature define key for the bound material: the alpha-mask flag plus the
/// standard-block map flags from the concrete `StandardPbrMaterial`. Re-exported for
/// tests and callers that build a StandardPbr key without a live GL context.
pub fn build_standard_pbr_define_key(
    pbr: Option<&StandardPbrMaterial>,
    alpha_mask_enabled: bool,
) -> GlPbrDefineKey {
    build_gl_pbr_standard_define_key(pbr.map(|p| &p.standard), alpha_mask_enabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The GL bind/draw path requires a live glow context (a real GPU/display), so
    // it is validated functionally (the parity matrix at the `gl` cell), not by a
    // unit test — matching `flighthq-render-gl`'s no-device test posture. The pure
    // material-read helpers are assertion-ported here.

    // build_standard_pbr_define_key

    #[test]
    fn build_standard_pbr_define_key_defaults_to_no_maps_no_alpha_mask() {
        let key = build_standard_pbr_define_key(None, false);
        assert_eq!(key, GlPbrDefineKey::default());
    }

    #[test]
    fn build_standard_pbr_define_key_reads_no_maps_from_the_default_material() {
        let material = StandardPbrMaterial::default();
        let key = build_standard_pbr_define_key(Some(&material), false);
        assert!(!key.has_base_color_map);
        assert!(!key.has_normal_map);
        assert!(!key.alpha_mask_enabled);
        assert!(!key.specular_enabled);
    }

    #[test]
    fn build_standard_pbr_define_key_enables_alpha_mask() {
        let material = StandardPbrMaterial::default();
        let key = build_standard_pbr_define_key(Some(&material), true);
        assert!(key.alpha_mask_enabled);
    }

    // alpha_cutoff

    #[test]
    fn alpha_cutoff_falls_back_to_the_neutral_default() {
        assert_eq!(alpha_cutoff(None), 0.5);
    }
}
