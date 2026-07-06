//! The Rust render targets the harness renders a scene graph through.
//!
//! These are the native cells of the [parity matrix](../../../tools/agents/docs/rust/parity.md):
//! `rnat:wgpu`, `rnat:gl`, and `rnat:skia`. A caller selects one or more targets
//! and renders the same [`SceneGraph`](crate::SceneGraph) through each; the
//! matrix is **sparse** — a cell a target cannot render (no adapter/context)
//! reports a clean status rather than failing the run.

/// One Rust render target — a column of the native parity matrix.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub enum RenderTarget {
    /// `displayobject-skia` over tiny-skia: portable CPU software rasterizer.
    /// Bit-deterministic across machines, needs no GPU — the conformance
    /// reference the GPU cells are checked against.
    Skia,
    /// `displayobject-gl` over `render-gl`/glow on a headless EGL context.
    Gl,
    /// `displayobject-wgpu` over `render-wgpu`/wgpu.
    Wgpu,
}

impl RenderTarget {
    /// All targets, in matrix-column order (software reference first).
    pub const ALL: [RenderTarget; 3] = [RenderTarget::Skia, RenderTarget::Gl, RenderTarget::Wgpu];

    /// The short `rnat:<backend>` cell label used in matrix output and as the
    /// per-target baseline directory name.
    pub fn label(self) -> &'static str {
        match self {
            RenderTarget::Skia => "skia",
            RenderTarget::Gl => "gl",
            RenderTarget::Wgpu => "wgpu",
        }
    }

    /// Parses a target from its [`label`](Self::label); `None` for an unknown
    /// name. Used by a runner's `--target <name>` selection.
    pub fn from_label(label: &str) -> Option<RenderTarget> {
        match label {
            "skia" => Some(RenderTarget::Skia),
            "gl" => Some(RenderTarget::Gl),
            "wgpu" => Some(RenderTarget::Wgpu),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_label_round_trips_every_target() {
        for target in RenderTarget::ALL {
            assert_eq!(RenderTarget::from_label(target.label()), Some(target));
        }
    }

    #[test]
    fn from_label_rejects_unknown() {
        assert_eq!(RenderTarget::from_label("canvas"), None);
    }
}
