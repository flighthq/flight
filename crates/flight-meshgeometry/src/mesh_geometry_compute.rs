use std::collections::HashMap;

use flight_geometry::Aabb;
use flight_geometry::create_aabb;

use crate::IndexBuffer;
use crate::MeshGeometry;
use crate::MeshTriangleVertexIndices;
use crate::PrimitiveTopology;
use crate::Vec3Out;

use crate::get_mesh_geometry_triangle_count;
use crate::get_mesh_geometry_triangle_vertex_indices;


const POSITION_OFFSET: u32 = 0;
const NORMAL_OFFSET: u32 = 3;
const TANGENT_OFFSET: u32 = 6;
const UV0_OFFSET: u32 = 10;
const BOTH_TANGENT_ORIENTATIONS: i8 = 2;
const UINT16_MAX: u32 = 65535;
const UINT32_UNMAPPED: u32 = 0xFFFFFFFF;

/// Writes the bounding sphere center and radius into `out_center` and returns the radius.
/// Uses the AABB midpoint as center and max-distance as radius. An empty vertex stream
/// yields center=(0,0,0) and radius=-1.
pub fn compute_mesh_geometry_bounding_sphere(
    out_center: &mut Vec3Out,
    geometry: &MeshGeometry,
) -> f32 {
    let vertices = &geometry.vertices;
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = if floats_per_vertex > 0 { vertices.len() as u32 / floats_per_vertex } else { 0 };

    if vertex_count == 0 {
        out_center.x = 0.0;
        out_center.y = 0.0;
        out_center.z = 0.0;
        return -1.0;
    }

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;

    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + POSITION_OFFSET) as usize;
        let px = vertices[base];
        let py = vertices[base + 1];
        let pz = vertices[base + 2];
        if px < min_x { min_x = px; }
        if py < min_y { min_y = py; }
        if pz < min_z { min_z = pz; }
        if px > max_x { max_x = px; }
        if py > max_y { max_y = py; }
        if pz > max_z { max_z = pz; }
    }

    let cx = (min_x + max_x) * 0.5;
    let cy = (min_y + max_y) * 0.5;
    let cz = (min_z + max_z) * 0.5;

    let mut radius_sq: f32 = 0.0;
    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + POSITION_OFFSET) as usize;
        let dx = vertices[base] - cx;
        let dy = vertices[base + 1] - cy;
        let dz = vertices[base + 2] - cz;
        let d_sq = dx * dx + dy * dy + dz * dz;
        if d_sq > radius_sq { radius_sq = d_sq; }
    }

    out_center.x = cx;
    out_center.y = cy;
    out_center.z = cz;
    return radius_sq.sqrt();
}

/// Writes the tight AABB of all vertex positions into `out`.
pub fn compute_mesh_geometry_bounds(out: &mut Aabb, geometry: &MeshGeometry) {
    let vertices = &geometry.vertices;
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = if floats_per_vertex > 0 { vertices.len() as u32 / floats_per_vertex } else { 0 };

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;

    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + POSITION_OFFSET) as usize;
        let px = vertices[base];
        let py = vertices[base + 1];
        let pz = vertices[base + 2];
        if px < min_x { min_x = px; }
        if py < min_y { min_y = py; }
        if pz < min_z { min_z = pz; }
        if px > max_x { max_x = px; }
        if py > max_y { max_y = py; }
        if pz > max_z { max_z = pz; }
    }

    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Recomputes per-face (flat) normals and writes them into the normal slot of
/// `geometry.vertices`. Each triangle's face normal is assigned to all three corners.
pub fn compute_mesh_geometry_flat_normals(geometry: &mut MeshGeometry) {
    let floats_per_vertex = geometry.layout.stride / 4;
    let triangle_count = get_mesh_geometry_triangle_count(geometry);
    let mut corner = MeshTriangleVertexIndices { i0: 0, i1: 0, i2: 0 };

    // Read all positions first for alias safety
    let src_verts = geometry.vertices.clone();

    for triangle in 0..triangle_count {
        if !get_mesh_geometry_triangle_vertex_indices(&mut corner, geometry, triangle) {
            continue;
        }
        let i0 = corner.i0;
        let i1 = corner.i1;
        let i2 = corner.i2;

        let p0 = (i0 * floats_per_vertex + POSITION_OFFSET) as usize;
        let p1 = (i1 * floats_per_vertex + POSITION_OFFSET) as usize;
        let p2 = (i2 * floats_per_vertex + POSITION_OFFSET) as usize;

        let x0 = src_verts[p0]; let y0 = src_verts[p0 + 1]; let z0 = src_verts[p0 + 2];
        let x1 = src_verts[p1]; let y1 = src_verts[p1 + 1]; let z1 = src_verts[p1 + 2];
        let x2 = src_verts[p2]; let y2 = src_verts[p2 + 1]; let z2 = src_verts[p2 + 2];

        let ex1 = x1 - x0; let ey1 = y1 - y0; let ez1 = z1 - z0;
        let ex2 = x2 - x0; let ey2 = y2 - y0; let ez2 = z2 - z0;
        let mut nx = ey1 * ez2 - ez1 * ey2;
        let mut ny = ez1 * ex2 - ex1 * ez2;
        let mut nz = ex1 * ey2 - ey1 * ex2;
        let len = (nx * nx + ny * ny + nz * nz).sqrt();
        if len > 0.0 {
            nx /= len;
            ny /= len;
            nz /= len;
        }

        let n0 = (i0 * floats_per_vertex + NORMAL_OFFSET) as usize;
        let n1 = (i1 * floats_per_vertex + NORMAL_OFFSET) as usize;
        let n2 = (i2 * floats_per_vertex + NORMAL_OFFSET) as usize;
        geometry.vertices[n0] = nx; geometry.vertices[n0 + 1] = ny; geometry.vertices[n0 + 2] = nz;
        geometry.vertices[n1] = nx; geometry.vertices[n1 + 1] = ny; geometry.vertices[n1 + 2] = nz;
        geometry.vertices[n2] = nx; geometry.vertices[n2 + 1] = ny; geometry.vertices[n2 + 2] = nz;
    }
    geometry.version += 1;
}

/// Recomputes per-vertex smooth normals by area-weighted accumulation of triangle face normals.
/// When `position_groups` is provided, face normals accumulate into those groups.
pub fn compute_mesh_geometry_normals(
    geometry: &mut MeshGeometry,
    position_groups: Option<&[u32]>,
) {
    let vertices = geometry.vertices.clone();
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = if floats_per_vertex > 0 { vertices.len() as u32 / floats_per_vertex } else { 0 };
    let mut accum = vec![0.0f64; vertex_count as usize * 3];

    let triangle_count = get_mesh_geometry_triangle_count(geometry);
    let mut corner = MeshTriangleVertexIndices { i0: 0, i1: 0, i2: 0 };

    for triangle in 0..triangle_count {
        if !get_mesh_geometry_triangle_vertex_indices(&mut corner, geometry, triangle) {
            continue;
        }
        let i0 = corner.i0;
        let i1 = corner.i1;
        let i2 = corner.i2;

        let b0 = (i0 * floats_per_vertex + POSITION_OFFSET) as usize;
        let b1 = (i1 * floats_per_vertex + POSITION_OFFSET) as usize;
        let b2 = (i2 * floats_per_vertex + POSITION_OFFSET) as usize;

        let e1x = vertices[b1] - vertices[b0];
        let e1y = vertices[b1 + 1] - vertices[b0 + 1];
        let e1z = vertices[b1 + 2] - vertices[b0 + 2];
        let e2x = vertices[b2] - vertices[b0];
        let e2y = vertices[b2 + 1] - vertices[b0 + 1];
        let e2z = vertices[b2 + 2] - vertices[b0 + 2];

        let nx = (e1y * e2z - e1z * e2y) as f64;
        let ny = (e1z * e2x - e1x * e2z) as f64;
        let nz = (e1x * e2y - e1y * e2x) as f64;

        let g0 = if let Some(groups) = position_groups { groups[i0 as usize] } else { i0 };
        let g1 = if let Some(groups) = position_groups { groups[i1 as usize] } else { i1 };
        let g2 = if let Some(groups) = position_groups { groups[i2 as usize] } else { i2 };

        accumulate_normal(&mut accum, g0, nx, ny, nz);
        accumulate_normal(&mut accum, g1, nx, ny, nz);
        accumulate_normal(&mut accum, g2, nx, ny, nz);
    }

    for i in 0..vertex_count {
        let accumulated = if let Some(groups) = position_groups { groups[i as usize] } else { i };
        let acc_base = accumulated as usize * 3;
        let mut nx = accum[acc_base] as f32;
        let mut ny = accum[acc_base + 1] as f32;
        let mut nz = accum[acc_base + 2] as f32;
        let len = (nx * nx + ny * ny + nz * nz).sqrt();
        if len > 0.0 {
            nx /= len;
            ny /= len;
            nz /= len;
        }
        let base = (i * floats_per_vertex + NORMAL_OFFSET) as usize;
        geometry.vertices[base] = nx;
        geometry.vertices[base + 1] = ny;
        geometry.vertices[base + 2] = nz;
    }
    geometry.version += 1;
}

/// Returns one canonical representative index per vertex, grouping vertices whose
/// position components are bit-identical.
pub fn compute_mesh_geometry_position_groups(geometry: &MeshGeometry) -> Vec<u32> {
    let vertices = &geometry.vertices;
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = if floats_per_vertex > 0 { vertices.len() as u32 / floats_per_vertex } else { 0 };
    let mut groups = vec![0u32; vertex_count as usize];

    // Reinterpret the float buffer as u32 for bit-identical comparison
    let bits: Vec<u32> = vertices.iter().map(|&f| f.to_bits()).collect();

    let mut buckets: HashMap<u32, Vec<u32>> = HashMap::new();

    for vertex in 0..vertex_count {
        let position = (vertex * floats_per_vertex + POSITION_OFFSET) as usize;
        let hash = hash_mesh_geometry_position(bits[position], bits[position + 1], bits[position + 2]);
        let mut representative = vertex;

        if let Some(bucket) = buckets.get(&hash) {
            for &candidate in bucket {
                let candidate_position = (candidate * floats_per_vertex + POSITION_OFFSET) as usize;
                if bits[position] == bits[candidate_position]
                    && bits[position + 1] == bits[candidate_position + 1]
                    && bits[position + 2] == bits[candidate_position + 2]
                {
                    representative = candidate;
                    break;
                }
            }
        }

        groups[vertex as usize] = representative;
        if representative == vertex {
            buckets.entry(hash).or_insert_with(Vec::new).push(vertex);
        }
    }

    return groups;
}

fn accumulate_normal(accum: &mut [f64], vertex: u32, nx: f64, ny: f64, nz: f64) {
    let base = vertex as usize * 3;
    accum[base] += nx;
    accum[base + 1] += ny;
    accum[base + 2] += nz;
}

fn hash_mesh_geometry_position(x: u32, y: u32, z: u32) -> u32 {
    let mut hash: u32 = 0x811c9dc5;
    hash = (hash ^ x).wrapping_mul(0x01000193);
    hash = (hash ^ y).wrapping_mul(0x01000193);
    hash = (hash ^ z).wrapping_mul(0x01000193);
    return hash;
}

/// Recomputes tangents from positions, normals, and uv0 using the Lengyel method, then
/// Gram-Schmidt-orthogonalizes each tangent against its normal and stores it with the glTF
/// handedness sign. Handles mirrored-UV seam splitting for indexed geometry.
pub fn compute_mesh_geometry_tangents(
    geometry: &mut MeshGeometry,
    position_groups: Option<&[u32]>,
) {
    let source_vertices = geometry.vertices.clone();
    let source_floats_per_vertex = geometry.layout.stride / 4;
    let source_vertex_count = if source_floats_per_vertex > 0 {
        source_vertices.len() as u32 / source_floats_per_vertex
    } else {
        0
    };

    let triangle_count = get_mesh_geometry_triangle_count(geometry);

    // Pre-resolve all triangle corners
    let mut corner_indices = vec![0u32; triangle_count as usize * 3];
    {
        let mut corner = MeshTriangleVertexIndices { i0: 0, i1: 0, i2: 0 };
        for triangle in 0..triangle_count {
            if !get_mesh_geometry_triangle_vertex_indices(&mut corner, geometry, triangle) {
                continue;
            }
            corner_indices[triangle as usize * 3] = corner.i0;
            corner_indices[triangle as usize * 3 + 1] = corner.i1;
            corner_indices[triangle as usize * 3 + 2] = corner.i2;
        }
    }

    // Orientation census for indexed geometry
    let mut triangle_signs: Option<Vec<i8>> = None;
    let mut orientation_states: Option<Vec<i8>> = None;
    let mut split_count: u32 = 0;
    let has_indices = !matches!(geometry.indices, IndexBuffer::None);

    if has_indices || position_groups.is_some() {
        let mut t_signs = vec![0i8; triangle_count as usize];
        let mut o_states = vec![0i8; source_vertex_count as usize];

        for triangle in 0..triangle_count as usize {
            let i0 = corner_indices[triangle * 3];
            let i1 = corner_indices[triangle * 3 + 1];
            let i2 = corner_indices[triangle * 3 + 2];
            let u0 = (i0 * source_floats_per_vertex + UV0_OFFSET) as usize;
            let u1 = (i1 * source_floats_per_vertex + UV0_OFFSET) as usize;
            let u2 = (i2 * source_floats_per_vertex + UV0_OFFSET) as usize;
            let du1 = source_vertices[u1] - source_vertices[u0];
            let dv1 = source_vertices[u1 + 1] - source_vertices[u0 + 1];
            let du2 = source_vertices[u2] - source_vertices[u0];
            let dv2 = source_vertices[u2 + 1] - source_vertices[u0 + 1];
            let determinant = du1 * dv2 - du2 * dv1;
            let sign: i8 = if determinant < 0.0 { -1 } else if determinant > 0.0 { 1 } else { 0 };
            t_signs[triangle] = sign;
            if sign != 0 {
                mark_tangent_orientation(&mut o_states, i0, sign);
                mark_tangent_orientation(&mut o_states, i1, sign);
                mark_tangent_orientation(&mut o_states, i2, sign);
            }
        }

        if has_indices {
            for vertex in 0..source_vertex_count {
                if o_states[vertex as usize].abs() == BOTH_TANGENT_ORIENTATIONS {
                    split_count += 1;
                }
            }
        }

        triangle_signs = Some(t_signs);
        orientation_states = Some(o_states);
    }

    let target_floats_per_vertex = geometry.layout.stride / 4;
    let output_vertex_count = source_vertex_count + split_count;

    // Handle mirrored-UV split
    let mut remapped_indices: Option<Vec<u32>> = None;
    let can_split = geometry.topology == PrimitiveTopology::TriangleList;

    if can_split && split_count > 0 && has_indices {
        let t_signs = triangle_signs.as_ref().unwrap();
        let o_states = orientation_states.as_ref().unwrap();

        let mut split_vertices = vec![UINT32_UNMAPPED; source_vertex_count as usize];
        let mut expanded = vec![0.0f32; output_vertex_count as usize * target_floats_per_vertex as usize];
        let copy_len = source_vertex_count as usize * target_floats_per_vertex as usize;
        expanded[..copy_len].copy_from_slice(&geometry.vertices[..copy_len]);

        let mut next_vertex = source_vertex_count;
        for vertex in 0..source_vertex_count {
            if o_states[vertex as usize].abs() != BOTH_TANGENT_ORIENTATIONS {
                continue;
            }
            split_vertices[vertex as usize] = next_vertex;
            let source = (vertex * target_floats_per_vertex) as usize;
            let dest = (next_vertex * target_floats_per_vertex) as usize;
            let fpv = target_floats_per_vertex as usize;
            expanded[dest..dest + fpv].copy_from_slice(&geometry.vertices[source..source + fpv]);
            next_vertex += 1;
        }

        geometry.vertices = expanded;

        let element_count = match &geometry.indices {
            IndexBuffer::U16(v) => v.len(),
            IndexBuffer::U32(v) => v.len(),
            IndexBuffer::None => 0,
        };

        let mut remapped = vec![0u32; element_count];
        for element in 0..element_count {
            let source_vertex = match &geometry.indices {
                IndexBuffer::U16(v) => v[element] as u32,
                IndexBuffer::U32(v) => v[element],
                IndexBuffer::None => element as u32,
            };
            let sign = t_signs[element / 3];
            let primary_sign: i8 = if o_states[source_vertex as usize] < 0 { -1 } else { 1 };
            if sign != 0 && sign != primary_sign {
                remapped[element] = split_vertices[source_vertex as usize];
            } else {
                remapped[element] = source_vertex;
            }
        }

        // Update geometry indices
        let needs_uint32 = output_vertex_count > UINT16_MAX;
        if needs_uint32 {
            geometry.indices = IndexBuffer::U32(remapped.clone());
        } else {
            let u16_indices: Vec<u16> = remapped.iter().map(|&x| x as u16).collect();
            geometry.indices = IndexBuffer::U16(u16_indices);
        }
        remapped_indices = Some(remapped);
    }

    let _target_vertices = &geometry.vertices;
    let mut tan = vec![0.0f64; output_vertex_count as usize * 3];
    let mut bitan = vec![0.0f64; output_vertex_count as usize * 3];

    for triangle in 0..triangle_count as usize {
        let i0 = corner_indices[triangle * 3];
        let i1 = corner_indices[triangle * 3 + 1];
        let i2 = corner_indices[triangle * 3 + 2];

        let element = triangle * 3;
        let o0 = if let Some(ref r) = remapped_indices { r[element] } else { i0 };
        let o1 = if let Some(ref r) = remapped_indices { r[element + 1] } else { i1 };
        let o2 = if let Some(ref r) = remapped_indices { r[element + 2] } else { i2 };

        let p0 = (i0 * source_floats_per_vertex + POSITION_OFFSET) as usize;
        let p1 = (i1 * source_floats_per_vertex + POSITION_OFFSET) as usize;
        let p2 = (i2 * source_floats_per_vertex + POSITION_OFFSET) as usize;
        let e1x = source_vertices[p1] - source_vertices[p0];
        let e1y = source_vertices[p1 + 1] - source_vertices[p0 + 1];
        let e1z = source_vertices[p1 + 2] - source_vertices[p0 + 2];
        let e2x = source_vertices[p2] - source_vertices[p0];
        let e2y = source_vertices[p2 + 1] - source_vertices[p0 + 1];
        let e2z = source_vertices[p2 + 2] - source_vertices[p0 + 2];

        let uv0 = (i0 * source_floats_per_vertex + UV0_OFFSET) as usize;
        let uv1 = (i1 * source_floats_per_vertex + UV0_OFFSET) as usize;
        let uv2 = (i2 * source_floats_per_vertex + UV0_OFFSET) as usize;
        let du1 = source_vertices[uv1] - source_vertices[uv0];
        let dv1 = source_vertices[uv1 + 1] - source_vertices[uv0 + 1];
        let du2 = source_vertices[uv2] - source_vertices[uv0];
        let dv2 = source_vertices[uv2 + 1] - source_vertices[uv0 + 1];
        let determinant = du1 * dv2 - du2 * dv1;
        let reciprocal = if determinant != 0.0 { 1.0 / determinant } else { 0.0 };

        let tx = (dv2 * e1x - dv1 * e2x) * reciprocal;
        let ty = (dv2 * e1y - dv1 * e2y) * reciprocal;
        let tz = (dv2 * e1z - dv1 * e2z) * reciprocal;
        let bx = (du1 * e2x - du2 * e1x) * reciprocal;
        let by = (du1 * e2y - du2 * e1y) * reciprocal;
        let bz = (du1 * e2z - du2 * e1z) * reciprocal;

        let tangent_sign: f32 = if position_groups.is_some() && determinant < 0.0 { -1.0 } else { 1.0 };

        let g0 = if let Some(groups) = position_groups { groups[i0 as usize] } else { o0 };
        let g1 = if let Some(groups) = position_groups { groups[i1 as usize] } else { o1 };
        let g2 = if let Some(groups) = position_groups { groups[i2 as usize] } else { o2 };

        accumulate_tangent(&mut tan, &mut bitan, g0,
            (tx * tangent_sign) as f64, (ty * tangent_sign) as f64, (tz * tangent_sign) as f64,
            bx as f64, by as f64, bz as f64);
        accumulate_tangent(&mut tan, &mut bitan, g1,
            (tx * tangent_sign) as f64, (ty * tangent_sign) as f64, (tz * tangent_sign) as f64,
            bx as f64, by as f64, bz as f64);
        accumulate_tangent(&mut tan, &mut bitan, g2,
            (tx * tangent_sign) as f64, (ty * tangent_sign) as f64, (tz * tangent_sign) as f64,
            bx as f64, by as f64, bz as f64);
    }

    // Write back tangents
    let mut target_verts = geometry.vertices.clone();

    // Build a reverse map: split_output_vertex -> original_source_vertex
    let mut split_reverse = vec![0u32; output_vertex_count as usize];
    for i in 0..source_vertex_count {
        split_reverse[i as usize] = i;
    }
    if let Some(ref remapped) = remapped_indices {
        for element in 0..remapped.len() {
            let output = remapped[element];
            if output >= source_vertex_count {
                split_reverse[output as usize] = corner_indices[element];
            }
        }
    }

    if position_groups.is_none() {
        for output in 0..output_vertex_count {
            write_accumulated_tangent(
                &mut target_verts, target_floats_per_vertex, output,
                &tan, &bitan, output, 1.0,
            );
        }
    } else {
        let groups = position_groups.unwrap();
        let o_states = orientation_states.as_ref();
        for source in 0..source_vertex_count {
            let sign: f32 = if let Some(states) = o_states {
                if states[source as usize] < 0 { -1.0 } else { 1.0 }
            } else { 1.0 };
            write_accumulated_tangent(
                &mut target_verts, target_floats_per_vertex, source,
                &tan, &bitan, groups[source as usize], sign,
            );
        }
        if let Some(ref remapped) = remapped_indices {
            let t_signs = triangle_signs.as_ref().unwrap();
            let element_count = remapped.len();
            for element in 0..element_count {
                let output = remapped[element];
                if output < source_vertex_count {
                    continue;
                }
                let source_idx = split_reverse[output as usize];
                let sign: f32 = if t_signs[element / 3] < 0 { -1.0 } else { 1.0 };
                write_accumulated_tangent(
                    &mut target_verts, target_floats_per_vertex, output,
                    &tan, &bitan, groups[source_idx as usize], sign,
                );
            }
        }
    }

    geometry.vertices = target_verts;
    geometry.version += 1;
}

fn write_accumulated_tangent(
    target_vertices: &mut [f32],
    target_floats_per_vertex: u32,
    output_vertex: u32,
    tangents: &[f64],
    bitangents: &[f64],
    accumulated_vertex: u32,
    tangent_sign: f32,
) {
    let n_base = (output_vertex * target_floats_per_vertex + NORMAL_OFFSET) as usize;
    let nx = target_vertices[n_base];
    let ny = target_vertices[n_base + 1];
    let nz = target_vertices[n_base + 2];

    let acc_base = accumulated_vertex as usize * 3;
    let mut tx = tangents[acc_base] as f32 * tangent_sign;
    let mut ty = tangents[acc_base + 1] as f32 * tangent_sign;
    let mut tz = tangents[acc_base + 2] as f32 * tangent_sign;

    // Gram-Schmidt
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
        // Degenerate fallback
        if nx.abs() <= ny.abs() && nx.abs() <= nz.abs() {
            tx = 0.0; ty = nz; tz = -ny;
        } else if ny.abs() <= nz.abs() {
            tx = -nz; ty = 0.0; tz = nx;
        } else {
            tx = ny; ty = -nx; tz = 0.0;
        }
        let fallback_len = (tx * tx + ty * ty + tz * tz).sqrt();
        if fallback_len > 0.0 {
            tx /= fallback_len;
            ty /= fallback_len;
            tz /= fallback_len;
        } else {
            tx = 1.0; ty = 0.0; tz = 0.0;
        }
    }

    // Handedness
    let cx = ny * tz - nz * ty;
    let cy = nz * tx - nx * tz;
    let cz = nx * ty - ny * tx;
    let w = if cx * (bitangents[acc_base] as f32)
        + cy * (bitangents[acc_base + 1] as f32)
        + cz * (bitangents[acc_base + 2] as f32) < 0.0
    {
        -1.0
    } else {
        1.0
    };

    let base = (output_vertex * target_floats_per_vertex + TANGENT_OFFSET) as usize;
    target_vertices[base] = tx;
    target_vertices[base + 1] = ty;
    target_vertices[base + 2] = tz;
    target_vertices[base + 3] = w;
}

fn mark_tangent_orientation(orientation_states: &mut [i8], vertex: u32, sign: i8) {
    let state = orientation_states[vertex as usize];
    if state == 0 {
        orientation_states[vertex as usize] = sign;
    } else if (if state < 0 { -1i8 } else { 1i8 }) != sign {
        orientation_states[vertex as usize] = if state < 0 { -BOTH_TANGENT_ORIENTATIONS } else { BOTH_TANGENT_ORIENTATIONS };
    }
}

fn accumulate_tangent(
    tangents: &mut [f64],
    bitangents: &mut [f64],
    vertex: u32,
    tx: f64, ty: f64, tz: f64,
    bx: f64, by: f64, bz: f64,
) {
    let base = vertex as usize * 3;
    tangents[base] += tx;
    tangents[base + 1] += ty;
    tangents[base + 2] += tz;
    bitangents[base] += bx;
    bitangents[base + 1] += by;
    bitangents[base + 2] += bz;
}

/// Returns the geometry's cached local bounds, recomputing them if invalidated.
/// Returns None for a geometry with no boundable volume.
pub fn ensure_mesh_geometry_bounds(geometry: &mut MeshGeometry) -> Option<&Aabb> {
    let needs_refresh = geometry.bounds.is_none()
        || geometry.runtime.bounds_version != geometry.version as i32;
    if needs_refresh {
        refresh_mesh_geometry_bounds(geometry);
    }
    return match geometry.bounds.as_ref() {
        Some(b) if b.min.x <= b.max.x => Some(b),
        _ => None,
    };
}

/// Recomputes a geometry's cached local bounds unconditionally.
pub fn refresh_mesh_geometry_bounds(geometry: &mut MeshGeometry) {
    let mut bounds = geometry.bounds.take()
        .unwrap_or_else(|| create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0));
    compute_mesh_geometry_bounds(&mut bounds, geometry);
    geometry.bounds = Some(bounds);
    geometry.runtime.bounds_version = geometry.version as i32;
}
