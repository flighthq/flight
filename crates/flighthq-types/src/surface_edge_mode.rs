//! `SurfaceEdgeMode` — how out-of-bounds source samples are resolved.
//!
//! Ports the TS `SurfaceEdgeMode` string union
//! (`'transparent' | 'clamp' | 'wrap' | 'mirror'`) used by surface warp
//! sampling. `Transparent` yields transparent black outside the source bounds;
//! `Clamp` extends border pixels; `Wrap` tiles; `Mirror` reflects.

/// How a sampler resolves a source coordinate that lies outside the source
/// bounds.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SurfaceEdgeMode {
    /// Out-of-bounds samples become transparent black.
    #[default]
    Transparent,
    /// Out-of-bounds samples clamp to the nearest border pixel.
    Clamp,
    /// Out-of-bounds samples wrap around (tile).
    Wrap,
    /// Out-of-bounds samples mirror back across the border.
    Mirror,
}
