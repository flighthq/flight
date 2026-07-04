//! Geometry transform operations: apply a `Matrix4` to positions and the
//! inverse-transpose to normals and `tangent.xyz` (`tangent.w` handedness
//! sign is preserved).
//!
//! Ports `@flighthq/mesh` `meshGeometryTransforms.ts`. All in-place
//! operations bump `geometry.version`. The TS functions are alias-safe
//! (`out === geometry` for the in-place case); Rust's borrow checker forbids
//! passing one value as both `&mut` and `&`, so the in-place entry points
//! here clone the source before delegating to the `_into` variant (the
//! algorithm already reads every input into a local before writing, so the
//! result is identical).

use flighthq_types::{Aabb, Matrix4Like, MeshGeometry};

use crate::mesh_geometry_attributes::get_vertex_attribute_float_offset;
use crate::mesh_geometry_compute::compute_mesh_geometry_bounds;

/// Centers the geometry so that the cached AABB's center moves to the
/// origin. If bounds have not been computed yet, they are computed first.
/// Bumps `geometry.version` (via `translate_mesh_geometry`) unless the
/// geometry is already centered.
pub fn center_mesh_geometry(geometry: &mut MeshGeometry) {
    if geometry.bounds.is_none() {
        let mut bounds = Aabb::default();
        compute_mesh_geometry_bounds(&mut bounds, geometry);
        geometry.bounds = Some(bounds);
    }
    let b = geometry.bounds.unwrap();
    let cx = (b.min.x + b.max.x) * 0.5;
    let cy = (b.min.y + b.max.y) * 0.5;
    let cz = (b.min.z + b.max.z) * 0.5;
    if cx == 0.0 && cy == 0.0 && cz == 0.0 {
        return;
    }
    translate_mesh_geometry(geometry, -cx, -cy, -cz);
}

/// Scales all vertex positions in-place by `(sx, sy, sz)`. Normals and
/// tangents are transformed via the inverse-transpose of the pure scale
/// (i.e. `(1/sx, 1/sy, 1/sz)`) and re-normalized. Bumps `geometry.version`.
pub fn scale_mesh_geometry(geometry: &mut MeshGeometry, sx: f32, sy: f32, sz: f32) {
    let pos_float_offset = get_vertex_attribute_float_offset(
        &geometry.layout,
        flighthq_types::VertexSemantic::Position,
    );
    let norm_float_offset =
        get_vertex_attribute_float_offset(&geometry.layout, flighthq_types::VertexSemantic::Normal);
    let tan_float_offset = get_vertex_attribute_float_offset(
        &geometry.layout,
        flighthq_types::VertexSemantic::Tangent,
    );
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count =
        crate::mesh_geometry::vertex_count_from_layout(&geometry.vertices, &geometry.layout);

    let inv_sx = if sx != 0.0 { 1.0 / sx } else { 0.0 };
    let inv_sy = if sy != 0.0 { 1.0 / sy } else { 0.0 };
    let inv_sz = if sz != 0.0 { 1.0 / sz } else { 0.0 };

    let verts = &mut geometry.vertices;
    for i in 0..vertex_count {
        let vert_base = i * floats_per_vertex;
        if let Some(pos) = pos_float_offset {
            let pb = (vert_base + pos) as usize;
            verts[pb] *= sx;
            verts[pb + 1] *= sy;
            verts[pb + 2] *= sz;
        }
        if let Some(norm) = norm_float_offset {
            let nb = (vert_base + norm) as usize;
            let nx = verts[nb] * inv_sx;
            let ny = verts[nb + 1] * inv_sy;
            let nz = verts[nb + 2] * inv_sz;
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            if len > 0.0 {
                verts[nb] = nx / len;
                verts[nb + 1] = ny / len;
                verts[nb + 2] = nz / len;
            } else {
                verts[nb] = nx;
                verts[nb + 1] = ny;
                verts[nb + 2] = nz;
            }
        }
        if let Some(tan) = tan_float_offset {
            let tb = (vert_base + tan) as usize;
            let tx = verts[tb] * inv_sx;
            let ty = verts[tb + 1] * inv_sy;
            let tz = verts[tb + 2] * inv_sz;
            let len = (tx * tx + ty * ty + tz * tz).sqrt();
            if len > 0.0 {
                verts[tb] = tx / len;
                verts[tb + 1] = ty / len;
                verts[tb + 2] = tz / len;
            } else {
                verts[tb] = tx;
                verts[tb + 1] = ty;
                verts[tb + 2] = tz;
            }
        }
    }
    geometry.version += 1;
    if geometry.bounds.is_some() {
        let mut bounds = geometry.bounds.unwrap();
        compute_mesh_geometry_bounds(&mut bounds, geometry);
        geometry.bounds = Some(bounds);
    }
}

/// Applies a `Matrix4` to the geometry's vertices in place. Positions are
/// transformed as points (w=1); normals and `tangent.xyz` are transformed by
/// the inverse-transpose of the matrix's upper-left 3x3 and re-normalized.
/// Returns `false` when the matrix is singular (`geometry` is left
/// unchanged). Bumps `geometry.version` on success.
pub fn transform_mesh_geometry(geometry: &mut MeshGeometry, matrix: &Matrix4Like) -> bool {
    let source = geometry.clone();
    transform_mesh_geometry_into(geometry, &source, matrix)
}

/// Applies a `Matrix4` to `source` geometry and writes the result into
/// `out`. Positions are transformed as points (w=1), normals and
/// `tangent.xyz` are transformed by the inverse-transpose of the matrix's
/// upper-left 3x3 (ignoring translation) and re-normalized. `tangent.w` is
/// preserved. Returns `false` and leaves `out` unchanged when the matrix has
/// no inverse (singular), because the correct normal transform is
/// undefined.
pub fn transform_mesh_geometry_into(
    out: &mut MeshGeometry,
    source: &MeshGeometry,
    matrix: &Matrix4Like,
) -> bool {
    let inv_t = match compute_matrix3x3_inverse_transpose(matrix) {
        Some(inv_t) => inv_t,
        None => return false,
    };
    let m = &matrix.m;
    let pos_float_offset =
        get_vertex_attribute_float_offset(&source.layout, flighthq_types::VertexSemantic::Position);
    let norm_float_offset =
        get_vertex_attribute_float_offset(&source.layout, flighthq_types::VertexSemantic::Normal);
    let tan_float_offset =
        get_vertex_attribute_float_offset(&source.layout, flighthq_types::VertexSemantic::Tangent);
    let floats_per_vertex = source.layout.stride / 4;
    let vertex_count =
        crate::mesh_geometry::vertex_count_from_layout(&source.vertices, &source.layout);

    out.vertices = source.vertices.clone();
    let src_verts = &source.vertices;
    let dst_verts = &mut out.vertices;

    for i in 0..vertex_count {
        let vert_base = i * floats_per_vertex;
        if let Some(pos) = pos_float_offset {
            let pb = (vert_base + pos) as usize;
            let px = src_verts[pb];
            let py = src_verts[pb + 1];
            let pz = src_verts[pb + 2];
            dst_verts[pb] = m[0] * px + m[4] * py + m[8] * pz + m[12];
            dst_verts[pb + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13];
            dst_verts[pb + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
        }
        if let Some(norm) = norm_float_offset {
            let nb = (vert_base + norm) as usize;
            let nx = src_verts[nb];
            let ny = src_verts[nb + 1];
            let nz = src_verts[nb + 2];
            let mut tnx = inv_t[0] * nx + inv_t[3] * ny + inv_t[6] * nz;
            let mut tny = inv_t[1] * nx + inv_t[4] * ny + inv_t[7] * nz;
            let mut tnz = inv_t[2] * nx + inv_t[5] * ny + inv_t[8] * nz;
            let len = (tnx * tnx + tny * tny + tnz * tnz).sqrt();
            if len > 0.0 {
                tnx /= len;
                tny /= len;
                tnz /= len;
            }
            dst_verts[nb] = tnx;
            dst_verts[nb + 1] = tny;
            dst_verts[nb + 2] = tnz;
        }
        if let Some(tan) = tan_float_offset {
            let tb = (vert_base + tan) as usize;
            let tx = src_verts[tb];
            let ty = src_verts[tb + 1];
            let tz = src_verts[tb + 2];
            let tw = src_verts[tb + 3];
            let mut ttx = inv_t[0] * tx + inv_t[3] * ty + inv_t[6] * tz;
            let mut tty = inv_t[1] * tx + inv_t[4] * ty + inv_t[7] * tz;
            let mut ttz = inv_t[2] * tx + inv_t[5] * ty + inv_t[8] * tz;
            let len = (ttx * ttx + tty * tty + ttz * ttz).sqrt();
            if len > 0.0 {
                ttx /= len;
                tty /= len;
                ttz /= len;
            }
            dst_verts[tb] = ttx;
            dst_verts[tb + 1] = tty;
            dst_verts[tb + 2] = ttz;
            dst_verts[tb + 3] = tw;
        }
    }

    out.version += 1;
    if let Some(mut bounds) = out.bounds {
        compute_mesh_geometry_bounds(&mut bounds, out);
        out.bounds = Some(bounds);
    }
    true
}

/// Translates all vertex positions in-place by `(x, y, z)`. Normals and
/// tangents are unaffected by a pure translation. Bumps `geometry.version`.
pub fn translate_mesh_geometry(geometry: &mut MeshGeometry, x: f32, y: f32, z: f32) {
    let pos_float_offset = match get_vertex_attribute_float_offset(
        &geometry.layout,
        flighthq_types::VertexSemantic::Position,
    ) {
        Some(off) => off,
        None => return,
    };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count =
        crate::mesh_geometry::vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    let verts = &mut geometry.vertices;
    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + pos_float_offset) as usize;
        verts[base] += x;
        verts[base + 1] += y;
        verts[base + 2] += z;
    }
    geometry.version += 1;
    if let Some(bounds) = &mut geometry.bounds {
        bounds.min.x += x;
        bounds.min.y += y;
        bounds.min.z += z;
        bounds.max.x += x;
        bounds.max.y += y;
        bounds.max.z += z;
    }
}

/// Computes the 3x3 column-major inverse-transpose of the upper-left 3x3 of
/// a 4x4 matrix. Returns `None` when the 3x3 is singular (determinant near
/// zero). The 9-element array is column-major: `[col0row0, col0row1,
/// col0row2, col1row0, col1row1, col1row2, col2row0, col2row1, col2row2]`.
fn compute_matrix3x3_inverse_transpose(matrix: &Matrix4Like) -> Option<[f32; 9]> {
    let m = &matrix.m;
    let a00 = m[0];
    let a01 = m[1];
    let a02 = m[2];
    let a10 = m[4];
    let a11 = m[5];
    let a12 = m[6];
    let a20 = m[8];
    let a21 = m[9];
    let a22 = m[10];
    let c00 = a11 * a22 - a12 * a21;
    let c01 = -(a10 * a22 - a12 * a20);
    let c02 = a10 * a21 - a11 * a20;
    let c10 = -(a01 * a22 - a02 * a21);
    let c11 = a00 * a22 - a02 * a20;
    let c12 = -(a00 * a21 - a01 * a20);
    let c20 = a01 * a12 - a02 * a11;
    let c21 = -(a00 * a12 - a02 * a10);
    let c22 = a00 * a11 - a01 * a10;
    let det = a00 * c00 + a01 * c01 + a02 * c02;
    if det.abs() < 1e-10 {
        return None;
    }
    let inv_det = 1.0 / det;
    Some([
        c00 * inv_det,
        c10 * inv_det,
        c20 * inv_det,
        c01 * inv_det,
        c11 * inv_det,
        c21 * inv_det,
        c02 * inv_det,
        c12 * inv_det,
        c22 * inv_det,
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};
    use flighthq_types::{VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic};

    fn canonical_layout() -> VertexAttributeLayout {
        VertexAttributeLayout {
            attributes: vec![
                VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                },
                VertexAttribute {
                    byte_offset: 12,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Normal,
                },
                VertexAttribute {
                    byte_offset: 24,
                    format: VertexFormat::Float32x4,
                    semantic: VertexSemantic::Tangent,
                },
                VertexAttribute {
                    byte_offset: 40,
                    format: VertexFormat::Float32x2,
                    semantic: VertexSemantic::Uv0,
                },
            ],
            stride: 48,
        }
    }

    fn make_geometry() -> MeshGeometry {
        #[rustfmt::skip]
        let vertices = vec![
            1.0, 2.0, 3.0,  0.0, 1.0, 0.0,  1.0, 0.0, 0.0, 1.0,  0.0, 0.0,
            -1.0, -2.0, -3.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0,
        ];
        create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            subsets: None,
            topology: None,
            vertices,
        })
    }

    mod center_mesh_geometry {
        use super::*;

        #[test]
        fn recenters_positions_so_the_aabb_midpoint_is_the_origin() {
            let mut geo = make_geometry();
            center_mesh_geometry(&mut geo);
            let bounds = geo.bounds.unwrap();
            assert!((bounds.min.x + bounds.max.x).abs() < 1e-5);
        }
    }

    mod scale_mesh_geometry {
        use super::*;

        #[test]
        fn scales_positions_and_bumps_version() {
            let mut geo = make_geometry();
            scale_mesh_geometry(&mut geo, 2.0, 2.0, 2.0);
            assert_eq!(geo.vertices[0], 2.0);
            assert_eq!(geo.vertices[1], 4.0);
            assert_eq!(geo.version, 1);
        }
    }

    mod transform_mesh_geometry {
        use super::*;

        #[test]
        fn applies_the_matrix_to_positions_in_place() {
            let mut geo = make_geometry();
            let mut matrix = Matrix4Like::default();
            matrix.m[12] = 10.0;
            assert!(transform_mesh_geometry(&mut geo, &matrix));
            assert_eq!(geo.vertices[0], 11.0);
            assert_eq!(geo.version, 1);
        }

        #[test]
        fn returns_false_for_a_singular_matrix() {
            let mut geo = make_geometry();
            let mut matrix = Matrix4Like::default();
            matrix.m[0] = 0.0;
            matrix.m[5] = 0.0;
            matrix.m[10] = 0.0;
            assert!(!transform_mesh_geometry(&mut geo, &matrix));
        }
    }

    mod transform_mesh_geometry_into {
        use super::*;

        #[test]
        fn writes_into_a_distinct_out_geometry() {
            let source = make_geometry();
            let mut out = make_geometry();
            let matrix = Matrix4Like::default();
            assert!(transform_mesh_geometry_into(&mut out, &source, &matrix));
            assert_eq!(out.vertices[0], source.vertices[0]);
        }
    }

    mod translate_mesh_geometry {
        use super::*;

        #[test]
        fn translates_positions_and_bumps_version() {
            let mut geo = make_geometry();
            translate_mesh_geometry(&mut geo, 1.0, 1.0, 1.0);
            assert_eq!(geo.vertices[0], 2.0);
            assert_eq!(geo.version, 1);
        }
    }
}
