//! GL scale-9 mapper — computes nine-slice geometry for atlas regions.

/// Decomposes a scale-9 region into 9 quads and writes their vertex data.
///
/// The source atlas region `(src_x, src_y, src_width, src_height)` is split into
/// a 3×3 grid by the four borders. The destination region `(0,0,dst_width,dst_height)`
/// is split into a matching 3×3 grid with the corners kept at their natural
/// border size and the edges/center stretched to fill the remaining space.
///
/// `out_verts` is cleared, then filled with 16 floats per quad — four corners of
/// `(x, y, u, v)` in the order top-left, top-right, bottom-right, bottom-left —
/// for all 9 quads (144 floats total). UVs are normalized by `atlas_iw`/`atlas_ih`
/// (the reciprocal atlas dimensions). Pure CPU — the testable seam for nine-slice
/// geometry. Mirrors the TS `buildGlScale9Mapper` / wgpu `build_wgpu_scale9_mapper`.
#[allow(clippy::too_many_arguments)]
pub fn build_gl_scale9_mapper(
    src_x: f32,
    src_y: f32,
    src_width: f32,
    src_height: f32,
    border_left: f32,
    border_top: f32,
    border_right: f32,
    border_bottom: f32,
    dst_width: f32,
    dst_height: f32,
    atlas_iw: f32,
    atlas_ih: f32,
    out_verts: &mut Vec<f32>,
) {
    out_verts.clear();

    // Destination column / row boundaries. The far edge never crosses the near
    // border, so a destination smaller than both borders collapses the center.
    let dx = [
        0.0,
        border_left,
        (dst_width - border_right).max(border_left),
        dst_width,
    ];
    let dy = [
        0.0,
        border_top,
        (dst_height - border_bottom).max(border_top),
        dst_height,
    ];
    // Source column / row boundaries (in atlas pixels).
    let sx = [
        src_x,
        src_x + border_left,
        src_x + (src_width - border_right).max(border_left),
        src_x + src_width,
    ];
    let sy = [
        src_y,
        src_y + border_top,
        src_y + (src_height - border_bottom).max(border_top),
        src_y + src_height,
    ];

    for row in 0..3 {
        for col in 0..3 {
            let x0 = dx[col];
            let x1 = dx[col + 1];
            let y0 = dy[row];
            let y1 = dy[row + 1];
            let u0 = sx[col] * atlas_iw;
            let u1 = sx[col + 1] * atlas_iw;
            let v0 = sy[row] * atlas_ih;
            let v1 = sy[row + 1] * atlas_ih;
            // top-left, top-right, bottom-right, bottom-left
            out_verts.extend_from_slice(&[x0, y0, u0, v0]);
            out_verts.extend_from_slice(&[x1, y0, u1, v0]);
            out_verts.extend_from_slice(&[x1, y1, u1, v1]);
            out_verts.extend_from_slice(&[x0, y1, u0, v1]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // build_gl_scale9_mapper

    #[test]
    fn build_gl_scale9_mapper_emits_nine_quads() {
        let mut out = Vec::new();
        build_gl_scale9_mapper(
            0.0, 0.0, 100.0, 100.0, 10.0, 10.0, 10.0, 10.0, 200.0, 200.0, 0.01, 0.01, &mut out,
        );
        // 9 quads × 4 corners × 4 floats = 144.
        assert_eq!(out.len(), 144);
    }

    #[test]
    fn build_gl_scale9_mapper_first_corner_is_fixed() {
        let mut out = Vec::new();
        build_gl_scale9_mapper(
            0.0, 0.0, 100.0, 100.0, 10.0, 10.0, 10.0, 10.0, 200.0, 200.0, 0.01, 0.01, &mut out,
        );
        // First quad TL corner is the destination origin (0,0) and source uv (0,0).
        assert_eq!(&out[0..4], &[0.0, 0.0, 0.0, 0.0]);
        // First quad spans border_left (10) in destination and 10*iw in uv.
        assert_eq!(out[4], 10.0); // TR.x
        assert!((out[6] - 10.0 * 0.01).abs() < 1e-6); // TR.u
    }

    #[test]
    fn build_gl_scale9_mapper_center_stretches() {
        let mut out = Vec::new();
        build_gl_scale9_mapper(
            0.0, 0.0, 100.0, 100.0, 10.0, 10.0, 10.0, 10.0, 200.0, 200.0, 0.01, 0.01, &mut out,
        );
        // Center quad is index 4 (row 1, col 1): 4 quads * 16 floats = offset 64.
        let center = &out[64..80];
        // Center destination spans [10, 190] in both axes.
        assert_eq!(center[0], 10.0); // TL.x
        assert_eq!(center[4], 190.0); // TR.x
    }

    #[test]
    fn build_gl_scale9_mapper_clears_prior_contents() {
        let mut out = vec![7.0; 5];
        build_gl_scale9_mapper(
            0.0, 0.0, 100.0, 100.0, 10.0, 10.0, 10.0, 10.0, 200.0, 200.0, 0.01, 0.01, &mut out,
        );
        // The stale prefix is dropped before filling.
        assert_eq!(out.len(), 144);
        assert_eq!(&out[0..4], &[0.0, 0.0, 0.0, 0.0]);
    }
}
