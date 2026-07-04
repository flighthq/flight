//! Wgpu depth target — a standalone depth/stencil texture for passes that
//! need depth testing or stencil operations without a full render target.

use crate::render_state::WgpuRenderState;

/// A depth/stencil texture with its view.
pub struct WgpuDepthTarget {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub width: u32,
    pub height: u32,
    pub format: wgpu::TextureFormat,
}

/// Allocates a depth/stencil texture of the given size.
///
/// The default format is `Depth24PlusStencil8`, matching the render target
/// depth attachment convention.
pub fn create_wgpu_depth_target(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
) -> WgpuDepthTarget {
    let format = wgpu::TextureFormat::Depth24PlusStencil8;
    let texture = state.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("depth_target"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

    WgpuDepthTarget {
        texture,
        view,
        width,
        height,
        format,
    }
}

/// Frees the GPU resources owned by `target`.
pub fn destroy_wgpu_depth_target(_state: &WgpuRenderState, target: WgpuDepthTarget) {
    target.texture.destroy();
}

/// Returns a reference to the depth target's texture view, suitable for use
/// as a depth/stencil attachment in a render pass.
pub fn get_wgpu_depth_target_view(target: &WgpuDepthTarget) -> &wgpu::TextureView {
    &target.view
}

/// Recreates the depth target at a new size, destroying the old texture.
pub fn resize_wgpu_depth_target(
    state: &WgpuRenderState,
    target: &mut WgpuDepthTarget,
    width: u32,
    height: u32,
) {
    target.texture.destroy();
    let new = create_wgpu_depth_target(state, width, height);
    target.texture = new.texture;
    target.view = new.view;
    target.width = new.width;
    target.height = new.height;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wgpu_depth_target_fields_are_public() {
        let _: fn(&WgpuDepthTarget) -> u32 = |t| t.width;
    }
}
