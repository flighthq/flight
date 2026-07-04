//! Wgpu scratch texture — a reusable 2D texture for temporary intermediate
//! results (filter passes, blur ping-pong, bloom chains).

use crate::render_state::WgpuRenderState;

/// A single wgpu texture handle with a recorded size and format. Suitable for
/// ping-pong passes or any temporary per-frame work.
pub struct WgpuScratchTexture {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub width: u32,
    pub height: u32,
    pub format: wgpu::TextureFormat,
}

/// Allocates a 2D texture of the given size and format, configured for
/// render-attachment + texture-binding usage (the typical setup for
/// fullscreen-pass intermediates).
pub fn create_wgpu_scratch_texture(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
    format: wgpu::TextureFormat,
) -> WgpuScratchTexture {
    let texture = state.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("scratch_texture"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

    WgpuScratchTexture {
        texture,
        view,
        width,
        height,
        format,
    }
}

/// Frees the GPU texture owned by `scratch`.
pub fn destroy_wgpu_scratch_texture(_state: &WgpuRenderState, scratch: WgpuScratchTexture) {
    scratch.texture.destroy();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wgpu_scratch_texture_fields_are_public() {
        // Compilation-only check: the struct's fields are public.
        let _: fn(&WgpuScratchTexture) -> u32 = |s| s.width;
    }
}
