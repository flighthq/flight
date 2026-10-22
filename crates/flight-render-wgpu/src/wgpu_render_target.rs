// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Target-level helpers shared by both target kinds (TS `wgpuRenderTarget.ts`).

use flight_texture::RenderTargetColorSpace;

use crate::types::*;

/// Stamps the color space produced into the target the innermost open pass is bound to (TS
/// `declareWgpuRenderTargetColorSpace`); `false` when no pass is open.
pub fn declare_wgpu_render_target_color_space(
    state: &mut WgpuRenderState,
    color_space: RenderTargetColorSpace,
) -> bool {
    let Some(target) = &state.runtime.current_render_target else {
        return false;
    };
    match target {
        WgpuRenderTarget::Screen(screen) => screen.write().unwrap().color_space = color_space,
        WgpuRenderTarget::Texture(texture) => texture.write().unwrap().color_space = color_space,
    }
    return true;
}

pub(crate) fn get_wgpu_render_target_depth_stencil_view(
    target: &WgpuRenderTarget,
) -> wgpu::TextureView {
    return match target {
        WgpuRenderTarget::Screen(screen) => screen.read().unwrap().depth_stencil_view.clone(),
        WgpuRenderTarget::Texture(texture) => texture.read().unwrap().depth_stencil_view.clone(),
    };
}

pub(crate) fn get_wgpu_render_target_extent(target: &WgpuRenderTarget) -> (u32, u32) {
    return match target {
        WgpuRenderTarget::Screen(screen) => {
            let screen = screen.read().unwrap();
            (screen.width, screen.height)
        }
        WgpuRenderTarget::Texture(texture) => {
            let texture = texture.read().unwrap();
            (texture.width, texture.height)
        }
    };
}

pub(crate) fn get_wgpu_render_target_format(target: &WgpuRenderTarget) -> wgpu::TextureFormat {
    return match target {
        WgpuRenderTarget::Screen(screen) => screen.read().unwrap().format,
        WgpuRenderTarget::Texture(texture) => texture.read().unwrap().format,
    };
}

/// Device pixels per logical pixel in a target: 2 when supersampled, 1 otherwise (TS
/// `getWgpuRenderTargetSupersampleScale`). Screen targets supersample through `antialias`, texture
/// targets through a sample count of 4; the scale is derived so the allocator and the projection
/// agree.
pub fn get_wgpu_render_target_supersample_scale(target: &WgpuRenderTarget) -> u32 {
    return match target {
        WgpuRenderTarget::Screen(screen) => {
            if screen.read().unwrap().antialias {
                WGPU_RENDER_TARGET_SUPERSAMPLE_SCALE
            } else {
                1
            }
        }
        WgpuRenderTarget::Texture(texture) => {
            if texture.read().unwrap().sample_count == 4 {
                WGPU_RENDER_TARGET_SUPERSAMPLE_SCALE
            } else {
                1
            }
        }
    };
}

// The one supersample factor the whole backend uses; the per-target allocators multiply by it.
const WGPU_RENDER_TARGET_SUPERSAMPLE_SCALE: u32 = 2;
