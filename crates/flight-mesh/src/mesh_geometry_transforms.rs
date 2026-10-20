use flight_geometry::Aabb;
use flight_geometry::Matrix4;

use crate::IndexBuffer;
use crate::MeshGeometry;
use crate::PrimitiveTopology;
use crate::compute_mesh_geometry_bounds;
use crate::get_vertex_attribute_float_offset;
use crate::VertexSemantic;

/// Centers the geometry so that the cached AABB's center moves to the origin. If bounds
/// have not been computed yet, they are computed first. Bumps geometry.version.
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

/// Scales all vertex positions in-place by (sx, sy, sz). Normals are transformed by the
/// inverse-transpose of the scale and tangents by the scale itself, both re-normalized.
/// A negative-determinant scale mirrors the mesh, reversing triangle winding and negating
/// tangent.w. Bumps geometry.version.
pub fn scale_mesh_geometry(geometry: &mut MeshGeometry, sx: f32, sy: f32, sz: f32) {
    transform_mesh_geometry_positions(geometry, sx, sy, sz, 0.0, 0.0, 0.0);
    restore_mirrored_winding_and_handedness(geometry, sx * sy * sz);
}

/// Applies a Matrix4 to the geometry's vertices in place. Positions are transformed as
/// points (w=1); normals by the inverse-transpose of the upper-left 3x3; tangent.xyz by
/// the plain upper-left 3x3. Returns false when the matrix is singular. Bumps geometry.version.
pub fn transform_mesh_geometry(geometry: &mut MeshGeometry, matrix: &Matrix4) -> bool {
    return transform_mesh_geometry_into(geometry, matrix);
}

/// Applies a Matrix4 to the geometry's vertices. Positions as points (w=1), normals via
/// inverse-transpose, tangent.xyz via the plain upper 3x3. Returns false when the matrix
/// is singular. Bumps geometry.version.
///
/// NOTE: In the TS version, this function takes separate `out` and `source` parameters for
/// alias-safe out-parameter writing. In this Rust port, we always operate in-place on the
/// single geometry since Rust's ownership model handles aliasing at the type level.
pub fn transform_mesh_geometry_into(geometry: &mut MeshGeometry, matrix: &Matrix4) -> bool {
    let inv_t = match compute_matrix3x3_inverse_transpose(matrix) {
        Some(v) => v,
        None => { return false; }
    };
    let m = &matrix.m;
    let pos_float_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Position);
    let norm_float_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Normal);
    let tan_float_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Tangent);
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };

    for i in 0..vertex_count {
        let vert_base = (i * floats_per_vertex) as usize;
        if pos_float_offset >= 0 {
            let pb = vert_base + pos_float_offset as usize;
            let px = geometry.vertices[pb];
            let py = geometry.vertices[pb + 1];
            let pz = geometry.vertices[pb + 2];
            geometry.vertices[pb] = m[0] * px + m[4] * py + m[8] * pz + m[12];
            geometry.vertices[pb + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13];
            geometry.vertices[pb + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
        }
        if norm_float_offset >= 0 {
            let nb = vert_base + norm_float_offset as usize;
            let nx = geometry.vertices[nb];
            let ny = geometry.vertices[nb + 1];
            let nz = geometry.vertices[nb + 2];
            let mut tnx = inv_t[0] * nx + inv_t[3] * ny + inv_t[6] * nz;
            let mut tny = inv_t[1] * nx + inv_t[4] * ny + inv_t[7] * nz;
            let mut tnz = inv_t[2] * nx + inv_t[5] * ny + inv_t[8] * nz;
            let len = (tnx * tnx + tny * tny + tnz * tnz).sqrt();
            if len > 0.0 {
                tnx /= len;
                tny /= len;
                tnz /= len;
            }
            geometry.vertices[nb] = tnx;
            geometry.vertices[nb + 1] = tny;
            geometry.vertices[nb + 2] = tnz;
        }
        if tan_float_offset >= 0 {
            let tb = vert_base + tan_float_offset as usize;
            let tx = geometry.vertices[tb];
            let ty = geometry.vertices[tb + 1];
            let tz = geometry.vertices[tb + 2];
            let tw = geometry.vertices[tb + 3];
            let mut ttx = m[0] * tx + m[4] * ty + m[8] * tz;
            let mut tty = m[1] * tx + m[5] * ty + m[9] * tz;
            let mut ttz = m[2] * tx + m[6] * ty + m[10] * tz;
            let len = (ttx * ttx + tty * tty + ttz * ttz).sqrt();
            if len > 0.0 {
                ttx /= len;
                tty /= len;
                ttz /= len;
            }
            geometry.vertices[tb] = ttx;
            geometry.vertices[tb + 1] = tty;
            geometry.vertices[tb + 2] = ttz;
            geometry.vertices[tb + 3] = tw;
        }
    }

    let det = m[0] * (m[5] * m[10] - m[6] * m[9])
        - m[4] * (m[1] * m[10] - m[2] * m[9])
        + m[8] * (m[1] * m[6] - m[2] * m[5]);
    restore_mirrored_winding_and_handedness(geometry, det);

    geometry.version += 1;
    if geometry.bounds.is_some() {
        let mut bounds = geometry.bounds.unwrap();
        compute_mesh_geometry_bounds(&mut bounds, geometry);
        geometry.bounds = Some(bounds);
    }
    return true;
}

/// Translates all vertex positions in-place by (x, y, z). Normals and tangents are
/// unaffected. Bumps geometry.version.
pub fn translate_mesh_geometry(geometry: &mut MeshGeometry, x: f32, y: f32, z: f32) {
    let pos_float_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Position);
    if pos_float_offset < 0 {
        return;
    }
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + pos_float_offset as u32) as usize;
        geometry.vertices[base] += x;
        geometry.vertices[base + 1] += y;
        geometry.vertices[base + 2] += z;
    }
    geometry.version += 1;
    if let Some(ref mut bounds) = geometry.bounds {
        bounds.min.x += x;
        bounds.min.y += y;
        bounds.min.z += z;
        bounds.max.x += x;
        bounds.max.y += y;
        bounds.max.z += z;
    }
}

// --- Private helpers ---

fn compute_matrix3x3_inverse_transpose(matrix: &Matrix4) -> Option<[f32; 9]> {
    let m = &matrix.m;
    let a00 = m[0]; let a01 = m[1]; let a02 = m[2];
    let a10 = m[4]; let a11 = m[5]; let a12 = m[6];
    let a20 = m[8]; let a21 = m[9]; let a22 = m[10];
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
    return Some([
        c00 * inv_det, c10 * inv_det, c20 * inv_det,
        c01 * inv_det, c11 * inv_det, c21 * inv_det,
        c02 * inv_det, c12 * inv_det, c22 * inv_det,
    ]);
}

fn restore_mirrored_winding_and_handedness(geometry: &mut MeshGeometry, determinant: f32) {
    if determinant >= 0.0 {
        return;
    }

    let tan_float_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Tangent);
    let floats_per_vertex = geometry.layout.stride / 4;
    if tan_float_offset >= 0 && floats_per_vertex > 0 {
        let vertex_count = geometry.vertices.len() as u32 / floats_per_vertex;
        for i in 0..vertex_count {
            let w_index = (i * floats_per_vertex + tan_float_offset as u32 + 3) as usize;
            geometry.vertices[w_index] = -geometry.vertices[w_index];
        }
    }

    if geometry.topology != PrimitiveTopology::TriangleList {
        return;
    }

    match &mut geometry.indices {
        IndexBuffer::U16(v) => {
            let mut i = 0;
            while i + 2 < v.len() {
                v.swap(i + 1, i + 2);
                i += 3;
            }
        }
        IndexBuffer::U32(v) => {
            let mut i = 0;
            while i + 2 < v.len() {
                v.swap(i + 1, i + 2);
                i += 3;
            }
        }
        IndexBuffer::None => {
            if floats_per_vertex == 0 {
                return;
            }
            let fpv = floats_per_vertex as usize;
            let vertex_count = geometry.vertices.len() / fpv;
            let mut scratch = vec![0.0f32; fpv];
            let mut triangle = 0;
            while triangle + 2 < vertex_count {
                let second = (triangle + 1) * fpv;
                let third = (triangle + 2) * fpv;
                scratch.copy_from_slice(&geometry.vertices[second..second + fpv]);
                geometry.vertices.copy_within(third..third + fpv, second);
                geometry.vertices[third..third + fpv].copy_from_slice(&scratch);
                triangle += 3;
            }
        }
    }
}

fn transform_mesh_geometry_positions(
    geometry: &mut MeshGeometry,
    sx: f32,
    sy: f32,
    sz: f32,
    tx: f32,
    ty: f32,
    tz: f32,
) {
    let pos_float_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Position);
    let norm_float_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Normal);
    let tan_float_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Tangent);
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };

    let inv_sx = if sx != 0.0 { 1.0 / sx } else { 0.0 };
    let inv_sy = if sy != 0.0 { 1.0 / sy } else { 0.0 };
    let inv_sz = if sz != 0.0 { 1.0 / sz } else { 0.0 };

    for i in 0..vertex_count {
        let vert_base = (i * floats_per_vertex) as usize;
        if pos_float_offset >= 0 {
            let pb = vert_base + pos_float_offset as usize;
            let px = geometry.vertices[pb];
            let py = geometry.vertices[pb + 1];
            let pz = geometry.vertices[pb + 2];
            geometry.vertices[pb] = px * sx + tx;
            geometry.vertices[pb + 1] = py * sy + ty;
            geometry.vertices[pb + 2] = pz * sz + tz;
        }
        if norm_float_offset >= 0 {
            let nb = vert_base + norm_float_offset as usize;
            let nx = geometry.vertices[nb];
            let ny = geometry.vertices[nb + 1];
            let nz = geometry.vertices[nb + 2];
            let mut nnx = nx * inv_sx;
            let mut nny = ny * inv_sy;
            let mut nnz = nz * inv_sz;
            let len = (nnx * nnx + nny * nny + nnz * nnz).sqrt();
            if len > 0.0 {
                nnx /= len;
                nny /= len;
                nnz /= len;
            }
            geometry.vertices[nb] = nnx;
            geometry.vertices[nb + 1] = nny;
            geometry.vertices[nb + 2] = nnz;
        }
        if tan_float_offset >= 0 {
            let tb = vert_base + tan_float_offset as usize;
            let ttx = geometry.vertices[tb];
            let tty = geometry.vertices[tb + 1];
            let ttz = geometry.vertices[tb + 2];
            let tw = geometry.vertices[tb + 3];
            let mut ntx = ttx * sx;
            let mut nty = tty * sy;
            let mut ntz = ttz * sz;
            let len = (ntx * ntx + nty * nty + ntz * ntz).sqrt();
            if len > 0.0 {
                ntx /= len;
                nty /= len;
                ntz /= len;
            }
            geometry.vertices[tb] = ntx;
            geometry.vertices[tb + 1] = nty;
            geometry.vertices[tb + 2] = ntz;
            geometry.vertices[tb + 3] = tw;
        }
    }
    geometry.version += 1;
    if geometry.bounds.is_some() {
        let mut bounds = geometry.bounds.unwrap();
        compute_mesh_geometry_bounds(&mut bounds, geometry);
        geometry.bounds = Some(bounds);
    }
}
