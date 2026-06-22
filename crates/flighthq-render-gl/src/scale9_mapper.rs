//! GL scale-9 mapper — computes nine-slice geometry for atlas regions.

/// Decomposes a scale-9 region into 9 quads and appends their vertex data to
/// `out_verts` as flat (x, y, u, v) tuples, four corners per quad (TL, TR, BR,
/// BL × 9 quads = 144 floats). Pure CPU — the testable seam for nine-slice
/// geometry.
///
/// `border_*` are the inset distances (in source pixels) defining the fixed
/// corners; the center and edges stretch to fill `dst_width` × `dst_height`.
#[allow(clippy::too_many_arguments)]
pub fn compute_gl_scale9_quads(
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
    // Destination column / row boundaries.
    let dx = [0.0, border_left, dst_width - border_right, dst_width];
    let dy = [0.0, border_top, dst_height - border_bottom, dst_height];
    // Source column / row boundaries (in atlas pixels).
    let sx = [
        src_x,
        src_x + border_left,
        src_x + src_width - border_right,
        src_x + src_width,
    ];
    let sy = [
        src_y,
        src_y + border_top,
        src_y + src_height - border_bottom,
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
            // TL, TR, BR, BL
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

    // compute_gl_scale9_quads

    #[test]
    fn compute_gl_scale9_quads_emits_nine_quads() {
        let mut out = Vec::new();
        compute_gl_scale9_quads(
            0.0, 0.0, 100.0, 100.0, 10.0, 10.0, 10.0, 10.0, 200.0, 200.0, 0.01, 0.01, &mut out,
        );
        // 9 quads × 4 corners × 4 floats = 144.
        assert_eq!(out.len(), 144);
    }

    #[test]
    fn compute_gl_scale9_quads_first_corner_is_fixed() {
        let mut out = Vec::new();
        compute_gl_scale9_quads(
            0.0, 0.0, 100.0, 100.0, 10.0, 10.0, 10.0, 10.0, 200.0, 200.0, 0.01, 0.01, &mut out,
        );
        // First quad TL corner is the destination origin (0,0) and source uv (0,0).
        assert_eq!(&out[0..4], &[0.0, 0.0, 0.0, 0.0]);
        // First quad spans border_left (10) in destination and 10*iw in uv.
        assert_eq!(out[4], 10.0); // TR.x
        assert!((out[6] - 10.0 * 0.01).abs() < 1e-6); // TR.u
    }

    #[test]
    fn compute_gl_scale9_quads_center_stretches() {
        let mut out = Vec::new();
        compute_gl_scale9_quads(
            0.0, 0.0, 100.0, 100.0, 10.0, 10.0, 10.0, 10.0, 200.0, 200.0, 0.01, 0.01, &mut out,
        );
        // Center quad is index 4 (row 1, col 1): 4 quads * 16 floats = offset 64.
        let center = &out[64..80];
        // Center destination spans [10, 190] in both axes.
        assert_eq!(center[0], 10.0); // TL.x
        assert_eq!(center[4], 190.0); // TR.x
    }
}
