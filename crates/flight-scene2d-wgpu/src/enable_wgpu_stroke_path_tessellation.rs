//! Opt-in closed-ring stroke tessellation (TS `enableWgpuStrokePathTessellation.ts`).

use flight_path::{Path, PathMesh, StrokeStyle, tessellate_stroke_path};
use flight_render::RenderState;
use flight_render_wgpu::WgpuRenderState;

/// Installs the closed-ring/pathology-aware stroke kernel only for states that need it (TS
/// `enableWgpuStrokePathTessellation`). Ordinary shape bundles keep the compact open-outline mesh
/// lane and rasterize closed strokes.
pub fn enable_wgpu_stroke_path_tessellation(state: &mut WgpuRenderState) {
    state.render_registries_mut().stroke_tessellator = Some(tessellate_wgpu_stroke_path);
}

// The render registry's tessellator takes the f32 tolerance of its slot; the path kernel computes
// in double precision.
// flight-lint: allow(f64) adapts the registry slot's f32 tolerance to the path kernel's declared f64 tolerance
fn tessellate_wgpu_stroke_path(
    path: &Path,
    style: &StrokeStyle,
    tolerance: Option<f32>,
) -> Option<PathMesh> {
    return tessellate_stroke_path(path, style, tolerance.map(f64::from));
}
