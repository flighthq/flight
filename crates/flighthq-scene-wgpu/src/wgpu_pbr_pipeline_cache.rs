//! StandardPbr uber-shader pipeline compilation + per-state cache.
//!
//! A [`WgpuPbrPipeline`] is a compiled StandardPbr uber-shader variant plus the
//! bind-group layouts its bind groups target — the WGSL mirror of `GlPbrProgram`.
//! One exists per distinct (define key + color-attachment format) pair: a wgpu
//! render pipeline bakes both the feature flags and its color target format, so
//! an HDR rgba16float effect target and the bgra8unorm canvas need separate
//! variants. Built once and cached on the `WgpuRenderState`.
//!
//! The `cache_key` helper here is fully portable and faithful to TS
//! (`${format}|${buildWgpuPbrDefineKey(key)}`); the GPU compilation
//! (`compile_wgpu_pbr_pipeline`) and the cache wiring (`ensure_wgpu_pbr_pipeline`)
//! depend on the scene-wgpu per-state runtime — a runtime slot
//! (`WgpuRenderStateRuntime::scene_mesh_material_registry` etc.) that the upstream
//! Rust `flighthq-render-wgpu` / `flighthq-types` header does not yet expose. They
//! are compiling stubs until that seam lands.

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_pbr_prelude::{WgpuPbrDefineKey, build_wgpu_pbr_define_key};

/// A compiled StandardPbr uber-shader variant plus the bind-group layouts its
/// bind groups target. One exists per distinct (define key + color-attachment
/// format) pair; the vertex attribute slots are fixed by the pipeline's vertex
/// layout (0 position, 1 normal, 2 tangent, 3 uv0), so they are not stored here.
pub struct WgpuPbrPipeline {
    pub draw_bind_group_layout: wgpu::BindGroupLayout,
    pub frame_bind_group_layout: wgpu::BindGroupLayout,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub pipeline: wgpu::RenderPipeline,
}

/// The stable cache key for a StandardPbr pipeline variant: the color-attachment
/// format joined to the define key's stable string, mirroring TS
/// `${format}|${buildWgpuPbrDefineKey(key)}`. Pure string assembly — no GPU,
/// faithfully ported and unit-tested.
pub fn build_wgpu_pbr_pipeline_cache_key(
    format: wgpu::TextureFormat,
    key: &WgpuPbrDefineKey,
) -> String {
    format!("{format:?}|{}", build_wgpu_pbr_define_key(key))
}

/// Compiles the StandardPbr uber-shader module for a define key and builds the
/// render pipeline + its bind-group layouts for the given color-attachment
/// format. Pure GPU work — no caching.
///
/// TODO(align): port the full pipeline build once the scene-wgpu per-state
/// runtime seam exists in `flighthq-types`/`flighthq-render-wgpu`. The TS body
/// builds the three bind-group layouts (frame/draw/material), the pipeline layout,
/// the depth24plus-stencil8 depth-stencil (compare `less`, depth write on), the
/// fixed 48-byte vertex layout, and culls back-face unless `key.double_sided`.
pub fn compile_wgpu_pbr_pipeline(
    _state: &mut WgpuRenderState,
    _key: &WgpuPbrDefineKey,
    _format: wgpu::TextureFormat,
) -> WgpuPbrPipeline {
    todo!(
        "TODO(align): port compileWgpuPbrPipeline — blocked on scene-wgpu runtime \
         seam (WgpuSceneRuntime / WgpuRenderStateRuntime scene slots) in flighthq-types"
    )
}

/// Resolves the StandardPbr pipeline for a define key + color-attachment format,
/// compiling and caching it on first use on the scene-wgpu runtime's pipeline
/// cache (keyed by [`build_wgpu_pbr_pipeline_cache_key`]).
///
/// TODO(align): blocked on the scene-wgpu per-state runtime seam (see
/// [`compile_wgpu_pbr_pipeline`]).
pub fn ensure_wgpu_pbr_pipeline<'a>(
    _state: &'a mut WgpuRenderState,
    _key: &WgpuPbrDefineKey,
    _format: wgpu::TextureFormat,
) -> &'a WgpuPbrPipeline {
    todo!(
        "TODO(align): port ensureWgpuPbrPipeline — blocked on scene-wgpu runtime \
         seam (WgpuSceneRuntime.pipelineCache) in flighthq-types"
    )
}

/// The depth-stencil format the scene pass uses, matching render-wgpu's
/// main-canvas / effect-target depth attachment.
pub const DEPTH_STENCIL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24PlusStencil8;

#[cfg(test)]
mod tests {
    use super::*;

    mod build_wgpu_pbr_pipeline_cache_key {
        use super::*;

        #[test]
        fn joins_format_and_define_key() {
            // Mirrors the TS cache-key shape `${format}|${defineKey}`: distinct format
            // or defines produce distinct keys; identical pairs collide (cache soundness).
            let neutral = WgpuPbrDefineKey::default();
            let double_sided = WgpuPbrDefineKey {
                double_sided: true,
                ..Default::default()
            };

            let a = build_wgpu_pbr_pipeline_cache_key(wgpu::TextureFormat::Rgba16Float, &neutral);
            let b = build_wgpu_pbr_pipeline_cache_key(wgpu::TextureFormat::Bgra8Unorm, &neutral);
            let c =
                build_wgpu_pbr_pipeline_cache_key(wgpu::TextureFormat::Rgba16Float, &double_sided);

            assert_ne!(a, b);
            assert_ne!(a, c);
            assert!(a.ends_with("----"));
            assert!(c.ends_with("-d--"));
            assert_eq!(
                a,
                build_wgpu_pbr_pipeline_cache_key(wgpu::TextureFormat::Rgba16Float, &neutral)
            );
        }
    }
}
