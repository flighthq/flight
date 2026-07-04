//! The StandardPbr material properties block bind and define-key builder.
//!
//! Ports `@flighthq/scene-gl` `glPbrStandardBlock.ts`.

use flighthq_render_gl::GlRenderState;
use flighthq_types::pbr_material::StandardPbrMaterialProperties;
use flighthq_types::texture::Texture;
use glow::HasContext;

use crate::gl_pbr_prelude::GlPbrDefineKey;
use crate::gl_pbr_program_cache::GlPbrProgram;

/// Texture unit for the StandardPbr base-color map.
pub const GL_PBR_BASE_COLOR_TEXTURE_UNIT: u32 = 0;
/// Texture unit for the StandardPbr normal map.
pub const GL_PBR_NORMAL_TEXTURE_UNIT: u32 = 1;
/// Texture unit for the metallic-roughness map.
pub const GL_PBR_METALLIC_ROUGHNESS_TEXTURE_UNIT: u32 = 2;
/// Texture unit for the occlusion map.
pub const GL_PBR_OCCLUSION_TEXTURE_UNIT: u32 = 3;
/// Texture unit for the emissive map.
pub const GL_PBR_EMISSIVE_TEXTURE_UNIT: u32 = 4;
/// First texture unit free for extension maps.
pub const GL_PBR_EXTENSION_TEXTURE_UNIT: u32 = 5;

/// Uploads the full StandardPbrMaterialProperties block to a PBR program.
pub fn bind_gl_pbr_standard_block(
    state: &mut GlRenderState,
    program: &GlPbrProgram,
    standard: Option<&StandardPbrMaterialProperties>,
) {
    let gl = &state.gl;
    unsafe {
        if let Some(standard) = standard {
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
        } else {
            gl.uniform_4_f32(program.loc_base_color.as_ref(), 1.0, 1.0, 1.0, 1.0);
            gl.uniform_1_f32(program.loc_metallic.as_ref(), 0.0);
            gl.uniform_1_f32(program.loc_roughness.as_ref(), 1.0);
            gl.uniform_1_f32(program.loc_normal_scale.as_ref(), 1.0);
            gl.uniform_3_f32(program.loc_emissive.as_ref(), 0.0, 0.0, 0.0);
            gl.uniform_1_f32(program.loc_emissive_strength.as_ref(), 1.0);
        }
    }
}

/// Binds one texture to a numbered unit and points its sampler uniform there.
pub fn bind_gl_pbr_standard_texture(
    _state: &mut GlRenderState,
    _texture: Option<&Texture>,
    _location: Option<&glow::UniformLocation>,
    _unit: u32,
) {
    // Stub: requires the texture cache / bind_gl_texture integration.
}

/// Builds a GlPbrDefineKey with the standard-block map flags.
pub fn build_gl_pbr_standard_define_key(
    standard: Option<&StandardPbrMaterialProperties>,
    alpha_mask_enabled: bool,
) -> GlPbrDefineKey {
    GlPbrDefineKey {
        alpha_mask_enabled,
        has_base_color_map: standard
            .is_some_and(|s| is_gl_texture_ready(s.base_color_map.as_ref())),
        has_normal_map: standard.is_some_and(|s| is_gl_texture_ready(s.normal_map.as_ref())),
    }
}

/// True when a texture slot has bound, uploadable pixels.
pub fn is_gl_texture_ready(texture: Option<&Texture>) -> bool {
    texture.is_some_and(|t| t.image.as_ref().is_some_and(|image| image.data.is_some()))
}

fn unpack_color_to_linear(color: u32) -> [f32; 4] {
    [
        srgb_channel_to_linear(((color >> 24) & 0xff) as f32 / 255.0),
        srgb_channel_to_linear(((color >> 16) & 0xff) as f32 / 255.0),
        srgb_channel_to_linear(((color >> 8) & 0xff) as f32 / 255.0),
        (color & 0xff) as f32 / 255.0,
    ]
}

fn srgb_channel_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}
