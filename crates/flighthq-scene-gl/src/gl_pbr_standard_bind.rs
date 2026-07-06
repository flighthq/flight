//! The shared StandardPbr material-properties block bind + define-key builder, and
//! the shared camera / light-block uploads every PBR mesh-material renderer reuses.
//!
//! Ports the reusable half of `@flighthq/scene-gl` `glPbrStandardBlock.ts` (the
//! `bindGlPbrStandardBlock` / `buildGlPbrStandardDefineKey` / `bindGlPbrStandardTexture`
//! / `isGlTextureReady` surface) plus the `glMeshProgram` / `glLitProgram` camera and
//! light uploads. The StandardPbr renderer passes the material itself (it IS a
//! properties block); each extension renderer passes `material.standard` and then ORs
//! in its own extension flag / uploads its own lobe uniforms. Keeping the map-present
//! test and the block upload in one place means the compiled variant and the bound
//! textures never disagree.
//!
//! TS↔Rust divergence: `unpack_color_to_linear` is ported locally below rather than
//! imported from `flighthq-materials` — the materials crate's color helpers
//! (`LinearColor` / `unpack_color_to_linear`) are not yet wired into its compiled
//! surface, matching the local copy the StandardPbr renderer already carried.

use flighthq_camera::get_camera_view_projection_matrix4;
use flighthq_geometry::{get_matrix4_position, inverse_matrix4};
use flighthq_render_gl::{GlRenderState, bind_gl_texture};
use flighthq_types::camera::{Camera, Projection};
use flighthq_types::geometry::{Matrix4Like, Vector3Like};
use flighthq_types::pbr_material::StandardPbrMaterialProperties;
use flighthq_types::scene_render::SceneLightBlock;
use flighthq_types::texture::Texture;
use glow::HasContext;

use crate::gl_pbr_prelude::GlPbrDefineKey;
use crate::gl_pbr_program_cache::{GlPbrProgram, ensure_gl_pbr_program};
use crate::gl_scene_runtime::GlSceneRuntime;

/// The texture unit the StandardPbr base-color map binds to. Units 0–4 are reserved
/// for the standard maps so every PBR program (StandardPbr and every extension) binds
/// them at the same slots; extension renderers bind their own maps at
/// [`GL_PBR_EXTENSION_TEXTURE_UNIT`] and above.
pub const GL_PBR_BASE_COLOR_TEXTURE_UNIT: u32 = 0;
/// The texture unit the StandardPbr normal map binds to.
pub const GL_PBR_NORMAL_TEXTURE_UNIT: u32 = 1;
/// The texture unit the metallic-roughness map binds to.
pub const GL_PBR_METALLIC_ROUGHNESS_TEXTURE_UNIT: u32 = 2;
/// The texture unit the occlusion map binds to.
pub const GL_PBR_OCCLUSION_TEXTURE_UNIT: u32 = 3;
/// The texture unit the emissive map binds to.
pub const GL_PBR_EMISSIVE_TEXTURE_UNIT: u32 = 4;
/// The first texture unit free for an extension's own maps, past the five standard
/// units. Extension renderers number their maps from here.
pub const GL_PBR_EXTENSION_TEXTURE_UNIT: u32 = 5;

/// The shared bind prologue every PBR mesh-material renderer runs before uploading
/// its own lobe uniforms: resolves/compiles the program for `key`, records it as the
/// scene's active PBR program, selects it, fixes depth-test LESS + depth-write and
/// per-material cull (double-sided disables culling), uploads the camera + light
/// block, uploads the shared `standard` material block, and uploads the alpha cutoff.
/// Returns the active program so the caller can upload its extension lobe uniforms.
///
/// StandardPbr calls this with `key` as built by [`build_gl_pbr_standard_define_key`];
/// each extension renderer sets its own flag on that key first. Mirrors the TS
/// `beginGlMeshDraw` + `setGlMeshViewProjection`/`setGlMeshCameraPosition` +
/// `bindGlMeshLightBlock` + `bindGlPbrStandardBlock` + `uniform1f(locAlphaCutoff, …)`
/// prologue every extension renderer shares.
#[allow(clippy::too_many_arguments)]
pub fn bind_gl_pbr_mesh_common(
    state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    key: &GlPbrDefineKey,
    double_sided: bool,
    standard: Option<&StandardPbrMaterialProperties>,
    alpha_cutoff: f32,
    lights: &SceneLightBlock,
    camera: &Camera,
) -> GlPbrProgram {
    let program = ensure_gl_pbr_program(&state.gl, scene, key);
    scene.active_pbr_program = Some(program.clone());

    {
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

            if double_sided {
                gl.disable(glow::CULL_FACE);
            } else {
                gl.enable(glow::CULL_FACE);
                gl.cull_face(glow::BACK);
            }

            bind_gl_pbr_camera(gl, &program, camera);
            bind_gl_pbr_lights(gl, &program, lights);
        }
    }

    // The standard block's texture binds need &mut GlRenderState (the texture cache),
    // so they run after the &state.gl borrow above is released.
    bind_gl_pbr_standard_block(state, &program, standard);
    unsafe {
        state
            .gl
            .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff);
    }

    program
}

/// Uploads the packed light block to the directional/ambient uniforms. The block
/// layout (std140) matches `SceneLightBlock.data`: directional
/// `{ direction.xyz @0, _pad, radiance.rgb @4, _pad }` then ambient
/// `{ radiance.rgb @8, _pad }`. Radiance is already linear, premultiplied by
/// intensity. Ports `bindGlMeshLightBlock`.
///
/// # Safety
/// The GL context must be current and `program` in use.
pub unsafe fn bind_gl_pbr_lights(
    gl: &glow::Context,
    program: &GlPbrProgram,
    lights: &SceneLightBlock,
) {
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

/// Uploads the camera view-projection and world position. Ports
/// `setGlMeshViewProjection` + `setGlMeshCameraPosition`.
///
/// # Safety
/// The GL context must be current and `program` in use.
pub unsafe fn bind_gl_pbr_camera(gl: &glow::Context, program: &GlPbrProgram, camera: &Camera) {
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

/// Uploads the full [`StandardPbrMaterialProperties`] block to a PBR program: the
/// base-color/metallic/roughness/normal/occlusion/emissive scalars and colors, plus
/// each present map bound at its fixed standard texture unit (0–4). A `None` block
/// uploads neutral defaults (white base color, dielectric, fully rough) so a missing
/// material renders plausibly. Packed colors are decoded to linear on the CPU here;
/// sampled albedo/emissive textures are sRGB-decoded in GLSL, so nothing is
/// double-decoded. The alpha-cutoff uniform is NOT part of the block — it lives on the
/// SurfaceMaterial trailer, so each renderer uploads it from the material after this
/// call. Ports `bindGlPbrStandardBlock`.
///
/// The `&state.gl` borrow ends before the texture binds (which need `&mut
/// GlRenderState` for the texture cache), so the scalar uploads and the texture binds
/// run in two phases, matching the StandardPbr renderer's split.
pub fn bind_gl_pbr_standard_block(
    state: &mut GlRenderState,
    program: &GlPbrProgram,
    standard: Option<&StandardPbrMaterialProperties>,
) {
    {
        let gl = &state.gl;
        unsafe {
            let Some(standard) = standard else {
                gl.uniform_4_f32(program.loc_base_color.as_ref(), 1.0, 1.0, 1.0, 1.0);
                gl.uniform_1_f32(program.loc_metallic.as_ref(), 0.0);
                gl.uniform_1_f32(program.loc_roughness.as_ref(), 1.0);
                gl.uniform_1_f32(program.loc_normal_scale.as_ref(), 1.0);
                gl.uniform_3_f32(program.loc_emissive.as_ref(), 0.0, 0.0, 0.0);
                gl.uniform_1_f32(program.loc_emissive_strength.as_ref(), 1.0);
                gl.uniform_1_f32(program.loc_occlusion_strength.as_ref(), 1.0);
                return;
            };

            let base = unpack_color_to_linear(standard.base_color);
            gl.uniform_4_f32(
                program.loc_base_color.as_ref(),
                base[0],
                base[1],
                base[2],
                base[3],
            );
            gl.uniform_1_f32(program.loc_metallic.as_ref(), standard.metallic);
            gl.uniform_1_f32(program.loc_roughness.as_ref(), standard.roughness);
            gl.uniform_1_f32(program.loc_normal_scale.as_ref(), standard.normal_scale);
            gl.uniform_1_f32(
                program.loc_occlusion_strength.as_ref(),
                standard.occlusion_strength,
            );

            let emissive = unpack_color_to_linear(standard.emissive);
            gl.uniform_3_f32(
                program.loc_emissive.as_ref(),
                emissive[0],
                emissive[1],
                emissive[2],
            );
            gl.uniform_1_f32(
                program.loc_emissive_strength.as_ref(),
                standard.emissive_strength,
            );
        }
    }

    let Some(standard) = standard else { return };
    bind_gl_pbr_standard_texture(
        state,
        standard.base_color_map.as_ref(),
        program.loc_base_color_map.as_ref(),
        GL_PBR_BASE_COLOR_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.normal_map.as_ref(),
        program.loc_normal_map.as_ref(),
        GL_PBR_NORMAL_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.metallic_roughness_map.as_ref(),
        program.loc_metallic_roughness_map.as_ref(),
        GL_PBR_METALLIC_ROUGHNESS_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.occlusion_map.as_ref(),
        program.loc_occlusion_map.as_ref(),
        GL_PBR_OCCLUSION_TEXTURE_UNIT,
    );
    bind_gl_pbr_standard_texture(
        state,
        standard.emissive_map.as_ref(),
        program.loc_emissive_map.as_ref(),
        GL_PBR_EMISSIVE_TEXTURE_UNIT,
    );
}

/// Binds one texture to a numbered unit and points its sampler uniform there, if the
/// slot has uploadable pixels. The shared per-map helper for both the standard block
/// and extension renderers (they pass their own unit ≥ [`GL_PBR_EXTENSION_TEXTURE_UNIT`]).
/// No-op when the slot is empty, so the shader's untextured `#ifdef` branch governs
/// instead. Ports `bindGlPbrStandardTexture`.
pub fn bind_gl_pbr_standard_texture(
    state: &mut GlRenderState,
    texture: Option<&Texture>,
    location: Option<&glow::UniformLocation>,
    unit: u32,
) {
    if !is_gl_texture_ready(texture) {
        return;
    }
    let texture = texture.expect("texture readiness checked");
    let image = texture.image.as_ref().expect("texture pixels checked");
    let data = image.data.as_ref().expect("texture pixels checked");

    unsafe {
        state.gl.active_texture(glow::TEXTURE0 + unit);
    }
    bind_gl_texture(state, data, image.width, image.height, image.version as u64);
    unsafe {
        state.gl.uniform_1_i32(location, unit as i32);
    }
}

/// Builds a [`GlPbrDefineKey`] with the standard-block map flags from `standard` and
/// the alpha-mask flag from the material's surface trailer, with every extension lobe
/// disabled. Each extension renderer calls this and then sets its own extension flag;
/// the StandardPbr renderer uses it as-is. Keeps the map-present test
/// ([`is_gl_texture_ready`]) in one place so the compiled variant and the bound
/// textures never disagree. Ports `buildGlPbrStandardDefineKey`.
pub fn build_gl_pbr_standard_define_key(
    standard: Option<&StandardPbrMaterialProperties>,
    alpha_mask_enabled: bool,
) -> GlPbrDefineKey {
    GlPbrDefineKey {
        alpha_mask_enabled,
        anisotropy_enabled: false,
        clearcoat_enabled: false,
        has_base_color_map: standard
            .is_some_and(|s| is_gl_texture_ready(s.base_color_map.as_ref())),
        has_emissive_map: standard.is_some_and(|s| is_gl_texture_ready(s.emissive_map.as_ref())),
        has_metallic_roughness_map: standard
            .is_some_and(|s| is_gl_texture_ready(s.metallic_roughness_map.as_ref())),
        has_normal_map: standard.is_some_and(|s| is_gl_texture_ready(s.normal_map.as_ref())),
        has_occlusion_map: standard.is_some_and(|s| is_gl_texture_ready(s.occlusion_map.as_ref())),
        iridescence_enabled: false,
        sheen_enabled: false,
        specular_enabled: false,
        subsurface_enabled: false,
        transmission_enabled: false,
    }
}

/// True when a texture slot has bound, uploadable pixels (an image resource with a
/// backing pixel buffer). The single predicate the define-key builder and the bind
/// path share, so "map present" means the same thing in both places. Ports
/// `isGlTextureReady` (TS tests `image.source !== null`; the Rust `ImageResource`
/// carries its pixels in `data`).
pub fn is_gl_texture_ready(texture: Option<&Texture>) -> bool {
    texture.is_some_and(|t| t.image.as_ref().is_some_and(|image| image.data.is_some()))
}

/// Decodes a packed `0xRRGGBBAA` color to a linear RGBA tuple: the RGB channels
/// through the sRGB EOTF, alpha left linear. Ports `@flighthq/materials`
/// `unpackColorToLinear`.
pub fn unpack_color_to_linear(color: u32) -> [f32; 4] {
    [
        srgb_channel_to_linear(((color >> 24) & 0xff) as f32 / 0xff as f32),
        srgb_channel_to_linear(((color >> 16) & 0xff) as f32 / 0xff as f32),
        srgb_channel_to_linear(((color >> 8) & 0xff) as f32 / 0xff as f32),
        (color & 0xff) as f32 / 0xff as f32,
    ]
}

/// The IEC 61966-2-1 sRGB electro-optical transfer function for a single channel in
/// `[0, 1]`. Ports `srgbChannelToLinear`.
fn srgb_channel_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::resource::ImageResource;
    use flighthq_types::texture::{Sampler, TextureColorSpace};

    // The GL bind path requires a live glow context (a real GPU/display), so it is
    // validated functionally (the parity matrix at the `gl` cell), not by a unit test —
    // matching `flighthq-render-gl`'s no-device test posture. The pure map-flag / color
    // helpers are assertion-ported here.

    // build_gl_pbr_standard_define_key

    #[test]
    fn build_gl_pbr_standard_define_key_defaults_to_no_maps_no_lobes() {
        let key = build_gl_pbr_standard_define_key(None, false);
        assert_eq!(key, GlPbrDefineKey::default());
    }

    #[test]
    fn build_gl_pbr_standard_define_key_reads_map_flags_and_alpha_mask() {
        let mut standard = StandardPbrMaterialProperties::default();
        standard.base_color_map = Some(make_test_texture(Some(vec![0u8; 4])));
        let key = build_gl_pbr_standard_define_key(Some(&standard), true);
        assert!(key.has_base_color_map);
        assert!(!key.has_normal_map);
        assert!(key.alpha_mask_enabled);
        assert!(!key.specular_enabled);
    }

    // is_gl_texture_ready

    #[test]
    fn is_gl_texture_ready_is_false_for_an_absent_or_empty_texture() {
        assert!(!is_gl_texture_ready(None));
        assert!(!is_gl_texture_ready(Some(&make_test_texture(None))));
    }

    #[test]
    fn is_gl_texture_ready_is_true_when_the_image_has_pixel_data() {
        assert!(is_gl_texture_ready(Some(&make_test_texture(Some(vec![
            0u8;
            4
        ])))));
    }

    // unpack_color_to_linear

    #[test]
    fn unpack_color_to_linear_decodes_white_to_linear_one() {
        let linear = unpack_color_to_linear(0xffffffff);
        assert!((linear[0] - 1.0).abs() < 1e-6);
        assert_eq!(linear[3], 1.0);
    }

    #[test]
    fn unpack_color_to_linear_keeps_alpha_linear_and_decodes_rgb() {
        let linear = unpack_color_to_linear(0x808080ff);
        assert!(linear[0] < 0.5);
        assert_eq!(linear[3], 1.0);
        let half_alpha = unpack_color_to_linear(0x00000080);
        assert!((half_alpha[3] - (0x80 as f32 / 0xff as f32)).abs() < 1e-6);
    }

    fn make_test_texture(data: Option<Vec<u8>>) -> Texture {
        Texture {
            color_space: TextureColorSpace::default(),
            image: Some(ImageResource {
                data,
                width: 1,
                height: 1,
                ..ImageResource::default()
            }),
            sampler: Sampler::default(),
            uv_offset: flighthq_types::geometry::Vector2::default(),
            uv_rotation: 0.0,
            uv_scale: flighthq_types::geometry::Vector2 { x: 1.0, y: 1.0 },
        }
    }
}
