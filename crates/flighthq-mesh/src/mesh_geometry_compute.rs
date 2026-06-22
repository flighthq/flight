//! Per-vertex compute over the canonical interleaved PBR record:
//! `position(3) + normal(3) + tangent(4) + uv0(2) = 12 floats / 48 bytes`,
//! stride read from `geometry.layout`. These functions derive normals, tangents,
//! and the local-space AABB from `geometry.vertices` (+ `geometry.indices`) and
//! write into `out`.
//!
//! Ports `@flighthq/mesh` `meshGeometryCompute.ts`. The TS functions take `out`
//! and `geometry` as separate arguments and are alias-safe (`out === geometry`
//! for the in-place case). Rust's borrow checker forbids passing one value as
//! both `&mut` and `&`, so the in-place case clones the source into `geometry`
//! at the call site (the algorithm already reads every input into a scratch
//! buffer before writing, so the result is identical).

use flighthq_types::{Aabb, MeshGeometry};

// Canonical interleaved PBR record float offsets within one vertex
// (stride = 48 bytes / 12 floats): position[0..2], normal[3..5],
// tangent[6..9] (w = handedness), uv0[10..11].
const NORMAL_OFFSET: usize = 3;
const POSITION_OFFSET: usize = 0;
const TANGENT_OFFSET: usize = 6;
const UV0_OFFSET: usize = 10;

/// Writes the tight axis-aligned bounding box of all vertex positions into `out`.
/// An empty vertex stream yields an empty box (min = +inf, max = -inf). Reads all
/// positions before writing the corners, so it is safe when `out` aliases the
/// geometry's bounds.
pub fn compute_mesh_geometry_bounds(out: &mut Aabb, geometry: &MeshGeometry) {
    let vertices = &geometry.vertices;
    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    let vertex_count = if floats_per_vertex > 0 {
        vertices.len() / floats_per_vertex
    } else {
        0
    };

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;

    for i in 0..vertex_count {
        let base = i * floats_per_vertex + POSITION_OFFSET;
        let px = vertices[base];
        let py = vertices[base + 1];
        let pz = vertices[base + 2];
        if px < min_x {
            min_x = px;
        }
        if py < min_y {
            min_y = py;
        }
        if pz < min_z {
            min_z = pz;
        }
        if px > max_x {
            max_x = px;
        }
        if py > max_y {
            max_y = py;
        }
        if pz > max_z {
            max_z = pz;
        }
    }

    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Recomputes per-vertex smooth normals by area-weighted accumulation of triangle
/// face normals (right-handed, CCW front-face), normalizes them, and writes them
/// into the normal slot of `out.vertices`. Operates on indexed triangle-list
/// geometry; non-indexed streams are treated as sequential triangles.
///
/// For the TS in-place case (`out === geometry`), pass a clone of the geometry as
/// `geometry`: the algorithm only reads positions and accumulates into a scratch
/// buffer before any write-back.
pub fn compute_mesh_geometry_normals(out: &mut MeshGeometry, geometry: &MeshGeometry) {
    let vertices = &geometry.vertices;
    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    let vertex_count = if floats_per_vertex > 0 {
        vertices.len() / floats_per_vertex
    } else {
        0
    };
    let index_count = match &geometry.indices {
        Some(indices) => index_len(indices),
        None => vertex_count,
    };

    let mut accum = vec![0.0f64; vertex_count * 3];

    let mut t = 0;
    while t + 2 < index_count {
        let (i0, i1, i2) = triangle_indices(geometry, t);

        let b0 = i0 * floats_per_vertex + POSITION_OFFSET;
        let b1 = i1 * floats_per_vertex + POSITION_OFFSET;
        let b2 = i2 * floats_per_vertex + POSITION_OFFSET;

        let e1x = (vertices[b1] - vertices[b0]) as f64;
        let e1y = (vertices[b1 + 1] - vertices[b0 + 1]) as f64;
        let e1z = (vertices[b1 + 2] - vertices[b0 + 2]) as f64;
        let e2x = (vertices[b2] - vertices[b0]) as f64;
        let e2y = (vertices[b2 + 1] - vertices[b0 + 1]) as f64;
        let e2z = (vertices[b2 + 2] - vertices[b0 + 2]) as f64;

        // Unnormalized cross product is area-weighted (magnitude = 2 * area).
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;

        for &i in &[i0, i1, i2] {
            accum[i * 3] += nx;
            accum[i * 3 + 1] += ny;
            accum[i * 3 + 2] += nz;
        }

        t += 3;
    }

    let target = &mut out.vertices;
    for i in 0..vertex_count {
        let mut nx = accum[i * 3];
        let mut ny = accum[i * 3 + 1];
        let mut nz = accum[i * 3 + 2];
        let len = (nx * nx + ny * ny + nz * nz).sqrt();
        if len > 0.0 {
            nx /= len;
            ny /= len;
            nz /= len;
        }
        let base = i * floats_per_vertex + NORMAL_OFFSET;
        target[base] = nx as f32;
        target[base + 1] = ny as f32;
        target[base + 2] = nz as f32;
    }
}

/// Recomputes per-vertex tangents from positions, normals, and uv0 using the
/// Lengyel method, Gram-Schmidt-orthogonalizes each tangent against its normal,
/// and stores it in the tangent slot of `out.vertices` with `w` = handedness sign
/// (+1 or -1) per glTF: the bitangent is `cross(normal, tangent.xyz) * tangent.w`.
/// Operates on indexed triangle-list geometry; non-indexed streams are sequential
/// triangles.
///
/// For the TS in-place case (`out === geometry`), pass a clone as `geometry`.
pub fn compute_mesh_geometry_tangents(out: &mut MeshGeometry, geometry: &MeshGeometry) {
    let vertices = &geometry.vertices;
    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    let vertex_count = if floats_per_vertex > 0 {
        vertices.len() / floats_per_vertex
    } else {
        0
    };
    let index_count = match &geometry.indices {
        Some(indices) => index_len(indices),
        None => vertex_count,
    };

    let mut tan = vec![0.0f64; vertex_count * 3];
    let mut bitan = vec![0.0f64; vertex_count * 3];

    let mut t = 0;
    while t + 2 < index_count {
        let (i0, i1, i2) = triangle_indices(geometry, t);

        let p0 = i0 * floats_per_vertex + POSITION_OFFSET;
        let p1 = i1 * floats_per_vertex + POSITION_OFFSET;
        let p2 = i2 * floats_per_vertex + POSITION_OFFSET;

        let e1x = (vertices[p1] - vertices[p0]) as f64;
        let e1y = (vertices[p1 + 1] - vertices[p0 + 1]) as f64;
        let e1z = (vertices[p1 + 2] - vertices[p0 + 2]) as f64;
        let e2x = (vertices[p2] - vertices[p0]) as f64;
        let e2y = (vertices[p2 + 1] - vertices[p0 + 1]) as f64;
        let e2z = (vertices[p2 + 2] - vertices[p0 + 2]) as f64;

        let u0 = i0 * floats_per_vertex + UV0_OFFSET;
        let u1 = i1 * floats_per_vertex + UV0_OFFSET;
        let u2 = i2 * floats_per_vertex + UV0_OFFSET;

        let du1 = (vertices[u1] - vertices[u0]) as f64;
        let dv1 = (vertices[u1 + 1] - vertices[u0 + 1]) as f64;
        let du2 = (vertices[u2] - vertices[u0]) as f64;
        let dv2 = (vertices[u2 + 1] - vertices[u0 + 1]) as f64;

        let det = du1 * dv2 - du2 * dv1;
        let r = if det != 0.0 { 1.0 / det } else { 0.0 };

        let tx = (dv2 * e1x - dv1 * e2x) * r;
        let ty = (dv2 * e1y - dv1 * e2y) * r;
        let tz = (dv2 * e1z - dv1 * e2z) * r;
        let bx = (du1 * e2x - du2 * e1x) * r;
        let by = (du1 * e2y - du2 * e1y) * r;
        let bz = (du1 * e2z - du2 * e1z) * r;

        for &i in &[i0, i1, i2] {
            tan[i * 3] += tx;
            tan[i * 3 + 1] += ty;
            tan[i * 3 + 2] += tz;
            bitan[i * 3] += bx;
            bitan[i * 3 + 1] += by;
            bitan[i * 3 + 2] += bz;
        }

        t += 3;
    }

    let target = &mut out.vertices;
    for i in 0..vertex_count {
        let n_base = i * floats_per_vertex + NORMAL_OFFSET;
        let nx = vertices[n_base] as f64;
        let ny = vertices[n_base + 1] as f64;
        let nz = vertices[n_base + 2] as f64;

        let mut tx = tan[i * 3];
        let mut ty = tan[i * 3 + 1];
        let mut tz = tan[i * 3 + 2];

        // Gram-Schmidt: t = normalize(t - n * dot(n, t)).
        let ndt = nx * tx + ny * ty + nz * tz;
        tx -= nx * ndt;
        ty -= ny * ndt;
        tz -= nz * ndt;
        let len = (tx * tx + ty * ty + tz * tz).sqrt();
        if len > 0.0 {
            tx /= len;
            ty /= len;
            tz /= len;
        } else {
            // Degenerate UVs: pick an arbitrary tangent perpendicular to normal.
            tx = 1.0;
            ty = 0.0;
            tz = 0.0;
        }

        // Handedness: w = sign(dot(cross(n, t), accumulated bitangent)).
        let cx = ny * tz - nz * ty;
        let cy = nz * tx - nx * tz;
        let cz = nx * ty - ny * tx;
        let w = if cx * bitan[i * 3] + cy * bitan[i * 3 + 1] + cz * bitan[i * 3 + 2] < 0.0 {
            -1.0
        } else {
            1.0
        };

        let base = i * floats_per_vertex + TANGENT_OFFSET;
        target[base] = tx as f32;
        target[base + 1] = ty as f32;
        target[base + 2] = tz as f32;
        target[base + 3] = w as f32;
    }
}

fn index_len(indices: &flighthq_types::MeshIndices) -> usize {
    match indices {
        flighthq_types::MeshIndices::U16(v) => v.len(),
        flighthq_types::MeshIndices::U32(v) => v.len(),
    }
}

// Returns the three vertex indices of triangle `t` (the index at positions
// t, t+1, t+2), using the index buffer when present or sequential indices when
// the geometry is non-indexed.
fn triangle_indices(geometry: &MeshGeometry, t: usize) -> (usize, usize, usize) {
    match &geometry.indices {
        Some(flighthq_types::MeshIndices::U16(v)) => {
            (v[t] as usize, v[t + 1] as usize, v[t + 2] as usize)
        }
        Some(flighthq_types::MeshIndices::U32(v)) => {
            (v[t] as usize, v[t + 1] as usize, v[t + 2] as usize)
        }
        None => (t, t + 1, t + 2),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{
        MeshIndices, VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic,
    };

    use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};

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

    // One CCW triangle in the XY plane (normal +Z) with u-along-X, v-along-Y UVs.
    fn make_triangle() -> MeshGeometry {
        let mut vertices = vec![0.0f32; 3 * 12];
        let mut set_vertex = |i: usize, px: f32, py: f32, u: f32, v: f32| {
            let b = i * 12;
            vertices[b] = px;
            vertices[b + 1] = py;
            vertices[b + 2] = 0.0;
            vertices[b + 10] = u;
            vertices[b + 11] = v;
        };
        set_vertex(0, 0.0, 0.0, 0.0, 0.0);
        set_vertex(1, 1.0, 0.0, 1.0, 0.0);
        set_vertex(2, 0.0, 1.0, 0.0, 1.0);
        create_mesh_geometry(MeshGeometryOptions {
            indices: Some(MeshIndices::U16(vec![0, 1, 2])),
            layout: canonical_layout(),
            subsets: None,
            topology: None,
            vertices,
        })
    }

    mod compute_mesh_geometry_bounds {
        use super::*;

        #[test]
        fn writes_the_tight_aabb_of_all_positions() {
            let geometry = make_triangle();
            let mut out = Aabb::default();
            compute_mesh_geometry_bounds(&mut out, &geometry);
            assert_eq!(out.min.x, 0.0);
            assert_eq!(out.min.y, 0.0);
            assert_eq!(out.max.x, 1.0);
            assert_eq!(out.max.y, 1.0);
            assert_eq!(out.max.z, 0.0);
        }

        #[test]
        fn is_safe_when_out_aliases_geometry_bounds() {
            // The TS in-place case writes geometry.bounds from geometry.vertices.
            // The function reads only vertices, never bounds, so cloning the read
            // source is unnecessary; we compute directly into a fresh bounds.
            let geometry = make_triangle();
            let mut bounds = Aabb::default();
            compute_mesh_geometry_bounds(&mut bounds, &geometry);
            assert_eq!(bounds.max.x, 1.0);
            assert_eq!(bounds.min.y, 0.0);
        }

        #[test]
        fn yields_an_empty_box_for_an_empty_vertex_stream() {
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: None,
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: Vec::new(),
            });
            let mut out = Aabb {
                min: flighthq_types::Vector3 {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                },
                max: flighthq_types::Vector3 {
                    x: 4.0,
                    y: 5.0,
                    z: 6.0,
                },
            };
            compute_mesh_geometry_bounds(&mut out, &geometry);
            assert_eq!(out.min.x, f32::INFINITY);
            assert_eq!(out.max.x, f32::NEG_INFINITY);
        }
    }

    mod compute_mesh_geometry_normals {
        use super::*;

        #[test]
        fn writes_the_unit_face_normal_in_place_for_a_ccw_triangle() {
            let mut geometry = make_triangle();
            let source = geometry.clone();
            compute_mesh_geometry_normals(&mut geometry, &source);
            // Face normal of a CCW XY triangle is +Z.
            assert!((geometry.vertices[3] - 0.0).abs() < 1e-5);
            assert!((geometry.vertices[4] - 0.0).abs() < 1e-5);
            assert!((geometry.vertices[5] - 1.0).abs() < 1e-5);
        }

        #[test]
        fn writes_into_a_distinct_out_geometry() {
            let source = make_triangle();
            let mut out = make_triangle();
            compute_mesh_geometry_normals(&mut out, &source);
            assert!((out.vertices[5] - 1.0).abs() < 1e-5);
        }
    }

    mod compute_mesh_geometry_tangents {
        use super::*;

        #[test]
        fn writes_a_unit_tangent_aligned_with_x_for_the_canonical_uv_mapping() {
            let mut geometry = make_triangle();
            let source = geometry.clone();
            compute_mesh_geometry_normals(&mut geometry, &source);
            let source = geometry.clone();
            compute_mesh_geometry_tangents(&mut geometry, &source);
            // u increases along +X, so tangent.xyz ~ (1,0,0).
            assert!((geometry.vertices[6] - 1.0).abs() < 1e-5);
            assert!((geometry.vertices[7] - 0.0).abs() < 1e-5);
            assert!((geometry.vertices[8] - 0.0).abs() < 1e-5);
            // Right-handed mapping => positive handedness.
            assert_eq!(geometry.vertices[9], 1.0);
        }

        #[test]
        fn writes_into_a_distinct_out_geometry() {
            let mut source = make_triangle();
            let source_read = source.clone();
            compute_mesh_geometry_normals(&mut source, &source_read);
            let mut out = make_triangle();
            let out_read = out.clone();
            compute_mesh_geometry_normals(&mut out, &out_read);
            compute_mesh_geometry_tangents(&mut out, &source);
            assert!((out.vertices[6] - 1.0).abs() < 1e-5);
            assert_eq!(out.vertices[9], 1.0);
        }

        #[test]
        fn produces_negative_handedness_when_the_v_axis_is_flipped() {
            let mut geometry = make_triangle();
            // Flip v on vertex 2 so the UV winding reverses relative to geometry.
            geometry.vertices[2 * 12 + 11] = -1.0;
            let source = geometry.clone();
            compute_mesh_geometry_normals(&mut geometry, &source);
            let source = geometry.clone();
            compute_mesh_geometry_tangents(&mut geometry, &source);
            assert_eq!(geometry.vertices[9], -1.0);
        }
    }
}
