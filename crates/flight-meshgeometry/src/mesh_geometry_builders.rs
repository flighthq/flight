use crate::IndexBufferU32;
use crate::IndexBuffer;
use crate::MeshGeometry;
use crate::MeshGeometryOptions;
use crate::VertexAttribute;
use crate::VertexAttributeLayout;
use crate::VertexFormat;
use crate::VertexSemantic;
use crate::compute_mesh_geometry_tangents;
use crate::create_mesh_geometry;
use crate::refresh_mesh_geometry_bounds;

const CANONICAL_FLOATS_PER_VERTEX: usize = 12;
const POLE_EPSILON: f32 = 1e-6;

/// Builds an axis-aligned box centered at the origin.
pub fn create_box_mesh_geometry(width: f32, height: f32, depth: f32) -> MeshGeometry {
    let hx = width * 0.5;
    let hy = height * 0.5;
    let hz = depth * 0.5;

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let mut add_face = |ox: f32, oy: f32, oz: f32,
                        ux: f32, uy: f32, uz: f32,
                        vx: f32, vy: f32, vz: f32,
                        nx: f32, ny: f32, nz: f32| {
        let start = positions.len() / 3;
        for iv in 0..2u32 {
            for iu in 0..2u32 {
                positions.push(ox + ux * iu as f32 + vx * iv as f32);
                positions.push(oy + uy * iu as f32 + vy * iv as f32);
                positions.push(oz + uz * iu as f32 + vz * iv as f32);
                normals.push(nx);
                normals.push(ny);
                normals.push(nz);
                uvs.push(iu as f32);
                uvs.push(iv as f32);
            }
        }
        let s = start as u32;
        indices.extend_from_slice(&[s, s + 1, s + 3, s, s + 3, s + 2]);
    };

    add_face(hx, -hy, hz, 0.0, 0.0, -depth, 0.0, height, 0.0, 1.0, 0.0, 0.0);
    add_face(-hx, -hy, -hz, 0.0, 0.0, depth, 0.0, height, 0.0, -1.0, 0.0, 0.0);
    add_face(-hx, hy, hz, width, 0.0, 0.0, 0.0, 0.0, -depth, 0.0, 1.0, 0.0);
    add_face(-hx, -hy, -hz, width, 0.0, 0.0, 0.0, 0.0, depth, 0.0, -1.0, 0.0);
    add_face(-hx, -hy, hz, width, 0.0, 0.0, 0.0, height, 0.0, 0.0, 0.0, 1.0);
    add_face(hx, -hy, -hz, -width, 0.0, 0.0, 0.0, height, 0.0, 0.0, 0.0, -1.0);

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a capsule centered at the origin.
pub fn create_capsule_mesh_geometry(
    radius: f32,
    height: f32,
    radial_segments: u32,
    cap_segments: u32,
) -> MeshGeometry {
    let r_seg = normalize_mesh_count(radial_segments, 3, u32::MAX);
    let c_seg = normalize_mesh_count(cap_segments, 1, u32::MAX);
    let half_h = height * 0.5;
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let ring_vertex_count = r_seg + 1;
    let ring_count = 2 * c_seg + 2;
    let v_divisor = ring_count - 1;

    let mut add_ring = |phi: f32, y_offset: f32| {
        let sin_phi = phi.sin();
        let cos_phi = phi.cos();
        for i in 0..=r_seg {
            let theta = (i as f32 / r_seg as f32) * std::f32::consts::PI * 2.0;
            let cos_theta = theta.cos();
            let sin_theta = theta.sin();
            let nx = sin_phi * cos_theta;
            let ny = cos_phi;
            let nz = sin_phi * sin_theta;
            positions.push(radius * nx);
            positions.push(radius * ny + y_offset);
            positions.push(radius * nz);
            normals.push(nx);
            normals.push(ny);
            normals.push(nz);
            uvs.push(i as f32 / r_seg as f32);
            uvs.push(0.0);
        }
    };

    for j in 0..=c_seg {
        add_ring((j as f32 / c_seg as f32) * (std::f32::consts::PI * 0.5), half_h);
    }
    add_ring(std::f32::consts::PI * 0.5, -half_h);
    for j in 1..=c_seg {
        add_ring(std::f32::consts::PI * 0.5 + (j as f32 / c_seg as f32) * (std::f32::consts::PI * 0.5), -half_h);
    }

    // Fix up v UVs
    for j in 0..ring_count {
        let v = j as f32 / v_divisor as f32;
        for i in 0..=r_seg {
            uvs[((j * ring_vertex_count + i) * 2 + 1) as usize] = v;
        }
    }

    for j in 0..ring_count - 1 {
        for i in 0..r_seg {
            let a = j * ring_vertex_count + i;
            let b = a + 1;
            let c = a + ring_vertex_count;
            let d = c + 1;
            indices.extend_from_slice(&[a, b, c, b, d, c]);
        }
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a flat filled circle (disc) in the XZ plane centered at the origin.
pub fn create_circle_mesh_geometry(radius: f32, segments: u32) -> MeshGeometry {
    let segs = normalize_mesh_count(segments, 3, u32::MAX);
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();
    add_disc(&mut positions, &mut normals, &mut uvs, &mut indices, segs, radius, 0.0, 1.0);
    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a right circular cone.
pub fn create_cone_mesh_geometry(
    radius: f32,
    height: f32,
    radial_segments: u32,
    capped: bool,
) -> MeshGeometry {
    return create_cylinder_mesh_geometry(0.0, radius, height, radial_segments, capped);
}

/// Builds a right circular cylinder (or truncated cone).
pub fn create_cylinder_mesh_geometry(
    top_radius: f32,
    bottom_radius: f32,
    height: f32,
    radial_segments: u32,
    capped: bool,
) -> MeshGeometry {
    let segments = normalize_mesh_count(radial_segments, 3, u32::MAX);
    let half_height = height * 0.5;
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let slope = if height != 0.0 { (bottom_radius - top_radius) / height } else { 0.0 };
    let side_start = (positions.len() / 3) as u32;

    for y in 0..=1u32 {
        let radius = if y == 0 { bottom_radius } else { top_radius };
        let py = if y == 0 { -half_height } else { half_height };
        for s in 0..=segments {
            let theta = (s as f32 / segments as f32) * std::f32::consts::PI * 2.0;
            let cos = theta.cos();
            let sin = theta.sin();
            positions.push(radius * cos);
            positions.push(py);
            positions.push(radius * sin);
            let mut nx = cos;
            let mut ny = slope;
            let mut nz = sin;
            let len = (nx * nx + ny * ny + nz * nz).sqrt().max(f32::EPSILON);
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

    let top_collapsed = top_radius == 0.0;
    let bottom_collapsed = bottom_radius == 0.0;
    for s in 0..segments {
        let a = side_start + s;
        let b = side_start + s + 1;
        let c = side_start + (segments + 1) + s;
        let d = side_start + (segments + 1) + s + 1;
        if !bottom_collapsed { indices.extend_from_slice(&[a, c, b]); }
        if !top_collapsed { indices.extend_from_slice(&[b, c, d]); }
    }

    if capped {
        if bottom_radius > 0.0 {
            add_disc(&mut positions, &mut normals, &mut uvs, &mut indices, segments, bottom_radius, -half_height, -1.0);
        }
        if top_radius > 0.0 {
            add_disc(&mut positions, &mut normals, &mut uvs, &mut indices, segments, top_radius, half_height, 1.0);
        }
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a regular dodecahedron inscribed in a sphere of `radius`.
pub fn create_dodecahedron_mesh_geometry(radius: f32, detail: u32) -> MeshGeometry {
    return create_polyhedron_mesh_geometry(&dodecahedron_verts(), &dodecahedron_faces(), radius, detail);
}

/// Builds a regular icosahedron inscribed in a sphere of `radius`.
pub fn create_icosahedron_mesh_geometry(radius: f32, detail: u32) -> MeshGeometry {
    return create_polyhedron_mesh_geometry(&icosahedron_verts(), &icosahedron_faces(), radius, detail);
}

/// Builds a geodesic icosphere of `radius` centered at the origin.
pub fn create_icosphere_mesh_geometry(radius: f32, subdivisions: u32) -> MeshGeometry {
    let subs = normalize_mesh_count(subdivisions, 0, 6);

    let phi = (1.0 + 5.0f32.sqrt()) * 0.5;
    let scale = 1.0 / (1.0 + phi * phi).sqrt();
    let base_verts_raw: Vec<[f32; 3]> = vec![
        [-1.0, phi, 0.0], [1.0, phi, 0.0], [-1.0, -phi, 0.0], [1.0, -phi, 0.0],
        [0.0, -1.0, phi], [0.0, 1.0, phi], [0.0, -1.0, -phi], [0.0, 1.0, -phi],
        [phi, 0.0, -1.0], [phi, 0.0, 1.0], [-phi, 0.0, -1.0], [-phi, 0.0, 1.0],
    ];
    let mut verts: Vec<[f32; 3]> = base_verts_raw.iter()
        .map(|v| [v[0] * scale, v[1] * scale, v[2] * scale])
        .collect();

    let mut faces: Vec<[u32; 3]> = vec![
        [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
        [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
        [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
        [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];

    let mut midpoint_cache = std::collections::HashMap::new();
    for _ in 0..subs {
        let mut new_faces: Vec<[u32; 3]> = Vec::new();
        for face in &faces {
            let ab = get_midpoint(&mut verts, &mut midpoint_cache, face[0], face[1]);
            let bc = get_midpoint(&mut verts, &mut midpoint_cache, face[1], face[2]);
            let ca = get_midpoint(&mut verts, &mut midpoint_cache, face[2], face[0]);
            new_faces.push([face[0], ab, ca]);
            new_faces.push([face[1], bc, ab]);
            new_faces.push([face[2], ca, bc]);
            new_faces.push([ab, bc, ca]);
        }
        faces = new_faces;
        midpoint_cache.clear();
    }

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut face_indices: Vec<u32> = Vec::new();

    for face in &faces {
        let a = &verts[face[0] as usize];
        let b = &verts[face[1] as usize];
        let c = &verts[face[2] as usize];
        let seam_u = face_spherical_u(a, b, c);
        let corners = [a, b, c];
        for k in 0..3 {
            let v = corners[k];
            positions.push(radius * v[0]);
            positions.push(radius * v[1]);
            positions.push(radius * v[2]);
            normals.push(v[0]);
            normals.push(v[1]);
            normals.push(v[2]);
            uvs.push(seam_u[k]);
            uvs.push(spherical_v(v[1]));
        }
    }
    for i in 0..(positions.len() / 3) {
        face_indices.push(i as u32);
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &face_indices);
}

/// Builds a regular octahedron inscribed in a sphere of `radius`.
pub fn create_octahedron_mesh_geometry(radius: f32, detail: u32) -> MeshGeometry {
    return create_polyhedron_mesh_geometry(&octahedron_verts(), &octahedron_faces(), radius, detail);
}

/// Builds a flat plane in the XZ plane centered at the origin.
pub fn create_plane_mesh_geometry(
    width: f32,
    depth: f32,
    width_segments: u32,
    depth_segments: u32,
) -> MeshGeometry {
    let w_seg = normalize_mesh_count(width_segments, 1, u32::MAX);
    let d_seg = normalize_mesh_count(depth_segments, 1, u32::MAX);
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
            positions.extend_from_slice(&[x, 0.0, z]);
            normals.extend_from_slice(&[0.0, 1.0, 0.0]);
            uvs.extend_from_slice(&[u, v]);
        }
    }

    let row_stride = w_seg + 1;
    for iz in 0..d_seg {
        for ix in 0..w_seg {
            let a = iz * row_stride + ix;
            let b = a + 1;
            let c = a + row_stride;
            let d = c + 1;
            indices.extend_from_slice(&[a, c, b, b, c, d]);
        }
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a polyhedron from vertex positions and face triplets.
pub fn create_polyhedron_mesh_geometry(
    vertex_positions: &[[f32; 3]],
    face_indices: &[[u32; 3]],
    radius: f32,
    detail: u32,
) -> MeshGeometry {
    let subs = normalize_mesh_count(detail, 0, 5);
    let mut verts: Vec<[f32; 3]> = vertex_positions.iter().map(|v| {
        let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
        [v[0] / len, v[1] / len, v[2] / len]
    }).collect();
    let mut faces: Vec<[u32; 3]> = face_indices.to_vec();

    if subs > 0 {
        let mut mid_cache = std::collections::HashMap::new();
        for _ in 0..subs {
            let mut new_faces: Vec<[u32; 3]> = Vec::new();
            for face in &faces {
                let ab = get_midpoint(&mut verts, &mut mid_cache, face[0], face[1]);
                let bc = get_midpoint(&mut verts, &mut mid_cache, face[1], face[2]);
                let ca = get_midpoint(&mut verts, &mut mid_cache, face[2], face[0]);
                new_faces.push([face[0], ab, ca]);
                new_faces.push([face[1], bc, ab]);
                new_faces.push([face[2], ca, bc]);
                new_faces.push([ab, bc, ca]);
            }
            faces = new_faces;
            mid_cache.clear();
        }
    }

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut flat_indices: Vec<u32> = Vec::new();

    for face in &faces {
        let a = &verts[face[0] as usize];
        let b = &verts[face[1] as usize];
        let c = &verts[face[2] as usize];
        let seam_u = face_spherical_u(a, b, c);
        let corners = [a, b, c];
        for k in 0..3 {
            let v = corners[k];
            positions.push(radius * v[0]);
            positions.push(radius * v[1]);
            positions.push(radius * v[2]);
            normals.push(v[0]);
            normals.push(v[1]);
            normals.push(v[2]);
            uvs.push(seam_u[k]);
            uvs.push(spherical_v(v[1]));
        }
    }
    for i in 0..(positions.len() / 3) {
        flat_indices.push(i as u32);
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &flat_indices);
}

/// Builds a single unit quad in the XY plane centered at the origin.
pub fn create_quad_mesh_geometry(width: f32, height: f32) -> MeshGeometry {
    let hw = width * 0.5;
    let hh = height * 0.5;
    let positions = vec![-hw, -hh, 0.0, hw, -hh, 0.0, -hw, hh, 0.0, hw, hh, 0.0];
    let normals = vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0];
    let uvs = vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
    let indices = vec![0, 1, 2, 2, 1, 3];
    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a flat ring (annulus) in the XZ plane centered at the origin.
pub fn create_ring_mesh_geometry(
    inner_radius: f32,
    outer_radius: f32,
    segments: u32,
) -> MeshGeometry {
    let segs = normalize_mesh_count(segments, 3, u32::MAX);
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for i in 0..=segs {
        let theta = (i as f32 / segs as f32) * std::f32::consts::PI * 2.0;
        let cos = theta.cos();
        let sin = theta.sin();
        positions.extend_from_slice(&[inner_radius * cos, 0.0, inner_radius * sin]);
        normals.extend_from_slice(&[0.0, 1.0, 0.0]);
        uvs.extend_from_slice(&[0.0, i as f32 / segs as f32]);
        positions.extend_from_slice(&[outer_radius * cos, 0.0, outer_radius * sin]);
        normals.extend_from_slice(&[0.0, 1.0, 0.0]);
        uvs.extend_from_slice(&[1.0, i as f32 / segs as f32]);
    }

    for i in 0..segs {
        let inner0 = i * 2;
        let outer0 = i * 2 + 1;
        let inner1 = (i + 1) * 2;
        let outer1 = (i + 1) * 2 + 1;
        indices.extend_from_slice(&[inner0, inner1, outer0, outer0, inner1, outer1]);
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a UV sphere.
pub fn create_sphere_mesh_geometry(
    radius: f32,
    width_segments: u32,
    height_segments: u32,
) -> MeshGeometry {
    let w_seg = normalize_mesh_count(width_segments, 3, u32::MAX);
    let h_seg = normalize_mesh_count(height_segments, 2, u32::MAX);

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for iy in 0..=h_seg {
        let v = iy as f32 / h_seg as f32;
        let phi_val = v * std::f32::consts::PI;
        let sin_phi = phi_val.sin();
        let cos_phi = phi_val.cos();
        for ix in 0..=w_seg {
            let u = ix as f32 / w_seg as f32;
            let theta = u * std::f32::consts::PI * 2.0;
            let sin_theta = theta.sin();
            let cos_theta = theta.cos();
            let nx = -sin_phi * cos_theta;
            let ny = cos_phi;
            let nz = sin_phi * sin_theta;
            positions.extend_from_slice(&[radius * nx, radius * ny, radius * nz]);
            normals.extend_from_slice(&[nx, ny, nz]);
            uvs.extend_from_slice(&[u, v]);
        }
    }

    let row_stride = w_seg + 1;
    for iy in 0..h_seg {
        for ix in 0..w_seg {
            let a = iy * row_stride + ix;
            let b = a + 1;
            let c = a + row_stride;
            let d = c + 1;
            indices.extend_from_slice(&[a, c, b, b, c, d]);
        }
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a regular tetrahedron inscribed in a sphere of `radius`.
pub fn create_tetrahedron_mesh_geometry(radius: f32, detail: u32) -> MeshGeometry {
    return create_polyhedron_mesh_geometry(&tetrahedron_verts(), &tetrahedron_faces(), radius, detail);
}

/// Builds a torus knot.
pub fn create_torus_knot_mesh_geometry(
    radius: f32,
    tube: f32,
    tubular_segments: u32,
    radial_segments: u32,
    p: f32,
    q: f32,
) -> MeshGeometry {
    let t_seg = normalize_mesh_count(tubular_segments, 3, u32::MAX);
    let r_seg = normalize_mesh_count(radial_segments, 3, u32::MAX);
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let curve_point = |t: f32| -> [f32; 3] {
        let angle = t * std::f32::consts::PI * 2.0;
        let x = (radius + tube) * (p * angle).cos() * (q * angle).cos();
        let y = (radius + tube) * (p * angle).cos() * (q * angle).sin();
        let z = (radius + tube) * (p * angle).sin();
        [x, y, z]
    };

    for i in 0..=t_seg {
        let u = i as f32 / t_seg as f32;
        let c = curve_point(u);
        let t1 = curve_point(u + 0.001);
        let t0 = curve_point(u - 0.001);
        let mut tgx = t1[0] - t0[0];
        let mut tgy = t1[1] - t0[1];
        let mut tgz = t1[2] - t0[2];
        let tg_len = (tgx * tgx + tgy * tgy + tgz * tgz).sqrt().max(f32::EPSILON);
        tgx /= tg_len; tgy /= tg_len; tgz /= tg_len;

        let mut bx = tgx + c[0];
        let mut by = tgy + c[1];
        let mut bz = tgz + c[2];
        let b_len = (bx * bx + by * by + bz * bz).sqrt().max(f32::EPSILON);
        bx /= b_len; by /= b_len; bz /= b_len;

        let mut nnx = tgy * bz - tgz * by;
        let mut nny = tgz * bx - tgx * bz;
        let mut nnz = tgx * by - tgy * bx;
        let n_len = (nnx * nnx + nny * nny + nnz * nnz).sqrt().max(f32::EPSILON);
        nnx /= n_len; nny /= n_len; nnz /= n_len;

        let bnx = tgy * nnz - tgz * nny;
        let bny = tgz * nnx - tgx * nnz;
        let bnz = tgx * nny - tgy * nnx;

        for j in 0..=r_seg {
            let v = j as f32 / r_seg as f32;
            let phi_val = v * std::f32::consts::PI * 2.0;
            let cos_phi = phi_val.cos();
            let sin_phi = phi_val.sin();
            let px = c[0] + tube * (cos_phi * nnx + sin_phi * bnx);
            let py = c[1] + tube * (cos_phi * nny + sin_phi * bny);
            let pz = c[2] + tube * (cos_phi * nnz + sin_phi * bnz);
            positions.extend_from_slice(&[px, py, pz]);
            normals.push(cos_phi * nnx + sin_phi * bnx);
            normals.push(cos_phi * nny + sin_phi * bny);
            normals.push(cos_phi * nnz + sin_phi * bnz);
            uvs.extend_from_slice(&[u, v]);
        }
    }

    let row_stride = r_seg + 1;
    for i in 0..t_seg {
        for j in 0..r_seg {
            let a = i * row_stride + j;
            let b = a + 1;
            let c = a + row_stride;
            let d = c + 1;
            indices.extend_from_slice(&[a, b, c, b, d, c]);
        }
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

/// Builds a torus in the XY plane.
pub fn create_torus_mesh_geometry(
    radius: f32,
    tube: f32,
    radial_segments: u32,
    tubular_segments: u32,
) -> MeshGeometry {
    let r_seg = normalize_mesh_count(radial_segments, 3, u32::MAX);
    let t_seg = normalize_mesh_count(tubular_segments, 3, u32::MAX);

    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for j in 0..=r_seg {
        let v = (j as f32 / r_seg as f32) * std::f32::consts::PI * 2.0;
        let cos_v = v.cos();
        let sin_v = v.sin();
        for i in 0..=t_seg {
            let u = (i as f32 / t_seg as f32) * std::f32::consts::PI * 2.0;
            let cos_u = u.cos();
            let sin_u = u.sin();
            let cx = radius * cos_u;
            let cy = radius * sin_u;
            let px = (radius + tube * cos_v) * cos_u;
            let py = (radius + tube * cos_v) * sin_u;
            let pz = tube * sin_v;
            positions.extend_from_slice(&[px, py, pz]);
            let mut nx = px - cx;
            let mut ny = py - cy;
            let nz = pz;
            let len = (nx * nx + ny * ny + nz * nz).sqrt().max(f32::EPSILON);
            nx /= len; ny /= len;
            normals.push(nx);
            normals.push(ny);
            normals.push(nz / len);
            uvs.extend_from_slice(&[i as f32 / t_seg as f32, j as f32 / r_seg as f32]);
        }
    }

    let row_stride = t_seg + 1;
    for j in 0..r_seg {
        for i in 0..t_seg {
            let a = j * row_stride + i;
            let b = a + 1;
            let c = a + row_stride;
            let d = c + 1;
            indices.extend_from_slice(&[a, b, c, b, d, c]);
        }
    }

    return build_canonical_mesh_geometry(&positions, &normals, &uvs, &indices);
}

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
    positions.extend_from_slice(&[0.0, y, 0.0]);
    normals.extend_from_slice(&[0.0, direction, 0.0]);
    uvs.extend_from_slice(&[0.5, 0.5]);

    let ring_start = (positions.len() / 3) as u32;
    for s in 0..=segments {
        let theta = (s as f32 / segments as f32) * std::f32::consts::PI * 2.0;
        let cos = theta.cos();
        let sin = theta.sin();
        positions.extend_from_slice(&[radius * cos, y, radius * sin]);
        normals.extend_from_slice(&[0.0, direction, 0.0]);
        uvs.extend_from_slice(&[cos * 0.5 + 0.5, sin * 0.5 + 0.5]);
    }

    for s in 0..segments {
        let a = ring_start + s;
        let b = ring_start + s + 1;
        if direction > 0.0 {
            indices.extend_from_slice(&[center, b, a]);
        } else {
            indices.extend_from_slice(&[center, a, b]);
        }
    }
}

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
        // tangent (base+6..9) filled by compute_mesh_geometry_tangents
        vertices[base + 10] = uvs[i * 2];
        vertices[base + 11] = uvs[i * 2 + 1];
    }

    let index_array: Vec<u32> = indices.to_vec();

    let mut geometry = create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U32(IndexBufferU32 { data: index_array })),
        layout: canonical_vertex_layout(),
        vertices,
        subsets: None,
        topology: None,
    });

    compute_mesh_geometry_tangents(&mut geometry, None);
    refresh_mesh_geometry_bounds(&mut geometry);

    return geometry;
}

fn canonical_vertex_layout() -> VertexAttributeLayout {
    return VertexAttributeLayout {
        attributes: vec![
            VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            VertexAttribute { byte_offset: 12, format: VertexFormat::Float32x3, semantic: VertexSemantic::Normal },
            VertexAttribute { byte_offset: 24, format: VertexFormat::Float32x4, semantic: VertexSemantic::Tangent },
            VertexAttribute { byte_offset: 40, format: VertexFormat::Float32x2, semantic: VertexSemantic::Uv0 },
        ],
        stride: 48,
    };
}

fn dodecahedron_faces() -> Vec<[u32; 3]> {
    return vec![
        [3,11,7],[3,7,15],[3,15,13],[7,11,19],[7,11,9],[7,9,19],
        [15,7,19],[15,19,18],[15,18,6],[13,15,6],[13,6,2],[13,2,16],
        [3,13,16],[3,16,17],[3,17,11],[11,17,1],[11,1,9],[9,1,5],
        [5,17,1],[5,17,4],[5,14,4],[9,14,5],[9,12,14],[9,0,12],
        [1,0,12],[1,12,4],[1,17,4],[6,18,8],[6,8,10],[6,10,2],
        [18,19,8],[19,8,7],[7,8,15],[2,10,16],[10,8,0],[0,8,12],
    ];
}

fn dodecahedron_verts() -> Vec<[f32; 3]> {
    let phi = (1.0 + 5.0f32.sqrt()) * 0.5;
    let d = 1.0 / phi;
    return vec![
        [-1.0,-1.0,-1.0],[-1.0,-1.0,1.0],[-1.0,1.0,-1.0],[-1.0,1.0,1.0],
        [1.0,-1.0,-1.0],[1.0,-1.0,1.0],[1.0,1.0,-1.0],[1.0,1.0,1.0],
        [0.0,-d,-phi],[0.0,-d,phi],[0.0,d,-phi],[0.0,d,phi],
        [-d,-phi,0.0],[-d,phi,0.0],[d,-phi,0.0],[d,phi,0.0],
        [-phi,0.0,-d],[-phi,0.0,d],[phi,0.0,-d],[phi,0.0,d],
    ];
}

fn face_spherical_u(a: &[f32; 3], b: &[f32; 3], c: &[f32; 3]) -> [f32; 3] {
    let _directions = [a, b, c];
    let is_pole: [bool; 3] = [
        (a[0].hypot(a[2])) <= POLE_EPSILON,
        (b[0].hypot(b[2])) <= POLE_EPSILON,
        (c[0].hypot(c[2])) <= POLE_EPSILON,
    ];
    let mut u = [
        spherical_u(a[0], a[2]),
        spherical_u(b[0], b[2]),
        spherical_u(c[0], c[2]),
    ];

    let defined: Vec<usize> = (0..3).filter(|&i| !is_pole[i]).collect();
    if !defined.is_empty() {
        let min_val = defined.iter().map(|&i| u[i]).fold(f32::INFINITY, f32::min);
        let max_val = defined.iter().map(|&i| u[i]).fold(f32::NEG_INFINITY, f32::max);
        if max_val - min_val > 0.5 {
            for &i in &defined {
                if u[i] < 0.5 { u[i] += 1.0; }
            }
        }
        let mean = defined.iter().map(|&i| u[i]).sum::<f32>() / defined.len() as f32;
        for i in 0..3 {
            if is_pole[i] { u[i] = mean; }
        }
    }
    return u;
}

fn get_midpoint(
    verts: &mut Vec<[f32; 3]>,
    cache: &mut std::collections::HashMap<u64, u32>,
    a: u32,
    b: u32,
) -> u32 {
    let key = if a < b { ((a as u64) << 32) | b as u64 } else { ((b as u64) << 32) | a as u64 };
    if let Some(&cached) = cache.get(&key) {
        return cached;
    }
    let va = verts[a as usize];
    let vb = verts[b as usize];
    let mut mx = (va[0] + vb[0]) * 0.5;
    let mut my = (va[1] + vb[1]) * 0.5;
    let mut mz = (va[2] + vb[2]) * 0.5;
    let len = (mx * mx + my * my + mz * mz).sqrt();
    mx /= len; my /= len; mz /= len;
    let idx = verts.len() as u32;
    verts.push([mx, my, mz]);
    cache.insert(key, idx);
    return idx;
}

fn icosahedron_faces() -> Vec<[u32; 3]> {
    return vec![
        [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
        [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
        [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
        [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];
}

fn icosahedron_verts() -> Vec<[f32; 3]> {
    let phi = (1.0 + 5.0f32.sqrt()) * 0.5;
    return vec![
        [-1.0,phi,0.0],[1.0,phi,0.0],[-1.0,-phi,0.0],[1.0,-phi,0.0],
        [0.0,-1.0,phi],[0.0,1.0,phi],[0.0,-1.0,-phi],[0.0,1.0,-phi],
        [phi,0.0,-1.0],[phi,0.0,1.0],[-phi,0.0,-1.0],[-phi,0.0,1.0],
    ];
}

fn normalize_mesh_count(value: u32, min: u32, max: u32) -> u32 {
    return value.max(min).min(max);
}

fn octahedron_faces() -> Vec<[u32; 3]> {
    return vec![[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,4,2],[1,3,4],[1,5,3],[1,2,5]];
}

fn octahedron_verts() -> Vec<[f32; 3]> {
    return vec![[1.0,0.0,0.0],[-1.0,0.0,0.0],[0.0,1.0,0.0],[0.0,-1.0,0.0],[0.0,0.0,1.0],[0.0,0.0,-1.0]];
}

fn spherical_u(nx: f32, nz: f32) -> f32 {
    return 0.5 + nz.atan2(nx) / (std::f32::consts::PI * 2.0);
}

fn spherical_v(ny: f32) -> f32 {
    return 0.5 - ny.clamp(-1.0, 1.0).asin() / std::f32::consts::PI;
}

fn tetrahedron_faces() -> Vec<[u32; 3]> {
    return vec![[2,1,0],[0,3,2],[1,3,0],[2,3,1]];
}

fn tetrahedron_verts() -> Vec<[f32; 3]> {
    return vec![[1.0,1.0,1.0],[-1.0,-1.0,1.0],[-1.0,1.0,-1.0],[1.0,-1.0,-1.0]];
}

