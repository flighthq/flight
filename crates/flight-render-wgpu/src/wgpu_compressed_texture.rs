// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Block-compressed texture upload (TS `wgpuCompressedTexture.ts`). A container uploads natively when
//! the device enables its family; otherwise an optional CPU decoder supplies RGBA8 per level for
//! plain 2D textures, matching GL.

use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref, Uint8Array};
use flight_image::CompressedImageResource;
use flight_texture::TextureColorSpace;
use flight_texture_formats::{
    TextureContainer, TextureContainerFormat, TextureContainerSupercompression,
};

use crate::types::*;
use crate::wgpu_command_observer::write_wgpu_texture;
use crate::wgpu_render_state::{
    get_wgpu_render_state_device_resources, get_wgpu_render_state_native_device,
};

#[derive(Clone, Copy)]
struct WgpuCompressedFormatInfo {
    block_height: u32,
    block_width: u32,
    bytes_per_block: u32,
    format: wgpu::TextureFormat,
}

fn astc(block: wgpu::AstcBlock, block_width: u32, block_height: u32) -> WgpuCompressedFormatInfo {
    return WgpuCompressedFormatInfo {
        block_height,
        block_width,
        bytes_per_block: 16,
        format: wgpu::TextureFormat::Astc {
            block,
            channel: wgpu::AstcChannel::Unorm,
        },
    };
}

// flight-lint: allow(f64) Uint8ClampedArray assignment takes a double
fn clamp_u8(value: f64) -> u8 {
    return value.round_ties_even().clamp(0.0, 255.0) as u8;
}

/// The block-compression families the device enables (TS `detectWgpuCompressedTextureSupport`).
pub fn detect_wgpu_compressed_texture_support(
    device: &wgpu::Device,
) -> WgpuCompressedTextureSupport {
    let features = device.features();
    return WgpuCompressedTextureSupport {
        astc: features.contains(wgpu::Features::TEXTURE_COMPRESSION_ASTC),
        bc: features.contains(wgpu::Features::TEXTURE_COMPRESSION_BC),
        etc2: features.contains(wgpu::Features::TEXTURE_COMPRESSION_ETC2),
    };
}

fn fixed(format: wgpu::TextureFormat, bytes_per_block: u32) -> WgpuCompressedFormatInfo {
    return WgpuCompressedFormatInfo {
        block_height: 4,
        block_width: 4,
        bytes_per_block,
        format,
    };
}

fn get_compressed_format_info(format: TextureContainerFormat) -> Option<WgpuCompressedFormatInfo> {
    use TextureContainerFormat as F;
    use wgpu::AstcBlock as B;
    use wgpu::TextureFormat as T;
    return Some(match format {
        F::Bc1 => fixed(T::Bc1RgbaUnorm, 8),
        F::Bc1Srgb => fixed(T::Bc1RgbaUnormSrgb, 8),
        F::Bc2 => fixed(T::Bc2RgbaUnorm, 16),
        F::Bc2Srgb => fixed(T::Bc2RgbaUnormSrgb, 16),
        F::Bc3 => fixed(T::Bc3RgbaUnorm, 16),
        F::Bc3Srgb => fixed(T::Bc3RgbaUnormSrgb, 16),
        F::Bc4 => fixed(T::Bc4RUnorm, 8),
        F::Bc4Snorm => fixed(T::Bc4RSnorm, 8),
        F::Bc5 => fixed(T::Bc5RgUnorm, 16),
        F::Bc5Snorm => fixed(T::Bc5RgSnorm, 16),
        F::Bc6hUfloat => fixed(T::Bc6hRgbUfloat, 16),
        F::Bc6hSfloat => fixed(T::Bc6hRgbFloat, 16),
        F::Bc7 => fixed(T::Bc7RgbaUnorm, 16),
        F::Bc7Srgb => fixed(T::Bc7RgbaUnormSrgb, 16),
        F::Etc1 => fixed(T::Etc2Rgb8Unorm, 8),
        F::Etc2Rgb => fixed(T::Etc2Rgb8Unorm, 8),
        F::Etc2RgbSrgb => fixed(T::Etc2Rgb8UnormSrgb, 8),
        F::Etc2Rgba => fixed(T::Etc2Rgba8Unorm, 16),
        F::Etc2RgbaSrgb => fixed(T::Etc2Rgba8UnormSrgb, 16),
        F::Etc2RgbA1 => fixed(T::Etc2Rgb8A1Unorm, 8),
        F::Etc2RgbA1Srgb => fixed(T::Etc2Rgb8A1UnormSrgb, 8),
        F::EacR11 => fixed(T::EacR11Unorm, 8),
        F::EacR11Snorm => fixed(T::EacR11Snorm, 8),
        F::EacRg11 => fixed(T::EacRg11Unorm, 16),
        F::EacRg11Snorm => fixed(T::EacRg11Snorm, 16),
        F::Astc4x4 => astc(B::B4x4, 4, 4),
        F::Astc5x4 => astc(B::B5x4, 5, 4),
        F::Astc5x5 => astc(B::B5x5, 5, 5),
        F::Astc6x5 => astc(B::B6x5, 6, 5),
        F::Astc6x6 => astc(B::B6x6, 6, 6),
        F::Astc8x5 => astc(B::B8x5, 8, 5),
        F::Astc8x6 => astc(B::B8x6, 8, 6),
        F::Astc8x8 => astc(B::B8x8, 8, 8),
        F::Astc10x5 => astc(B::B10x5, 10, 5),
        F::Astc10x6 => astc(B::B10x6, 10, 6),
        F::Astc10x8 => astc(B::B10x8, 10, 8),
        F::Astc10x10 => astc(B::B10x10, 10, 10),
        F::Astc12x10 => astc(B::B12x10, 12, 10),
        F::Astc12x12 => astc(B::B12x12, 12, 12),
        _ => return None,
    });
}

// The sRGB or linear partner of a format with one, else the format itself.
fn get_texture_container_format_for_color_space(
    format: TextureContainerFormat,
    color_space: TextureColorSpace,
) -> TextureContainerFormat {
    use TextureContainerFormat as F;
    let pair = match format {
        F::Bc1 | F::Bc1Srgb => (F::Bc1, F::Bc1Srgb),
        F::Bc2 | F::Bc2Srgb => (F::Bc2, F::Bc2Srgb),
        F::Bc3 | F::Bc3Srgb => (F::Bc3, F::Bc3Srgb),
        F::Bc7 | F::Bc7Srgb => (F::Bc7, F::Bc7Srgb),
        F::Etc1 => (F::Etc1, F::Etc2RgbSrgb),
        F::Etc2Rgb | F::Etc2RgbSrgb => (F::Etc2Rgb, F::Etc2RgbSrgb),
        F::Etc2RgbA1 | F::Etc2RgbA1Srgb => (F::Etc2RgbA1, F::Etc2RgbA1Srgb),
        F::Etc2Rgba | F::Etc2RgbaSrgb => (F::Etc2Rgba, F::Etc2RgbaSrgb),
        _ => return format,
    };
    return if color_space == TextureColorSpace::Srgb {
        pair.1
    } else {
        pair.0
    };
}

/// The native format a container format uploads as on this device, or `None` when the family is
/// not enabled or the format is not block-compressed (TS `getWgpuCompressedTextureFormat`).
pub fn get_wgpu_compressed_texture_format(
    device: &wgpu::Device,
    format: TextureContainerFormat,
) -> Option<wgpu::TextureFormat> {
    let info = get_compressed_format_info(format)?;
    let support = detect_wgpu_compressed_texture_support(device);
    return if is_family_supported(&support, format) {
        Some(info.format)
    } else {
        None
    };
}

fn get_wgpu_compressed_texture_format_for_color_space(
    device: &wgpu::Device,
    format: TextureContainerFormat,
    color_space: Option<TextureColorSpace>,
) -> Option<wgpu::TextureFormat> {
    let resolved = match color_space {
        None => format,
        Some(color_space) => get_texture_container_format_for_color_space(format, color_space),
    };
    let native = get_wgpu_compressed_texture_format(device, resolved)?;
    if color_space == Some(TextureColorSpace::Srgb)
        && let wgpu::TextureFormat::Astc { block, .. } = native
    {
        return Some(wgpu::TextureFormat::Astc {
            block,
            channel: wgpu::AstcChannel::UnormSrgb,
        });
    }
    return Some(native);
}

/// Whether `support` covers a block-compressed container format (TS
/// `hasWgpuCompressedTextureFormat`).
pub fn has_wgpu_compressed_texture_format(
    support: &WgpuCompressedTextureSupport,
    format: TextureContainerFormat,
) -> bool {
    if get_compressed_format_info(format).is_none() {
        return false;
    }
    return is_family_supported(support, format);
}

fn is_family_supported(
    support: &WgpuCompressedTextureSupport,
    format: TextureContainerFormat,
) -> bool {
    use TextureContainerFormat as F;
    return match format {
        F::Bc1
        | F::Bc1Srgb
        | F::Bc2
        | F::Bc2Srgb
        | F::Bc3
        | F::Bc3Srgb
        | F::Bc4
        | F::Bc4Snorm
        | F::Bc5
        | F::Bc5Snorm
        | F::Bc6hUfloat
        | F::Bc6hSfloat
        | F::Bc7
        | F::Bc7Srgb => support.bc,
        F::Astc4x4
        | F::Astc5x4
        | F::Astc5x5
        | F::Astc6x5
        | F::Astc6x6
        | F::Astc8x5
        | F::Astc8x6
        | F::Astc8x8
        | F::Astc10x5
        | F::Astc10x6
        | F::Astc10x8
        | F::Astc10x10
        | F::Astc12x10
        | F::Astc12x12 => support.astc,
        _ => support.etc2,
    };
}

// flight-lint: allow(f64) mirrors the source double-precision alpha math so Uint8ClampedArray rounding matches
// Uint8ClampedArray assignment of a straight-to-premultiplied conversion.
fn premultiply_rgba8(data: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; data.len()];
    let mut i = 0;
    while i + 3 < data.len() {
        let alpha = data[i + 3] as f64;
        out[i] = clamp_u8(data[i] as f64 * alpha / 255.0);
        out[i + 1] = clamp_u8(data[i + 1] as f64 * alpha / 255.0);
        out[i + 2] = clamp_u8(data[i + 2] as f64 * alpha / 255.0);
        out[i + 3] = data[i + 3];
        i += 4;
    }
    return out;
}

/// Installs or clears the CPU decoder the compressed upload falls back to (TS
/// `registerWgpuCompressedTextureDecoder`).
pub fn register_wgpu_compressed_texture_decoder(
    state: &mut WgpuRenderState,
    decode: Option<WgpuCompressedTextureDecoder>,
) {
    state.runtime.registries.compressed_texture_decoder = decode;
}

/// Installs the compressed-image upload bridge, or clears it (TS
/// `registerWgpuCompressedTextureUpload`).
// flight-lint: allow(conform-params) approved (state, enabled: bool) for Rust and TS (Principal cafc5d6b; api-drift render-wgpu registerWgpuCompressedTextureUpload); the pinned TS still reads uploader?: null
pub fn register_wgpu_compressed_texture_upload(state: &mut WgpuRenderState, enabled: bool) {
    state.runtime.registries.compressed_texture_upload = if enabled {
        Some(upload_wgpu_compressed_image)
    } else {
        None
    };
}

fn upload_wgpu_compressed_image(
    state: &mut WgpuRenderState,
    image: &CompressedImageResource,
    decode: Option<&WgpuCompressedTextureDecoder>,
    color_space: Option<TextureColorSpace>,
) -> Option<Ref<WgpuTextureEntry>> {
    let color_space = color_space.unwrap_or(TextureColorSpace::Linear);
    let compressed = &image.compressed;
    let container = &compressed.container;
    if container.depth != 1 || container.faces != 1 || container.layers != 1 {
        return None;
    }
    let native = get_wgpu_render_state_native_device(state);
    let is_native = get_wgpu_compressed_texture_format_for_color_space(
        &native.device,
        container.format,
        Some(color_space),
    )
    .is_some();
    let fallback: Option<WgpuCompressedTextureDecoder> = decode.map(|decode| {
        let decode = decode.clone();
        let fallback: WgpuCompressedTextureDecoder =
            Arc::new(move |format, width, height, data: &[u8]| {
                return decode(format, width, height, data).map(|rgba| premultiply_rgba8(&rgba));
            });
        return fallback;
    });
    let payload = compressed.payload.read().unwrap();
    let texture = upload_wgpu_compressed_texture_container(
        state,
        container,
        &payload,
        fallback.as_ref(),
        Some(color_space),
    )?;
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let resources = get_wgpu_render_state_device_resources(state);
    let sampler = if state.render.allow_smoothing {
        resources.linear_sampler
    } else {
        resources.nearest_sampler
    };
    return Some(Arc::new(RwLock::new(WgpuTextureEntry {
        runtime: EntityRuntimeSlot::default(),
        bindings: WgpuTextureBindings::new(),
        mip_level_count: container.mip_levels as u32,
        sampler: Some(sampler),
        straight_alpha: Some(is_native),
        texture,
        view,
        version: None,
        video: None,
    })));
}

/// Creates and fills a texture from a parsed block-compressed container (TS
/// `uploadWgpuCompressedTextureContainer`). Native uploads cover 2D, cubemap and 2D-array shapes; the
/// RGBA fallback covers plain 2D only, matching GL. A still-supercompressed payload, volume,
/// cubemap array, missing family without a decoder, or malformed level list returns `None` without
/// creating a texture.
pub fn upload_wgpu_compressed_texture_container(
    state: &WgpuRenderState,
    container: &TextureContainer,
    payload: &Uint8Array,
    decode: Option<&WgpuCompressedTextureDecoder>,
    color_space: Option<TextureColorSpace>,
) -> Option<wgpu::Texture> {
    if container.supercompression != TextureContainerSupercompression::None
        || container.depth != 1
        || container.layers < 1
        || (container.faces != 1 && !(container.faces == 6 && container.layers == 1))
        || container.levels.len() != container.mip_levels * container.layers * container.faces
    {
        return None;
    }

    let native = get_wgpu_render_state_native_device(state);
    let device = &native.device;
    if let Some(format) =
        get_wgpu_compressed_texture_format_for_color_space(device, container.format, color_space)
    {
        let info = get_compressed_format_info(container.format).unwrap();
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: container.width as u32,
                height: container.height as u32,
                depth_or_array_layers: (container.layers * container.faces) as u32,
            },
            mip_level_count: container.mip_levels as u32,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        for (flat, level) in container.levels.iter().enumerate() {
            let mip_level = flat % container.mip_levels;
            let slice = flat / container.mip_levels;
            let bytes = &payload[level.byte_offset..level.byte_offset + level.byte_length];
            let block_rows = level.height.div_ceil(info.block_height as usize) as u32;
            write_wgpu_texture(
                &native,
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: mip_level as u32,
                    origin: wgpu::Origin3d {
                        x: 0,
                        y: 0,
                        z: slice as u32,
                    },
                    aspect: wgpu::TextureAspect::All,
                },
                bytes,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(
                        level.width.div_ceil(info.block_width as usize) as u32
                            * info.bytes_per_block,
                    ),
                    rows_per_image: Some(block_rows),
                },
                wgpu::Extent3d {
                    width: level.width as u32,
                    height: level.height as u32,
                    depth_or_array_layers: 1,
                },
            );
        }
        return Some(texture);
    }

    let decode = decode?;
    if container.faces != 1 || container.layers != 1 {
        return None;
    }
    let mut decoded: Vec<Vec<u8>> = Vec::new();
    for level in &container.levels {
        let bytes = &payload[level.byte_offset..level.byte_offset + level.byte_length];
        let rgba = decode(
            container.format,
            level.width as u32,
            level.height as u32,
            bytes,
        )?;
        if rgba.len() != level.width * level.height * 4 {
            return None;
        }
        decoded.push(rgba);
    }
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: container.width as u32,
            height: container.height as u32,
            depth_or_array_layers: 1,
        },
        mip_level_count: container.mip_levels as u32,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: if color_space == Some(TextureColorSpace::Srgb) {
            wgpu::TextureFormat::Rgba8UnormSrgb
        } else {
            wgpu::TextureFormat::Rgba8Unorm
        },
        usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    for (mip_level, level) in container.levels.iter().enumerate() {
        write_wgpu_texture(
            &native,
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: mip_level as u32,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &decoded[mip_level],
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(level.width as u32 * 4),
                rows_per_image: Some(level.height as u32),
            },
            wgpu::Extent3d {
                width: level.width as u32,
                height: level.height as u32,
                depth_or_array_layers: 1,
            },
        );
    }
    return Some(texture);
}
