//! The built-in StandardPbr forward-lit mesh-material renderer.
//!
//! Ports `@flighthq/scene-gl` `standardPbrGlMeshMaterialRenderer.ts`. `bind`
//! selects the uber-shader variant for the material's maps/alpha mode, uploads the
//! shared per-run uniforms (camera view-projection + position, the packed light
//! block), and the material's scalar/color uniforms, alpha cutoff, and base-color/
//! normal textures. `draw` sets the per-draw model + normal matrices and issues the
//! indexed draw over the proxy's subset with depth-test LESS + depth-write on and
//! back-face culling unless the material is double-sided.
//!
//! TS↔Rust divergence — the StandardPbr block here is the Rust proving slice. The
//! Rust [`GlPbrDefineKey`] / [`GlPbrProgram`] carry only the base-color + normal
//! maps and the alpha-mask flag (the slice the Rust `gl_pbr_prelude` compiles), so
//! `bind` reads and binds exactly those from the concrete
//! [`StandardPbrMaterial`]. The metallic-roughness / occlusion / emissive maps and
//! the PBR-extension lobes (clearcoat, sheen, …) the full TS `bindGlPbrStandardBlock`
//! covers are out of scope for the slice and grow with the prelude. The scalar/
//! color/alpha-cutoff reads, the program/depth/cull state, camera, and light-block
//! uploads, and the indexed draw are 1:1.
//!
//! `unpack_color_to_linear` is ported locally below; // TODO(align): drop the local
//! copy and import it once `flighthq-materials` promotes `unpack_color_to_linear`.

use flighthq_camera::get_camera_view_projection_matrix4;
use flighthq_geometry::{get_matrix4_position, inverse_matrix4};
use flighthq_render_gl::{GlRenderState, bind_gl_texture};
use flighthq_types::camera::{Camera, Projection};
use flighthq_types::geometry::{Matrix4Like, Vector3Like};
use flighthq_types::pbr_material::{MaterialAlphaMode, StandardPbrMaterial};
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};
use flighthq_types::texture::Texture;
use glow::HasContext;

use crate::gl_mesh_material_registry::{GlMeshMaterialRenderer, MeshMaterial};
use crate::gl_pbr_prelude::GlPbrDefineKey;
use crate::gl_pbr_program_cache::{GlPbrProgram, ensure_gl_pbr_program};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};

/// The texture unit the StandardPbr base-color map binds to (the slice's albedo
/// slot). Fixed so every PBR program binds it at the same slot.
pub const GL_PBR_BASE_COLOR_TEXTURE_UNIT: u32 = 0;
/// The texture unit the StandardPbr normal map binds to.
pub const GL_PBR_NORMAL_TEXTURE_UNIT: u32 = 1;

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
        let alpha_mask_enabled = pbr.is_some_and(|p| p.alpha_mode == MaterialAlphaMode::Mask);

        let program = ensure_gl_pbr_program(
            &state.gl,
            scene,
            &build_standard_pbr_define_key(pbr, alpha_mask_enabled),
        );
        scene.active_pbr_program = Some(program.clone());

        {
            let gl = &state.gl;
            unsafe {
                gl.use_program(Some(program.program));

                // The render-effect pipeline owns enabling depth + binding the
                // rgba16f scene target; this renderer only fixes the test
                // function/write and per-material cull, so a caller invoking draw
                // without the full pipeline still gets correct occlusion.
                gl.enable(glow::DEPTH_TEST);
                gl.depth_func(glow::LESS);
                gl.depth_mask(true);

                if pbr.is_some_and(|p| p.double_sided) {
                    gl.disable(glow::CULL_FACE);
                } else {
                    gl.enable(glow::CULL_FACE);
                    gl.cull_face(glow::BACK);
                }

                bind_gl_pbr_camera(gl, &program, camera);
                bind_gl_pbr_lights(gl, &program, lights);
                bind_gl_pbr_standard_scalars(gl, &program, pbr);
            }
        }

        // The texture binds need &mut GlRenderState (the texture cache), so they
        // run after the &state.gl borrow above is released. No-op when the slot
        // has no pixels — the shader's untextured #ifdef branch governs instead.
        if let Some(pbr) = pbr {
            bind_gl_pbr_standard_texture(
                state,
                &program,
                pbr.standard.base_color_map.as_ref(),
                program.loc_base_color_map.as_ref(),
                GL_PBR_BASE_COLOR_TEXTURE_UNIT,
            );
            bind_gl_pbr_standard_texture(
                state,
                &program,
                pbr.standard.normal_map.as_ref(),
                program.loc_normal_map.as_ref(),
                GL_PBR_NORMAL_TEXTURE_UNIT,
            );
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
}

/// The feature define key for the bound material: the alpha-mask flag plus the
/// base-color / normal map flags from the concrete `StandardPbrMaterial`. With no
/// concrete material (the default-kind fallback) the base, untextured variant is
/// selected. Mirrors the slice of `buildGlPbrStandardDefineKey` the Rust prelude
/// compiles.
fn build_standard_pbr_define_key(
    pbr: Option<&StandardPbrMaterial>,
    alpha_mask_enabled: bool,
) -> GlPbrDefineKey {
    GlPbrDefineKey {
        alpha_mask_enabled,
        has_base_color_map: pbr
            .is_some_and(|p| has_texture_pixels(p.standard.base_color_map.as_ref())),
        has_normal_map: pbr.is_some_and(|p| has_texture_pixels(p.standard.normal_map.as_ref())),
    }
}

/// True when a texture slot has bound, uploadable pixels (an image resource with a
/// backing pixel buffer). The single predicate the define-key builder and the bind
/// path share, so "map present" means the same thing in both places. Mirrors the
/// TS `hasTexturePixels` (TS tests `image.source !== null`; the Rust `ImageResource`
/// carries its pixels in `data`).
fn has_texture_pixels(texture: Option<&Texture>) -> bool {
    texture.is_some_and(|t| t.image.as_ref().is_some_and(|image| image.data.is_some()))
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

/// Uploads the StandardPbr scalar/color material uniforms from the concrete
/// material, or the untextured neutral defaults (white base color, dielectric,
/// fully rough) when no concrete material resolved — mirroring the TS
/// `bindGlPbrStandardBlock` null branch and the trailing alpha-cutoff upload.
/// Packed colors are decoded to linear on the CPU here; sampled albedo/emissive
/// textures are sRGB-decoded in GLSL, so nothing is double-decoded.
///
/// # Safety
/// The GL context must be current and `program` in use.
unsafe fn bind_gl_pbr_standard_scalars(
    gl: &glow::Context,
    program: &GlPbrProgram,
    pbr: Option<&StandardPbrMaterial>,
) {
    unsafe {
        let Some(pbr) = pbr else {
            gl.uniform_4_f32(program.loc_base_color.as_ref(), 1.0, 1.0, 1.0, 1.0);
            gl.uniform_1_f32(program.loc_metallic.as_ref(), 0.0);
            gl.uniform_1_f32(program.loc_roughness.as_ref(), 1.0);
            gl.uniform_1_f32(program.loc_normal_scale.as_ref(), 1.0);
            gl.uniform_3_f32(program.loc_emissive.as_ref(), 0.0, 0.0, 0.0);
            gl.uniform_1_f32(program.loc_emissive_strength.as_ref(), 1.0);
            gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), 0.5);
            return;
        };

        let standard = &pbr.standard;
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

        // The alpha-cutoff uniform is not part of the property block; it lives on
        // the SurfaceMaterial trailer.
        gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), pbr.alpha_cutoff);
    }
}

/// Binds one texture to a numbered unit and points its sampler uniform there, if
/// the slot has uploadable pixels. No-op when the slot is empty, so the shader's
/// untextured `#ifdef` branch governs instead. Mirrors `bindGlPbrStandardTexture`.
fn bind_gl_pbr_standard_texture(
    state: &mut GlRenderState,
    _program: &GlPbrProgram,
    texture: Option<&Texture>,
    location: Option<&glow::UniformLocation>,
    unit: u32,
) {
    let Some(texture) = texture else { return };
    if !has_texture_pixels(Some(texture)) {
        return;
    }
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

/// Decodes a packed `0xRRGGBBAA` color to a linear RGBA tuple: the RGB channels
/// through the sRGB EOTF, alpha left linear. Ports `@flighthq/materials`
/// `unpackColorToLinear`. // TODO(align): drop this once `flighthq-materials`
/// promotes `unpack_color_to_linear`.
fn unpack_color_to_linear(color: u32) -> [f32; 4] {
    [
        srgb_channel_to_linear(((color >> 24) & 0xff) as f32 / 0xff as f32),
        srgb_channel_to_linear(((color >> 16) & 0xff) as f32 / 0xff as f32),
        srgb_channel_to_linear(((color >> 8) & 0xff) as f32 / 0xff as f32),
        (color & 0xff) as f32 / 0xff as f32,
    ]
}

/// The IEC 61966-2-1 sRGB electro-optical transfer function for a single channel
/// in `[0, 1]`. Ports `srgbChannelToLinear`.
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

    // The GL bind/draw path requires a live glow context (a real GPU/display), so
    // it is validated functionally (the parity matrix at the `gl` cell), not by a
    // unit test — matching `flighthq-render-gl`'s no-device test posture. The pure
    // material-read helpers are assertion-ported here.

    // build_standard_pbr_define_key

    #[test]
    fn build_standard_pbr_define_key_defaults_to_no_maps_no_alpha_mask() {
        // The default-kind path with no concrete material selects the base variant.
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
    }

    #[test]
    fn build_standard_pbr_define_key_enables_alpha_mask() {
        let material = StandardPbrMaterial::default();
        let key = build_standard_pbr_define_key(Some(&material), true);
        assert!(key.alpha_mask_enabled);
    }

    // has_texture_pixels

    #[test]
    fn has_texture_pixels_is_false_for_an_absent_or_empty_texture() {
        assert!(!has_texture_pixels(None));
        let texture = make_test_texture(None);
        assert!(!has_texture_pixels(Some(&texture)));
    }

    #[test]
    fn has_texture_pixels_is_true_when_the_image_has_pixel_data() {
        let texture = make_test_texture(Some(vec![0u8; 4]));
        assert!(has_texture_pixels(Some(&texture)));
    }

    // Builds a `Texture` for the pixel-presence tests; `Texture` has no `Default`,
    // so its sampler/uv/color-space fields are spelled out. `data` of `None` makes
    // an unbound slot, `Some` a slot with uploadable pixels.
    fn make_test_texture(data: Option<Vec<u8>>) -> Texture {
        use flighthq_types::resource::ImageResource;
        use flighthq_types::texture::{Sampler, TextureColorSpace};
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

    // unpack_color_to_linear

    #[test]
    fn unpack_color_to_linear_decodes_white_to_linear_one() {
        let linear = unpack_color_to_linear(0xffffffff);
        assert!((linear[0] - 1.0).abs() < 1e-6);
        assert!((linear[1] - 1.0).abs() < 1e-6);
        assert!((linear[2] - 1.0).abs() < 1e-6);
        assert_eq!(linear[3], 1.0);
    }

    #[test]
    fn unpack_color_to_linear_keeps_alpha_linear_and_decodes_rgb() {
        // Opaque mid-gray sRGB (0x80) decodes below 0.5 in linear; alpha is the raw
        // channel ratio.
        let linear = unpack_color_to_linear(0x808080ff);
        assert!(linear[0] < 0.5);
        assert_eq!(linear[3], 1.0);
        let half_alpha = unpack_color_to_linear(0x00000080);
        assert!((half_alpha[3] - (0x80 as f32 / 0xff as f32)).abs() < 1e-6);
    }

    #[test]
    fn srgb_channel_to_linear_is_linear_in_the_low_segment() {
        assert!((srgb_channel_to_linear(0.0) - 0.0).abs() < 1e-6);
        assert!((srgb_channel_to_linear(0.04) - 0.04 / 12.92).abs() < 1e-6);
    }
}
