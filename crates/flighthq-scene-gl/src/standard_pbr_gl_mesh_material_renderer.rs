//! The built-in StandardPbr forward-lit mesh-material renderer.
//!
//! Ports `@flighthq/scene-gl` `standardPbrGlMeshMaterialRenderer.ts`. `bind`
//! selects the uber-shader variant for the material's maps/alpha mode, uploads the
//! shared per-run uniforms (camera view-projection + position, the packed light
//! block), and the material's scalar/color uniforms and textures. `draw` sets the
//! per-draw model + normal matrices and issues the indexed draw over the proxy's
//! subset with depth-test LESS + depth-write on and back-face culling unless the
//! material is double-sided.
//!
//! TS↔Rust divergence — the material-uniform/texture path is partially stubbed.
//! The TS renderer reads a `StandardPbrMaterial` (baseColor/metallic/roughness/
//! emissive/maps) and `unpackColorToLinear`, neither of which is ported to the
//! Rust `flighthq-materials` / `flighthq-types` crates yet. So `bind` here uploads
//! only the untextured StandardPbr defaults (the TS `material === null` branch),
//! which is correct for the default-kind path; the concrete-material reads and
//! texture binds are left as // TODO(align). The program selection, depth/cull
//! state, camera, and light-block uploads, and the indexed draw are 1:1.

use flighthq_camera::get_camera_view_projection_matrix4;
use flighthq_geometry::{get_matrix4_position, inverse_matrix4};
use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Projection;
use flighthq_types::geometry::{Matrix4Like, Vector3Like};
use flighthq_types::kind::KindId;
use glow::HasContext;

use crate::gl_mesh_material_registry::{GlMeshMaterialRenderer, MeshMaterial};
use crate::gl_pbr_prelude::GlPbrDefineKey;
use crate::gl_pbr_program_cache::{GlPbrProgram, ensure_gl_pbr_program};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};
use crate::scene_render_contract::{Camera, SceneLightBlock, SceneRenderProxy};

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
        let program = ensure_gl_pbr_program(&state.gl, scene, &define_key_for_material(material));
        scene.active_pbr_program = Some(program.clone());

        let gl = &state.gl;
        unsafe {
            gl.use_program(Some(program.program));

            // The render-effect pipeline owns enabling depth + binding the rgba16f
            // scene target; this renderer only fixes the test function/write and
            // per-material cull, so a caller invoking draw without the full pipeline
            // still gets correct occlusion.
            gl.enable(glow::DEPTH_TEST);
            gl.depth_func(glow::LESS);
            gl.depth_mask(true);

            if is_double_sided(material) {
                gl.disable(glow::CULL_FACE);
            } else {
                gl.enable(glow::CULL_FACE);
                gl.cull_face(glow::BACK);
            }

            bind_gl_pbr_camera(gl, &program, camera);
            bind_gl_pbr_lights(gl, &program, lights);
            bind_gl_pbr_material_uniforms(gl, &program, material);
        }
    }

    fn draw(
        &self,
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
            gl.uniform_matrix_4_f32_slice(program.loc_model.as_ref(), false, &proxy.world_matrix);
            gl.uniform_matrix_3_f32_slice(
                program.loc_normal_matrix.as_ref(),
                false,
                &proxy.normal_matrix,
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
}

/// The `KindId` the StandardPbr renderer registers against.
///
/// // TODO(align): switch to `flighthq_types::StandardPbrMaterialKind` once the PBR
/// material is ported. Until then the kind is the local marker type's id.
pub fn standard_pbr_material_kind() -> KindId {
    KindId::of::<StandardPbrMaterialKindMarker>()
}

/// Local marker backing `standard_pbr_material_kind`. // TODO(align): remove once
/// the header defines `StandardPbrMaterialKind`.
struct StandardPbrMaterialKindMarker;

/// The feature define key for the bound material. With the StandardPbr material
/// type unported, only the no-maps / no-alpha-mask key is selectable.
///
/// // TODO(align): derive `alpha_mask_enabled` / `has_*_map` from the concrete
/// `StandardPbrMaterial` once it is ported.
fn define_key_for_material(_material: Option<&dyn MeshMaterial>) -> GlPbrDefineKey {
    GlPbrDefineKey::default()
}

/// Whether the bound material disables back-face culling.
///
/// // TODO(align): read `material.double_sided` once `StandardPbrMaterial` is
/// ported. The default-kind fallback is single-sided.
fn is_double_sided(_material: Option<&dyn MeshMaterial>) -> bool {
    false
}

/// # Safety
/// The GL context must be current and `program` in use.
unsafe fn bind_gl_pbr_camera(gl: &glow::Context, program: &GlPbrProgram, camera: &Camera) {
    let aspect = match &camera.projection {
        Projection::Perspective(p) => {
            if p.aspect != 0.0 {
                p.aspect
            } else {
                1.0
            }
        }
        Projection::Orthographic(_) => 1.0,
    };
    let mut view_projection = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut view_projection, camera, aspect);
    unsafe {
        gl.uniform_matrix_4_f32_slice(
            program.loc_view_projection.as_ref(),
            false,
            &view_projection.m,
        );
    }

    // Camera world position = translation of the inverse view matrix (view is
    // world->view).
    let mut inverse_view = Matrix4Like::default();
    let view_like = Matrix4Like { m: camera.view.m };
    inverse_matrix4(&mut inverse_view, &view_like);
    let mut camera_position = Vector3Like::default();
    get_matrix4_position(&mut camera_position, &inverse_view);
    unsafe {
        gl.uniform_3_f32(
            program.loc_camera_position.as_ref(),
            camera_position.x,
            camera_position.y,
            camera_position.z,
        );
    }
}

/// Uploads the packed light block to the directional/ambient uniforms. The block
/// layout (std140) matches `SceneLightBlock.data`: directional
/// `{ direction.xyz @0, _pad, radiance.rgb @4, _pad }` then ambient
/// `{ radiance.rgb @8, _pad }`. Radiance is already linear, premultiplied by
/// intensity.
///
/// # Safety
/// The GL context must be current and `program` in use.
unsafe fn bind_gl_pbr_lights(gl: &glow::Context, program: &GlPbrProgram, lights: &SceneLightBlock) {
    let data = &lights.data;
    unsafe {
        gl.uniform_4_f32(
            program.loc_directional.as_ref(),
            data[0],
            data[1],
            data[2],
            0.0,
        );
        gl.uniform_4_f32(
            program.loc_directional_radiance.as_ref(),
            data[4],
            data[5],
            data[6],
            0.0,
        );
        gl.uniform_3_f32(
            program.loc_ambient_radiance.as_ref(),
            data[8],
            data[9],
            data[10],
        );
        gl.uniform_1_f32(
            program.loc_directional_count.as_ref(),
            lights.directional_count as f32,
        );
        gl.uniform_1_f32(
            program.loc_ambient_count.as_ref(),
            lights.ambient_count as f32,
        );
    }
}

/// Uploads the StandardPbr scalar/color material uniforms. Currently uploads the
/// untextured StandardPbr defaults (the TS `material === null` branch).
///
/// // TODO(align): read the concrete `StandardPbrMaterial` (baseColor/metallic/
/// roughness/normalScale/emissive/emissiveStrength/alphaCutoff via
/// `unpackColorToLinear`) and bind its base-color / normal textures once the PBR
/// material is ported.
///
/// # Safety
/// The GL context must be current and `program` in use.
unsafe fn bind_gl_pbr_material_uniforms(
    gl: &glow::Context,
    program: &GlPbrProgram,
    _material: Option<&dyn MeshMaterial>,
) {
    unsafe {
        gl.uniform_4_f32(program.loc_base_color.as_ref(), 1.0, 1.0, 1.0, 1.0);
        gl.uniform_1_f32(program.loc_metallic.as_ref(), 0.0);
        gl.uniform_1_f32(program.loc_roughness.as_ref(), 1.0);
        gl.uniform_1_f32(program.loc_normal_scale.as_ref(), 1.0);
        gl.uniform_3_f32(program.loc_emissive.as_ref(), 0.0, 0.0, 0.0);
        gl.uniform_1_f32(program.loc_emissive_strength.as_ref(), 1.0);
        gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), 0.5);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // standard_pbr_material_kind / define_key_for_material — the GL bind/draw path
    // requires a live glow context (a real GPU/display), so it is validated
    // functionally (the parity matrix at the `gl` cell), not by a unit test —
    // matching `flighthq-render-gl`'s no-device test posture.

    #[test]
    fn standard_pbr_material_kind_is_stable() {
        assert_eq!(standard_pbr_material_kind(), standard_pbr_material_kind());
    }

    #[test]
    fn define_key_for_material_defaults_to_no_maps_no_alpha_mask() {
        // The default-kind path with no concrete material selects the base variant.
        let key = define_key_for_material(None);
        assert_eq!(key, GlPbrDefineKey::default());
    }

    // is_double_sided defaults to single-sided for the default-kind fallback.
    #[test]
    fn is_double_sided_defaults_false() {
        assert!(!is_double_sided(None));
    }

    // Keep DefaultMaterialKind in the dependency graph for the // TODO(align) swap.
    #[allow(dead_code)]
    fn _default_material_kind() -> KindId {
        KindId::of::<flighthq_types::material::DefaultMaterialKind>()
    }
}
