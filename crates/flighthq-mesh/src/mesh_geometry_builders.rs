//! Primitive builders for the canonical interleaved PBR vertex record:
//!   `position(3) + normal(3) + tangent(4, w = handedness) + uv0(2) = 12 f32 / 48 bytes`.
//!
//! Ports `@flighthq/mesh` `meshGeometryBuilders.ts`. Coordinate and winding
//! convention is pinned across the 3D suite: right-handed coordinates,
//! counter-clockwise (CCW) front faces, and the tangent `w` component is the
//! bitangent sign per glTF — `bitangent = cross(normal, tangent.xyz) * tangent.w`.
//! Every builder writes outward-facing normals, generates UVs, computes
//! per-vertex tangents, and fills the cached local-space bounds.

use std::f32::consts::PI;

use flighthq_types::{
    Aabb, MeshGeometry, MeshIndices, VertexAttribute, VertexAttributeLayout, VertexFormat,
    VertexSemantic,
};

use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};
use crate::mesh_geometry_compute::{compute_mesh_geometry_bounds, compute_mesh_geometry_tangents};

const CANONICAL_FLOATS_PER_VERTEX: usize = 12;

/// Builds an axis-aligned box of the given dimensions centered at the origin, one
/// quad per face with per-face outward normals and per-face 0..1 UVs (so each
/// face textures independently).
pub fn create_box_mesh_geometry(width: f32, height: f32, depth: f32) -> MeshGeometry {
    let hx = width * 0.5;
    let hy = height * 0.5;
    let hz = depth * 0.5;

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    // Each face: origin corner, then two edge vectors (u across, v up).
    #[allow(clippy::too_many_arguments)]
    let add_face = |positions: &mut Vec<f32>,
                    normals: &mut Vec<f32>,
                    uvs: &mut Vec<f32>,
                    indices: &mut Vec<u32>,
                    ox: f32,
                    oy: f32,
                    oz: f32,
                    ux: f32,
                    uy: f32,
                    uz: f32,
                    vx: f32,
                    vy: f32,
                    vz: f32,
                    nx: f32,
                    ny: f32,
                    nz: f32| {
        let start = (positions.len() / 3) as u32;
        for iv in 0..2 {
            for iu in 0..2 {
                let fu = iu as f32;
                let fv = iv as f32;
                positions.push(ox + ux * fu + vx * fv);
                positions.push(oy + uy * fu + vy * fv);
                positions.push(oz + uz * fu + vz * fv);
                normals.push(nx);
                normals.push(ny);
                normals.push(nz);
                uvs.push(fu);
                uvs.push(fv);
            }
        }
        indices.push(start);
        indices.push(start + 1);
        indices.push(start + 3);
        indices.push(start);
        indices.push(start + 3);
        indices.push(start + 2);
    };

    // +X, -X, +Y, -Y, +Z, -Z (each winds CCW viewed from outside).
    add_face(
        &mut positions,
        &mut normals,
        &mut uvs,
        &mut indices,
        hx,
        -hy,
        hz,
        0.0,
        0.0,
        -depth,
        0.0,
        height,
        0.0,
        1.0,
        0.0,
        0.0,
    );
    add_face(
        &mut positions,
        &mut normals,
        &mut uvs,
        &mut indices,
        -hx,
        -hy,
        -hz,
        0.0,
        0.0,
        depth,
        0.0,
        height,
        0.0,
        -1.0,
        0.0,
        0.0,
    );
    add_face(
        &mut positions,
        &mut normals,
        &mut uvs,
        &mut indices,
        -hx,
        hy,
        hz,
        width,
        0.0,
        0.0,
        0.0,
        0.0,
        -depth,
        0.0,
        1.0,
        0.0,
    );
    add_face(
        &mut positions,
        &mut normals,
        &mut uvs,
        &mut indices,
        -hx,
        -hy,
        -hz,
        width,
        0.0,
        0.0,
        0.0,
        0.0,
        depth,
        0.0,
        -1.0,
        0.0,
    );
    add_face(
        &mut positions,
        &mut normals,
        &mut uvs,
        &mut indices,
        -hx,
        -hy,
        hz,
        width,
        0.0,
        0.0,
        0.0,
        height,
        0.0,
        0.0,
        0.0,
        1.0,
    );
    add_face(
        &mut positions,
        &mut normals,
        &mut uvs,
        &mut indices,
        hx,
        -hy,
        -hz,
        -width,
        0.0,
        0.0,
        0.0,
        height,
        0.0,
        0.0,
        0.0,
        -1.0,
    );

    build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices)
}

/// Builds a right circular cone of `radius` and `height` centered at the origin,
/// apex at +Y, base at -Y, with `radial_segments` around the axis. A capped base
/// disc is included when `capped` is true.
pub fn create_cone_mesh_geometry(
    radius: f32,
    height: f32,
    radial_segments: u32,
    capped: bool,
) -> MeshGeometry {
    create_cylinder_mesh_geometry(0.0, radius, height, radial_segments, capped)
}

/// Builds a right circular cylinder spanning -height/2..+height/2 on the Y axis,
/// with independent top and bottom radii (a zero top radius yields a cone).
/// `radial_segments` rings around the axis; `capped` adds top and bottom discs
/// (skipping a zero-radius cap).
pub fn create_cylinder_mesh_geometry(
    top_radius: f32,
    bottom_radius: f32,
    height: f32,
    radial_segments: u32,
    capped: bool,
) -> MeshGeometry {
    let segments = radial_segments.max(3);
    let half_height = height * 0.5;
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    // Side wall: slope of the silhouette feeds the radial normal tilt.
    let slope = (bottom_radius - top_radius) / height;
    let side_start = (positions.len() / 3) as u32;
    for y in 0..=1u32 {
        let radius = if y == 0 { bottom_radius } else { top_radius };
        let py = if y == 0 { -half_height } else { half_height };
        for s in 0..=segments {
            let theta = (s as f32 / segments as f32) * PI * 2.0;
            let cos = theta.cos();
            let sin = theta.sin();
            positions.push(radius * cos);
            positions.push(py);
            positions.push(radius * sin);
            let mut nx = cos;
            let mut ny = slope;
            let mut nz = sin;
            let len = {
                let l = (nx * nx + ny * ny + nz * nz).sqrt();
                if l == 0.0 { 1.0 } else { l }
            };
            nx /= len;
            ny /= len;
            nz /= len;
            normals.push(nx);
            normals.push(ny);
            normals.push(nz);
            uvs.push(s as f32 / segments as f32);
            uvs.push(y as f32);
        }
    }
    for s in 0..segments {
        let a = side_start + s;
        let b = side_start + s + 1;
        let c = side_start + (segments + 1) + s;
        let d = side_start + (segments + 1) + s + 1;
        indices.push(a);
        indices.push(c);
        indices.push(b);
        indices.push(b);
        indices.push(c);
        indices.push(d);
    }

    if capped {
        if bottom_radius > 0.0 {
            add_disc(
                &mut positions,
                &mut normals,
                &mut uvs,
                &mut indices,
                segments,
                bottom_radius,
                -half_height,
                -1.0,
            );
        }
        if top_radius > 0.0 {
            add_disc(
                &mut positions,
                &mut normals,
                &mut uvs,
                &mut indices,
                segments,
                top_radius,
                half_height,
                1.0,
            );
        }
    }

    build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices)
}

/// Builds a flat plane in the XZ plane (Y up, normal +Y) centered at the origin,
/// subdivided into `width_segments` x `depth_segments` quads with a 0..1 UV grid.
pub fn create_plane_mesh_geometry(
    width: f32,
    depth: f32,
    width_segments: u32,
    depth_segments: u32,
) -> MeshGeometry {
    let w_seg = width_segments.max(1);
    let d_seg = depth_segments.max(1);
    let hw = width * 0.5;
    let hd = depth * 0.5;

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for iz in 0..=d_seg {
        let v = iz as f32 / d_seg as f32;
        let z = -hd + v * depth;
        for ix in 0..=w_seg {
            let u = ix as f32 / w_seg as f32;
            let x = -hw + u * width;
            positions.push(x);
            positions.push(0.0);
            positions.push(z);
            normals.push(0.0);
            normals.push(1.0);
            normals.push(0.0);
            uvs.push(u);
            uvs.push(v);
        }
    }

    let row_stride = w_seg + 1;
    for iz in 0..d_seg {
        for ix in 0..w_seg {
            let a = iz * row_stride + ix;
            let b = a + 1;
            let c = a + row_stride;
            let d = c + 1;
            // CCW when viewed from +Y (above).
            indices.push(a);
            indices.push(c);
            indices.push(b);
            indices.push(b);
            indices.push(c);
            indices.push(d);
        }
    }

    build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices)
}

/// Builds a single unit quad in the XY plane (Z up, normal +Z) centered at the
/// origin, two triangles with a 0..1 UV.
pub fn create_quad_mesh_geometry(width: f32, height: f32) -> MeshGeometry {
    let hw = width * 0.5;
    let hh = height * 0.5;
    let positions = vec![-hw, -hh, 0.0, hw, -hh, 0.0, -hw, hh, 0.0, hw, hh, 0.0];
    let normals = vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0];
    let uvs = vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
    let indices = vec![0, 1, 2, 2, 1, 3];
    build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices)
}

/// Builds a UV sphere of `radius` centered at the origin, with `width_segments`
/// longitudinal and `height_segments` latitudinal divisions. Normals are the unit
/// position direction; UVs map longitude to u and latitude to v.
pub fn create_sphere_mesh_geometry(
    radius: f32,
    width_segments: u32,
    height_segments: u32,
) -> MeshGeometry {
    let w_seg = width_segments.max(3);
    let h_seg = height_segments.max(2);

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for iy in 0..=h_seg {
        let v = iy as f32 / h_seg as f32;
        let phi = v * PI;
        let sin_phi = phi.sin();
        let cos_phi = phi.cos();
        for ix in 0..=w_seg {
            let u = ix as f32 / w_seg as f32;
            let theta = u * PI * 2.0;
            let sin_theta = theta.sin();
            let cos_theta = theta.cos();
            let nx = -sin_phi * cos_theta;
            let ny = cos_phi;
            let nz = sin_phi * sin_theta;
            positions.push(radius * nx);
            positions.push(radius * ny);
            positions.push(radius * nz);
            normals.push(nx);
            normals.push(ny);
            normals.push(nz);
            uvs.push(u);
            uvs.push(v);
        }
    }

    let row_stride = w_seg + 1;
    for iy in 0..h_seg {
        for ix in 0..w_seg {
            let a = iy * row_stride + ix;
            let b = a + 1;
            let c = a + row_stride;
            let d = c + 1;
            indices.push(a);
            indices.push(c);
            indices.push(b);
            indices.push(b);
            indices.push(c);
            indices.push(d);
        }
    }

    build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices)
}

/// Builds a torus in the XY plane: a ring of `radius` (center to tube center)
/// with a tube of `tube` radius, divided into `radial_segments` around the ring
/// and `tubular_segments` around the tube. Normals point radially outward from
/// the tube center.
pub fn create_torus_mesh_geometry(
    radius: f32,
    tube: f32,
    radial_segments: u32,
    tubular_segments: u32,
) -> MeshGeometry {
    let r_seg = radial_segments.max(3);
    let t_seg = tubular_segments.max(3);

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for j in 0..=r_seg {
        let v = (j as f32 / r_seg as f32) * PI * 2.0;
        let cos_v = v.cos();
        let sin_v = v.sin();
        for i in 0..=t_seg {
            let u = (i as f32 / t_seg as f32) * PI * 2.0;
            let cos_u = u.cos();
            let sin_u = u.sin();
            let cx = radius * cos_u;
            let cy = radius * sin_u;
            let px = (radius + tube * cos_v) * cos_u;
            let py = (radius + tube * cos_v) * sin_u;
            let pz = tube * sin_v;
            positions.push(px);
            positions.push(py);
            positions.push(pz);
            let mut nx = px - cx;
            let mut ny = py - cy;
            let mut nz = pz;
            let len = {
                let l = (nx * nx + ny * ny + nz * nz).sqrt();
                if l == 0.0 { 1.0 } else { l }
            };
            nx /= len;
            ny /= len;
            nz /= len;
            normals.push(nx);
            normals.push(ny);
            normals.push(nz);
            uvs.push(i as f32 / t_seg as f32);
            uvs.push(j as f32 / r_seg as f32);
        }
    }

    let row_stride = t_seg + 1;
    for j in 0..r_seg {
        for i in 0..t_seg {
            let a = j * row_stride + i;
            let b = a + 1;
            let c = a + row_stride;
            let d = c + 1;
            indices.push(a);
            indices.push(c);
            indices.push(b);
            indices.push(b);
            indices.push(c);
            indices.push(d);
        }
    }

    build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices)
}

/// Adds a flat circular cap disc at the given Y plane: a center vertex fanned to a
/// ring of `segments` rim vertices. `direction` is +1 for a top cap (normal +Y,
/// CCW from above) and -1 for a bottom cap (normal -Y, CCW from below).
#[allow(clippy::too_many_arguments)]
fn add_disc(
    positions: &mut Vec<f32>,
    normals: &mut Vec<f32>,
    uvs: &mut Vec<f32>,
    indices: &mut Vec<u32>,
    segments: u32,
    radius: f32,
    y: f32,
    direction: f32,
) {
    let center = (positions.len() / 3) as u32;
    positions.push(0.0);
    positions.push(y);
    positions.push(0.0);
    normals.push(0.0);
    normals.push(direction);
    normals.push(0.0);
    uvs.push(0.5);
    uvs.push(0.5);

    let ring_start = (positions.len() / 3) as u32;
    for s in 0..=segments {
        let theta = (s as f32 / segments as f32) * PI * 2.0;
        let cos = theta.cos();
        let sin = theta.sin();
        positions.push(radius * cos);
        positions.push(y);
        positions.push(radius * sin);
        normals.push(0.0);
        normals.push(direction);
        normals.push(0.0);
        uvs.push(cos * 0.5 + 0.5);
        uvs.push(sin * 0.5 + 0.5);
    }

    for s in 0..segments {
        let a = ring_start + s;
        let b = ring_start + s + 1;
        if direction > 0.0 {
            indices.push(center);
            indices.push(a);
            indices.push(b);
        } else {
            indices.push(center);
            indices.push(b);
            indices.push(a);
        }
    }
}

/// Interleaves separate position/normal/uv0 arrays into the canonical 12-float
/// record, allocates the `MeshGeometry`, then fills tangents from the UV gradient
/// and the cached local bounds. The single finalize path every builder funnels
/// through.
fn build_canonical_mesh_geometry(
    positions: &[f32],
    normals: &[f32],
    uvs: &[f32],
    indices: &[u32],
) -> MeshGeometry {
    let vertex_count = positions.len() / 3;
    let mut vertices = vec![0.0f32; vertex_count * CANONICAL_FLOATS_PER_VERTEX];

    for i in 0..vertex_count {
        let base = i * CANONICAL_FLOATS_PER_VERTEX;
        vertices[base] = positions[i * 3];
        vertices[base + 1] = positions[i * 3 + 1];
        vertices[base + 2] = positions[i * 3 + 2];
        vertices[base + 3] = normals[i * 3];
        vertices[base + 4] = normals[i * 3 + 1];
        vertices[base + 5] = normals[i * 3 + 2];
        // tangent (base+6..9) is filled by compute_mesh_geometry_tangents below.
        vertices[base + 10] = uvs[i * 2];
        vertices[base + 11] = uvs[i * 2 + 1];
    }

    let mut geometry = create_mesh_geometry(MeshGeometryOptions {
        indices: Some(MeshIndices::U32(indices.to_vec())),
        layout: canonical_vertex_layout(),
        subsets: None,
        topology: None,
        vertices,
    });

    // In-place tangent fill: clone the read source (the algorithm reads positions,
    // normals, uv0 into scratch before writing the tangent slot).
    let source = geometry.clone();
    compute_mesh_geometry_tangents(&mut geometry, &source);

    let mut bounds = Aabb::default();
    compute_mesh_geometry_bounds(&mut bounds, &geometry);
    geometry.bounds = Some(bounds);

    geometry
}

// The canonical interleaved PBR vertex layout shared by every builder: position +
// normal + tangent(w = handedness) + uv0, stride 48 bytes.
fn canonical_vertex_layout() -> VertexAttributeLayout {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh_geometry::{get_mesh_geometry_index_count, get_mesh_geometry_vertex_count};

    fn expect_unit_normals(geometry: &MeshGeometry) {
        let count = get_mesh_geometry_vertex_count(geometry) as usize;
        let stride = 12;
        for i in 0..count {
            let b = i * stride + 3;
            let len = (geometry.vertices[b].powi(2)
                + geometry.vertices[b + 1].powi(2)
                + geometry.vertices[b + 2].powi(2))
            .sqrt();
            assert!((len - 1.0).abs() < 1e-4, "normal {i} len {len}");
        }
    }

    fn expect_unit_tangents(geometry: &MeshGeometry) {
        let count = get_mesh_geometry_vertex_count(geometry) as usize;
        let stride = 12;
        for i in 0..count {
            let b = i * stride + 6;
            let len = (geometry.vertices[b].powi(2)
                + geometry.vertices[b + 1].powi(2)
                + geometry.vertices[b + 2].powi(2))
            .sqrt();
            assert!((len - 1.0).abs() < 1e-4, "tangent {i} len {len}");
            assert_eq!(geometry.vertices[b + 3].abs(), 1.0);
        }
    }

    mod create_box_mesh_geometry {
        use super::*;

        #[test]
        fn builds_24_vertices_36_indices_and_bounds_at_half_extents() {
            let geometry = create_box_mesh_geometry(2.0, 4.0, 6.0);
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), 24);
            assert_eq!(get_mesh_geometry_index_count(&geometry), 36);
            let bounds = geometry.bounds.unwrap();
            assert!((bounds.min.x - -1.0).abs() < 1e-4);
            assert!((bounds.max.y - 2.0).abs() < 1e-4);
            assert!((bounds.max.z - 3.0).abs() < 1e-4);
            expect_unit_normals(&geometry);
            expect_unit_tangents(&geometry);
        }
    }

    mod create_cone_mesh_geometry {
        use super::*;

        #[test]
        fn builds_a_capped_cone_with_apex_at_y() {
            let geometry = create_cone_mesh_geometry(0.5, 2.0, 16, true);
            assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
            let bounds = geometry.bounds.unwrap();
            assert!((bounds.max.y - 1.0).abs() < 1e-4);
            assert!((bounds.min.y - -1.0).abs() < 1e-4);
            expect_unit_normals(&geometry);
        }
    }

    mod create_cylinder_mesh_geometry {
        use super::*;

        #[test]
        fn builds_a_capped_cylinder_bounded_by_radius_and_height() {
            let geometry = create_cylinder_mesh_geometry(0.5, 0.5, 2.0, 16, true);
            let bounds = geometry.bounds.unwrap();
            assert!((bounds.max.y - 1.0).abs() < 1e-4);
            assert!((bounds.max.x - 0.5).abs() < 1e-2);
            expect_unit_normals(&geometry);
            expect_unit_tangents(&geometry);
        }
    }

    mod create_plane_mesh_geometry {
        use super::*;

        #[test]
        fn builds_a_subdivided_plane_in_the_xz_plane_with_y_normals() {
            let geometry = create_plane_mesh_geometry(2.0, 2.0, 2, 2);
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), 9);
            assert_eq!(get_mesh_geometry_index_count(&geometry), 24);
            assert!((geometry.vertices[4] - 1.0).abs() < 1e-4);
            let bounds = geometry.bounds.unwrap();
            assert!((bounds.min.x - -1.0).abs() < 1e-4);
            assert!((bounds.max.z - 1.0).abs() < 1e-4);
        }
    }

    mod create_quad_mesh_geometry {
        use super::*;

        #[test]
        fn builds_a_unit_quad_in_the_xy_plane_with_z_normals() {
            let geometry = create_quad_mesh_geometry(1.0, 1.0);
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), 4);
            assert_eq!(get_mesh_geometry_index_count(&geometry), 6);
            assert!((geometry.vertices[5] - 1.0).abs() < 1e-4);
            expect_unit_tangents(&geometry);
        }
    }

    mod create_sphere_mesh_geometry {
        use super::*;

        #[test]
        fn builds_a_sphere_whose_vertices_lie_on_the_radius() {
            let geometry = create_sphere_mesh_geometry(1.0, 16, 8);
            let count = get_mesh_geometry_vertex_count(&geometry) as usize;
            for i in 0..count {
                let b = i * 12;
                let r = (geometry.vertices[b].powi(2)
                    + geometry.vertices[b + 1].powi(2)
                    + geometry.vertices[b + 2].powi(2))
                .sqrt();
                assert!((r - 1.0).abs() < 1e-4, "radius {i} {r}");
            }
            expect_unit_normals(&geometry);
        }
    }

    mod create_torus_mesh_geometry {
        use super::*;

        #[test]
        fn builds_a_torus_bounded_by_radius_plus_tube() {
            let geometry = create_torus_mesh_geometry(0.5, 0.2, 12, 24);
            let bounds = geometry.bounds.unwrap();
            assert!((bounds.max.x - 0.7).abs() < 1e-2);
            assert!((bounds.max.z - 0.2).abs() < 1e-2);
            expect_unit_normals(&geometry);
        }
    }
}
