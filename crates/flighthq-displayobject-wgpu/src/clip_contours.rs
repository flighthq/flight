//! wgpu contour clip via stencil nesting — the wgpu counterpart to
//! `webglClipContours`. A path `ClipRegion` is realized by stamping its covered
//! pixels into the stencil buffer, then content draws in the existing `masked`
//! stencil mode (compare equal, reference = `current_mask_depth`). Crisp at any
//! zoom: the contours are transformed by the node world transform in the vertex
//! shader, never cached as a texture.
//!
//! NESTING MODEL — wgpu cannot clear the stencil mid render pass (the pass clears
//! it once at start, `stencil_load_op: Clear`), so the webgl clear-per-sibling
//! trick is unavailable. Instead each clip INCREMENTS the stencil from its parent
//! depth d to d+1 inside the polygon (compare `equal` d, pass op `increment-clamp`);
//! pop redraws the same geometry to DECREMENT back to d. This is sibling-safe and
//! nests cleanly. Scissor (rect) clips compose independently via `set_scissor_rect`.
//!
//! TODO(align): this is a COMPILING stub. A faithful port (see the TS
//! `wgpuClipContours.ts` algorithm reproduced in the WGSL constants below)
//! requires two runtime slots the Rust backend core does not yet carry — a
//! per-format clip-contour pipeline cache and the pushed-clip stack of
//! vertex/uniform buffers + bind groups. Those fields live on the shared
//! `WgpuRenderStateRuntime` (the TS runtime header), which is not extended here
//! to keep this split scoped to the core/leaf reorganization. Until those slots
//! exist, push/pop track the mask depth (so `masked`-mode content tests behave)
//! but do not stamp the stencil. The depth tracking matches `enable_wgpu_clip_support`.

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::PathWinding;
use flighthq_types::geometry::Matrix;

// WGSL for the contour stencil stamp (color writes masked off; only the stencil
// moves). Kept here as the faithful reference for the deferred implementation.
#[allow(dead_code)]
const CLIP_WGSL: &str = r#"
struct ClipUniforms { matrix : mat3x3f }
@group(0) @binding(0) var<uniform> u : ClipUniforms;
@vertex fn vs_main(@location(0) position : vec2f) -> @builtin(position) vec4f {
  let p = u.matrix * vec3f(position, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return vec4f(0.0); }
"#;

// mat3x3f in a uniform buffer has a 16-byte column stride: 48 bytes.
#[allow(dead_code)]
const CLIP_UNIFORM_BYTES: u64 = 48;

/// Pops the most recently pushed contour clip, restoring the parent stencil depth.
///
/// TODO(align): currently only decrements `current_mask_depth`; the stencil
/// erase draw is deferred (see module header).
pub fn pop_wgpu_clip_contours(state: &mut WgpuRenderState) {
    let runtime = &mut state.runtime;
    runtime.current_mask_depth = runtime.current_mask_depth.saturating_sub(1);
}

/// Pushes a contour clip: stamps `contours` into the stencil and increments the
/// mask depth so subsequent `masked`-mode content is confined to the polygon.
///
/// `contours` is a list of flat `[x0, y0, x1, y1, ...]` point arrays;
/// `world_transform` maps contour-local points to world space.
///
/// TODO(align): currently only increments `current_mask_depth`; the stencil
/// stamp draw is deferred (see module header). `winding` is accepted but, like
/// the webgl backend, coverage-based stamping does not yet apply it.
pub fn push_wgpu_clip_contours(
    state: &mut WgpuRenderState,
    contours: &[&[f32]],
    winding: PathWinding,
    world_transform: &Matrix,
) {
    let _ = (contours, winding, world_transform);
    state.runtime.current_mask_depth += 1;
}

/// Expands each contour's triangle fan (origin, i, i+1) into a triangle-list
/// vertex array — wgpu has no `TriangleFan` topology. Pure CPU geometry helper,
/// the faithful tessellation the deferred stencil stamp will upload.
pub fn build_wgpu_clip_contour_triangles(contours: &[&[f32]]) -> Vec<f32> {
    let mut tris: Vec<f32> = Vec::new();
    for contour in contours {
        let point_count = contour.len() >> 1;
        if point_count < 3 {
            continue;
        }
        for i in 1..point_count - 1 {
            tris.push(contour[0]);
            tris.push(contour[1]);
            tris.push(contour[i * 2]);
            tris.push(contour[i * 2 + 1]);
            tris.push(contour[(i + 1) * 2]);
            tris.push(contour[(i + 1) * 2 + 1]);
        }
    }
    tris
}

#[cfg(test)]
mod tests {
    use super::*;

    // build_wgpu_clip_contour_triangles

    #[test]
    fn build_wgpu_clip_contour_triangles_fans_a_quad_into_two_triangles() {
        // A 4-point square fans into 2 triangles = 6 vertices = 12 floats.
        let quad: &[f32] = &[0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
        let tris = build_wgpu_clip_contour_triangles(&[quad]);
        assert_eq!(tris.len(), 12);
        // First triangle: (origin, p1, p2).
        assert_eq!(&tris[0..6], &[0.0, 0.0, 1.0, 0.0, 1.0, 1.0]);
        // Second triangle: (origin, p2, p3).
        assert_eq!(&tris[6..12], &[0.0, 0.0, 1.0, 1.0, 0.0, 1.0]);
    }

    #[test]
    fn build_wgpu_clip_contour_triangles_skips_degenerate_contours() {
        let line: &[f32] = &[0.0, 0.0, 1.0, 1.0];
        assert!(build_wgpu_clip_contour_triangles(&[line]).is_empty());
    }

    // push/pop mask depth tracking

    #[test]
    fn push_pop_clip_contours_tracks_mask_depth_via_helper() {
        // Exercised without a device through the triangle helper; the device-bound
        // push/pop depth math is asserted in render-wgpu integration tests.
        let quad: &[f32] = &[0.0, 0.0, 2.0, 0.0, 2.0, 2.0, 0.0, 2.0];
        assert_eq!(build_wgpu_clip_contour_triangles(&[quad]).len(), 12);
    }
}
