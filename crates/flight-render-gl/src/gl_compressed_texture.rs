// flight-lint: allow-file(contract-vocabulary) D17 compressed uploads intentionally expose glow Context and native Result diagnostics

use flight_image::CompressedImageResource;
use flight_texture::TextureColorSpace;
use flight_texture_formats::{
    TextureContainer, TextureContainerFormat, TextureContainerSupercompression,
};
use glow::{CompressedPixelUnpackData, HasContext, PixelUnpackData};

use crate::{GlCompressedTextureDecoder, GlCompressedTextureSupport, GlRenderState};

pub fn detect_gl_compressed_texture_support(gl: &glow::Context) -> GlCompressedTextureSupport {
    return GlCompressedTextureSupport {
        astc: has_extension(
            gl,
            &[
                "WEBGL_compressed_texture_astc",
                "GL_KHR_texture_compression_astc_ldr",
            ],
        ),
        bptc: has_extension(
            gl,
            &[
                "EXT_texture_compression_bptc",
                "GL_ARB_texture_compression_bptc",
            ],
        ),
        etc: has_extension(
            gl,
            &["WEBGL_compressed_texture_etc", "GL_ARB_ES3_compatibility"],
        ),
        pvrtc: has_extension(
            gl,
            &[
                "WEBGL_compressed_texture_pvrtc",
                "GL_IMG_texture_compression_pvrtc",
            ],
        ),
        rgtc: has_extension(
            gl,
            &[
                "EXT_texture_compression_rgtc",
                "GL_ARB_texture_compression_rgtc",
            ],
        ),
        s3tc: has_extension(
            gl,
            &[
                "WEBGL_compressed_texture_s3tc",
                "GL_EXT_texture_compression_s3tc",
            ],
        ) && has_extension(
            gl,
            &[
                "WEBGL_compressed_texture_s3tc_srgb",
                "GL_EXT_texture_sRGB",
                "GL_EXT_texture_compression_s3tc_srgb",
            ],
        ),
    };
}

fn get_gl_astc_srgb_format(gl: &glow::Context, format: TextureContainerFormat) -> i32 {
    if !detect_gl_compressed_texture_support(gl).astc {
        return -1;
    }
    return match format {
        TextureContainerFormat::Astc4x4 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR,
        TextureContainerFormat::Astc5x4 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR,
        TextureContainerFormat::Astc5x5 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR,
        TextureContainerFormat::Astc6x5 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR,
        TextureContainerFormat::Astc6x6 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR,
        TextureContainerFormat::Astc8x5 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR,
        TextureContainerFormat::Astc8x6 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR,
        TextureContainerFormat::Astc8x8 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR,
        TextureContainerFormat::Astc10x5 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR,
        TextureContainerFormat::Astc10x6 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR,
        TextureContainerFormat::Astc10x8 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR,
        TextureContainerFormat::Astc10x10 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR,
        TextureContainerFormat::Astc12x10 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR,
        TextureContainerFormat::Astc12x12 => glow::COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR,
        _ => return -1,
    } as i32;
}

pub fn get_gl_compressed_texture_format(gl: &glow::Context, format: TextureContainerFormat) -> i32 {
    let support = detect_gl_compressed_texture_support(gl);
    let value = match format {
        TextureContainerFormat::Bc1 if support.s3tc => glow::COMPRESSED_RGBA_S3TC_DXT1_EXT,
        TextureContainerFormat::Bc1Srgb if support.s3tc => {
            glow::COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT
        }
        TextureContainerFormat::Bc2 if support.s3tc => glow::COMPRESSED_RGBA_S3TC_DXT3_EXT,
        TextureContainerFormat::Bc2Srgb if support.s3tc => {
            glow::COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT
        }
        TextureContainerFormat::Bc3 if support.s3tc => glow::COMPRESSED_RGBA_S3TC_DXT5_EXT,
        TextureContainerFormat::Bc3Srgb if support.s3tc => {
            glow::COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT
        }
        TextureContainerFormat::Bc4 if support.rgtc => glow::COMPRESSED_RED_RGTC1,
        TextureContainerFormat::Bc4Snorm if support.rgtc => glow::COMPRESSED_SIGNED_RED_RGTC1,
        TextureContainerFormat::Bc5 if support.rgtc => glow::COMPRESSED_RG_RGTC2,
        TextureContainerFormat::Bc5Snorm if support.rgtc => glow::COMPRESSED_SIGNED_RG_RGTC2,
        TextureContainerFormat::Bc6hUfloat if support.bptc => {
            glow::COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT
        }
        TextureContainerFormat::Bc6hSfloat if support.bptc => {
            glow::COMPRESSED_RGB_BPTC_SIGNED_FLOAT
        }
        TextureContainerFormat::Bc7 if support.bptc => glow::COMPRESSED_RGBA_BPTC_UNORM,
        TextureContainerFormat::Bc7Srgb if support.bptc => glow::COMPRESSED_SRGB_ALPHA_BPTC_UNORM,
        TextureContainerFormat::Etc1 | TextureContainerFormat::Etc2Rgb if support.etc => {
            glow::COMPRESSED_RGB8_ETC2
        }
        TextureContainerFormat::Etc2RgbSrgb if support.etc => glow::COMPRESSED_SRGB8_ETC2,
        TextureContainerFormat::Etc2Rgba if support.etc => glow::COMPRESSED_RGBA8_ETC2_EAC,
        TextureContainerFormat::Etc2RgbaSrgb if support.etc => {
            glow::COMPRESSED_SRGB8_ALPHA8_ETC2_EAC
        }
        TextureContainerFormat::Etc2RgbA1 if support.etc => {
            glow::COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2
        }
        TextureContainerFormat::Etc2RgbA1Srgb if support.etc => {
            glow::COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2
        }
        TextureContainerFormat::EacR11 if support.etc => glow::COMPRESSED_R11_EAC,
        TextureContainerFormat::EacR11Snorm if support.etc => glow::COMPRESSED_SIGNED_R11_EAC,
        TextureContainerFormat::EacRg11 if support.etc => glow::COMPRESSED_RG11_EAC,
        TextureContainerFormat::EacRg11Snorm if support.etc => glow::COMPRESSED_SIGNED_RG11_EAC,
        TextureContainerFormat::Pvrtc2bppRgb if support.pvrtc => 0x8c01,
        TextureContainerFormat::Pvrtc2bppRgba if support.pvrtc => 0x8c03,
        TextureContainerFormat::Pvrtc4bppRgb if support.pvrtc => 0x8c00,
        TextureContainerFormat::Pvrtc4bppRgba if support.pvrtc => 0x8c02,
        TextureContainerFormat::Astc4x4 if support.astc => glow::COMPRESSED_RGBA_ASTC_4x4_KHR,
        TextureContainerFormat::Astc5x4 if support.astc => glow::COMPRESSED_RGBA_ASTC_5x4_KHR,
        TextureContainerFormat::Astc5x5 if support.astc => glow::COMPRESSED_RGBA_ASTC_5x5_KHR,
        TextureContainerFormat::Astc6x5 if support.astc => glow::COMPRESSED_RGBA_ASTC_6x5_KHR,
        TextureContainerFormat::Astc6x6 if support.astc => glow::COMPRESSED_RGBA_ASTC_6x6_KHR,
        TextureContainerFormat::Astc8x5 if support.astc => glow::COMPRESSED_RGBA_ASTC_8x5_KHR,
        TextureContainerFormat::Astc8x6 if support.astc => glow::COMPRESSED_RGBA_ASTC_8x6_KHR,
        TextureContainerFormat::Astc8x8 if support.astc => glow::COMPRESSED_RGBA_ASTC_8x8_KHR,
        TextureContainerFormat::Astc10x5 if support.astc => glow::COMPRESSED_RGBA_ASTC_10x5_KHR,
        TextureContainerFormat::Astc10x6 if support.astc => glow::COMPRESSED_RGBA_ASTC_10x6_KHR,
        TextureContainerFormat::Astc10x8 if support.astc => glow::COMPRESSED_RGBA_ASTC_10x8_KHR,
        TextureContainerFormat::Astc10x10 if support.astc => glow::COMPRESSED_RGBA_ASTC_10x10_KHR,
        TextureContainerFormat::Astc12x10 if support.astc => glow::COMPRESSED_RGBA_ASTC_12x10_KHR,
        TextureContainerFormat::Astc12x12 if support.astc => glow::COMPRESSED_RGBA_ASTC_12x12_KHR,
        _ => return -1,
    };
    return value as i32;
}

fn get_texture_container_format_for_color_space(
    format: TextureContainerFormat,
    color_space: TextureColorSpace,
) -> TextureContainerFormat {
    let pair = match format {
        TextureContainerFormat::Bc1 | TextureContainerFormat::Bc1Srgb => {
            Some((TextureContainerFormat::Bc1, TextureContainerFormat::Bc1Srgb))
        }
        TextureContainerFormat::Bc2 | TextureContainerFormat::Bc2Srgb => {
            Some((TextureContainerFormat::Bc2, TextureContainerFormat::Bc2Srgb))
        }
        TextureContainerFormat::Bc3 | TextureContainerFormat::Bc3Srgb => {
            Some((TextureContainerFormat::Bc3, TextureContainerFormat::Bc3Srgb))
        }
        TextureContainerFormat::Bc7 | TextureContainerFormat::Bc7Srgb => {
            Some((TextureContainerFormat::Bc7, TextureContainerFormat::Bc7Srgb))
        }
        TextureContainerFormat::Etc1
        | TextureContainerFormat::Etc2Rgb
        | TextureContainerFormat::Etc2RgbSrgb => Some((
            TextureContainerFormat::Etc2Rgb,
            TextureContainerFormat::Etc2RgbSrgb,
        )),
        TextureContainerFormat::Etc2RgbA1 | TextureContainerFormat::Etc2RgbA1Srgb => Some((
            TextureContainerFormat::Etc2RgbA1,
            TextureContainerFormat::Etc2RgbA1Srgb,
        )),
        TextureContainerFormat::Etc2Rgba | TextureContainerFormat::Etc2RgbaSrgb => Some((
            TextureContainerFormat::Etc2Rgba,
            TextureContainerFormat::Etc2RgbaSrgb,
        )),
        _ => None,
    };
    return pair.map_or(format, |(linear, srgb)| {
        if color_space == TextureColorSpace::Srgb {
            srgb
        } else {
            linear
        }
    });
}

fn has_extension(gl: &glow::Context, names: &[&str]) -> bool {
    return names
        .iter()
        .any(|name| gl.supported_extensions().contains(*name));
}

pub fn has_gl_compressed_texture_format(
    support: &GlCompressedTextureSupport,
    format: TextureContainerFormat,
) -> bool {
    return match format {
        TextureContainerFormat::Bc1
        | TextureContainerFormat::Bc1Srgb
        | TextureContainerFormat::Bc2
        | TextureContainerFormat::Bc2Srgb
        | TextureContainerFormat::Bc3
        | TextureContainerFormat::Bc3Srgb => support.s3tc,
        TextureContainerFormat::Bc4
        | TextureContainerFormat::Bc4Snorm
        | TextureContainerFormat::Bc5
        | TextureContainerFormat::Bc5Snorm => support.rgtc,
        TextureContainerFormat::Bc6hUfloat
        | TextureContainerFormat::Bc6hSfloat
        | TextureContainerFormat::Bc7
        | TextureContainerFormat::Bc7Srgb => support.bptc,
        TextureContainerFormat::Etc1
        | TextureContainerFormat::Etc2Rgb
        | TextureContainerFormat::Etc2RgbSrgb
        | TextureContainerFormat::Etc2Rgba
        | TextureContainerFormat::Etc2RgbaSrgb
        | TextureContainerFormat::Etc2RgbA1
        | TextureContainerFormat::Etc2RgbA1Srgb
        | TextureContainerFormat::EacR11
        | TextureContainerFormat::EacR11Snorm
        | TextureContainerFormat::EacRg11
        | TextureContainerFormat::EacRg11Snorm => support.etc,
        TextureContainerFormat::Pvrtc2bppRgb
        | TextureContainerFormat::Pvrtc2bppRgba
        | TextureContainerFormat::Pvrtc4bppRgb
        | TextureContainerFormat::Pvrtc4bppRgba => support.pvrtc,
        value if is_astc_format(value) => support.astc,
        _ => false,
    };
}

fn is_astc_format(format: TextureContainerFormat) -> bool {
    return matches!(
        format,
        TextureContainerFormat::Astc4x4
            | TextureContainerFormat::Astc5x4
            | TextureContainerFormat::Astc5x5
            | TextureContainerFormat::Astc6x5
            | TextureContainerFormat::Astc6x6
            | TextureContainerFormat::Astc8x5
            | TextureContainerFormat::Astc8x6
            | TextureContainerFormat::Astc8x8
            | TextureContainerFormat::Astc10x5
            | TextureContainerFormat::Astc10x6
            | TextureContainerFormat::Astc10x8
            | TextureContainerFormat::Astc10x10
            | TextureContainerFormat::Astc12x10
            | TextureContainerFormat::Astc12x12
    );
}

fn is_supported_gl_compressed_texture_container_shape(container: &TextureContainer) -> bool {
    if container.depth != 1 || container.layers < 1 {
        return false;
    }
    return container.faces == 1 || (container.faces == 6 && container.layers == 1);
}

pub fn register_gl_compressed_texture_decoder(
    state: &mut GlRenderState,
    decode: Option<GlCompressedTextureDecoder>,
) {
    state.gl_registries.compressed_texture_decoder = decode;
}

pub fn register_gl_compressed_texture_upload(state: &mut GlRenderState, uploader: Option<()>) {
    state.gl_registries.compressed_texture_upload = if uploader.is_some() {
        None
    } else {
        Some(upload_gl_compressed_image)
    };
}

fn upload_gl_compressed_image(
    gl: &glow::Context,
    image: &CompressedImageResource,
    decode: Option<GlCompressedTextureDecoder>,
    color_space: TextureColorSpace,
) -> bool {
    let container = &image.compressed.container;
    if container.depth != 1 || container.faces != 1 || container.layers != 1 {
        return false;
    }
    let payload = image.compressed.payload.read().unwrap();
    return upload_gl_compressed_texture_container(
        gl,
        container,
        &payload,
        decode,
        Some(color_space),
    );
}

// flight-lint: allow(conform-array) D17 a borrowed byte slice is the native zero-copy analogue of the source Uint8Array payload
pub fn upload_gl_compressed_texture_container(
    gl: &glow::Context,
    container: &TextureContainer,
    payload: &[u8],
    decode: Option<GlCompressedTextureDecoder>,
    color_space: Option<TextureColorSpace>,
) -> bool {
    if !is_supported_gl_compressed_texture_container_shape(container)
        || container.supercompression != TextureContainerSupercompression::None
    {
        return false;
    }
    let upload_format = color_space.map_or(container.format, |color_space| {
        get_texture_container_format_for_color_space(container.format, color_space)
    });
    let native_format =
        if color_space == Some(TextureColorSpace::Srgb) && is_astc_format(container.format) {
            get_gl_astc_srgb_format(gl, container.format)
        } else {
            get_gl_compressed_texture_format(gl, upload_format)
        };
    if !container.levels.iter().all(|entry| {
        entry
            .byte_offset
            .checked_add(entry.byte_length)
            .is_some_and(|end| end <= payload.len())
    }) {
        return false;
    }
    if native_format != -1 {
        // SAFETY: the caller owns the active binding; each subresource range was validated above.
        unsafe {
            if container.layers > 1 {
                gl.tex_storage_3d(
                    glow::TEXTURE_2D_ARRAY,
                    container.mip_levels as i32,
                    native_format as u32,
                    container.width as i32,
                    container.height as i32,
                    container.layers as i32,
                );
            }
            for (index, entry) in container.levels.iter().enumerate() {
                let view = &payload[entry.byte_offset..entry.byte_offset + entry.byte_length];
                let mip = index % container.mip_levels;
                let face_layer = (index - mip) / container.mip_levels;
                let face = face_layer % container.faces;
                let layer = (face_layer - face) / container.faces;
                if container.layers > 1 {
                    gl.compressed_tex_sub_image_3d(
                        glow::TEXTURE_2D_ARRAY,
                        mip as i32,
                        0,
                        0,
                        layer as i32,
                        entry.width as i32,
                        entry.height as i32,
                        1,
                        native_format as u32,
                        CompressedPixelUnpackData::Slice(view),
                    );
                } else {
                    let target = if container.faces == 6 {
                        glow::TEXTURE_CUBE_MAP_POSITIVE_X + face as u32
                    } else {
                        glow::TEXTURE_2D
                    };
                    gl.compressed_tex_image_2d(
                        target,
                        mip as i32,
                        native_format,
                        entry.width as i32,
                        entry.height as i32,
                        0,
                        view.len() as i32,
                        view,
                    );
                }
            }
        }
        return true;
    }
    let Some(decode) = decode else {
        return false;
    };
    if container.faces != 1 || container.layers != 1 {
        return false;
    }
    for (mip, entry) in container.levels.iter().enumerate() {
        let view = &payload[entry.byte_offset..entry.byte_offset + entry.byte_length];
        let Some(rgba) = decode(
            container.format,
            entry.width as u32,
            entry.height as u32,
            view,
        ) else {
            return false;
        };
        if rgba.len() < entry.width.saturating_mul(entry.height).saturating_mul(4) {
            return false;
        }
        // SAFETY: decoded RGBA storage is retained through the upload call.
        unsafe {
            gl.tex_image_2d(
                glow::TEXTURE_2D,
                mip as i32,
                if color_space == Some(TextureColorSpace::Srgb) {
                    glow::SRGB8_ALPHA8 as i32
                } else {
                    glow::RGBA as i32
                },
                entry.width as i32,
                entry.height as i32,
                0,
                glow::RGBA,
                glow::UNSIGNED_BYTE,
                PixelUnpackData::Slice(Some(&rgba)),
            );
        }
    }
    return true;
}
