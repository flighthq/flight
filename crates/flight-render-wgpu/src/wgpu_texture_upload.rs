// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Texel-upload primitives for one texture region (TS `wgpuTextureUpload.ts`), the wgpu mirror of
//! render-gl's texture upload. The caller owns texture creation and format.

use flight_host::HostImageSource;
use flight_image::ImageResource;

use crate::types::WgpuNativeDevice;
use crate::wgpu_command_observer::write_wgpu_texture;
use crate::wgpu_external_image_source::{
    narrow_wgpu_external_image_source, try_copy_wgpu_external_image_to_texture,
};

/// Uploads tightly packed RGBA8 pixels through the queue (TS `uploadWgpuTextureData`), the portable
/// bedrock upload.
pub fn upload_wgpu_texture_data(
    device: &WgpuNativeDevice,
    texture: &wgpu::Texture,
    origin: wgpu::Origin3d,
    width: u32,
    height: u32,
    data: &[u8],
) {
    write_wgpu_texture(
        device,
        wgpu::TexelCopyTextureInfo {
            texture,
            mip_level: 0,
            origin,
            aspect: wgpu::TextureAspect::All,
        },
        data,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
}

/// Uploads a decoded host image through the external copy (TS `uploadWgpuTextureElement`).
pub fn upload_wgpu_texture_element(
    device: &WgpuNativeDevice,
    texture: &wgpu::Texture,
    origin: wgpu::Origin3d,
    width: u32,
    height: u32,
    source: &HostImageSource,
) {
    let source = narrow_wgpu_external_image_source(source);
    try_copy_wgpu_external_image_to_texture(
        &device.queue,
        source.as_ref(),
        texture,
        origin,
        false,
        width,
        height,
    );
}

/// Uploads a host-backed image resource through the external copy (TS
/// `uploadWgpuTextureImageResource`).
pub fn upload_wgpu_texture_image_resource(
    device: &WgpuNativeDevice,
    texture: &wgpu::Texture,
    origin: wgpu::Origin3d,
    image: &ImageResource,
) {
    upload_wgpu_texture_element(
        device,
        texture,
        origin,
        image.width,
        image.height,
        &image.source,
    );
}
