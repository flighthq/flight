use flight_render::{RenderTargetDepth, RenderTargetFormat};

/// Scene-target configuration shared by the backend effect pipelines (TS `EffectStateOptions`,
/// owned by effects per D8 because the GL and WebGPU effect states both name it).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct EffectStateOptions {
    /// Depth attachment for depth-dependent effects (SSAO, DoF, fog). Default `None` depth.
    pub depth: Option<RenderTargetDepth>,
    /// `Rgba16F` gives bloom/tone-mapping HDR headroom. Default `Rgba8`.
    pub format: Option<RenderTargetFormat>,
    /// MSAA on the scene target so going offscreen for effects keeps edge AA. Default 1.
    pub sample_count: Option<f32>,
}
