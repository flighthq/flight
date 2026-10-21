use crate::IndexBufferU32;
use crate::IndexBufferU16;
use crate::IndexBuffer;
use crate::MeshGeometry;
use crate::MeshGeometryFromAttributesOptions;
use crate::MeshGeometryOptions;
use crate::MeshSubset;
use crate::MeshTriangleVertexIndices;
use crate::PrimitiveTopology;
use crate::VertexAttributeLayout;
use crate::CANONICAL_MESH_GEOMETRY_LAYOUT;
use crate::compute_mesh_geometry_normals;
use crate::compute_mesh_geometry_tangents;
use crate::create_mesh_geometry;
use crate::get_mesh_geometry_vertex_count;
use crate::is_float32_format;
use crate::refresh_mesh_geometry_bounds;

const CANONICAL_FLOATS_PER_VERTEX: u32 = 12;
const UINT16_INDEX_CEILING: u32 = 65535;

/// Builds a MeshGeometry from separate position/normal/uv arrays using the canonical
/// 12-float PBR record. Normals are computed when omitted; tangents are always computed.
pub fn create_mesh_geometry_from_attributes(options: MeshGeometryFromAttributesOptions) -> MeshGeometry {
    let positions = &options.positions;
    let vertex_count = positions.len() / 3;
    let normals = options.normals.as_ref();
    let uvs = options.uvs.as_ref();
    let mut vertices = vec![0.0f32; vertex_count * CANONICAL_FLOATS_PER_VERTEX as usize];

    for i in 0..vertex_count {
        let base = i * CANONICAL_FLOATS_PER_VERTEX as usize;
        vertices[base] = positions[i * 3];
        vertices[base + 1] = positions[i * 3 + 1];
        vertices[base + 2] = positions[i * 3 + 2];
        if let Some(n) = normals {
            vertices[base + 3] = n[i * 3];
            vertices[base + 4] = n[i * 3 + 1];
            vertices[base + 5] = n[i * 3 + 2];
        }
        if let Some(u) = uvs {
            vertices[base + 10] = u[i * 2];
            vertices[base + 11] = u[i * 2 + 1];
        }
    }

    let index_buffer = match options.indices {
        Some(src) => {
            let needs_uint32 = vertex_count as u32 > UINT16_INDEX_CEILING;
            if needs_uint32 {
                Some(IndexBuffer::U32(IndexBufferU32 { data: src }))
            } else {
                let u16_indices: Vec<u16> = src.iter().map(|&x| x as u16).collect();
                Some(IndexBuffer::U16(IndexBufferU16 { data: u16_indices }))
            }
        }
        None => None,
    };

    let mut geometry = create_mesh_geometry(MeshGeometryOptions {
        indices: index_buffer,
        layout: CANONICAL_MESH_GEOMETRY_LAYOUT.clone(),
        vertices,
        subsets: None,
        topology: None,
    });

    if normals.is_none() {
        let geometry_source = geometry.clone();
        compute_mesh_geometry_normals(&mut geometry, &geometry_source, None);
    }
    let geometry_source = geometry.clone();
    compute_mesh_geometry_tangents(&mut geometry, &geometry_source, None);
    refresh_mesh_geometry_bounds(&mut geometry);
    return geometry;
}

fn find_position_float_offset(layout: &VertexAttributeLayout) -> i32 {
    for attr in &layout.attributes {
        if attr.semantic == crate::VertexSemantic::Position && is_float32_format(attr.format) {
            return (attr.byte_offset / 4) as i32;
        }
    }
    return -1;
}

fn forms_whole_primitives(count: u32, topology: PrimitiveTopology) -> bool {
    if count == 0 {
        return true;
    }
    return match topology {
        PrimitiveTopology::TriangleList => count % 3 == 0,
        PrimitiveTopology::TriangleStrip => count >= 3,
        PrimitiveTopology::LineList => count % 2 == 0,
        PrimitiveTopology::LineStrip => count >= 2,
        PrimitiveTopology::PointList => true,
    };
}

/// Returns the number of triangles in the geometry for triangle-list and triangle-strip
/// topologies. Returns 0 for all other topologies.
pub fn get_mesh_geometry_triangle_count(geometry: &MeshGeometry) -> u32 {
    if geometry.topology == PrimitiveTopology::TriangleList {
        let index_count = match &geometry.indices {
            IndexBuffer::U16(IndexBufferU16 { data: v }) => v.len() as u32,
            IndexBuffer::U32(IndexBufferU32 { data: v }) => v.len() as u32,
            IndexBuffer::None => get_mesh_geometry_vertex_count(geometry),
        };
        return index_count / 3;
    }
    if geometry.topology == PrimitiveTopology::TriangleStrip {
        let index_count = match &geometry.indices {
            IndexBuffer::U16(IndexBufferU16 { data: v }) => v.len() as u32,
            IndexBuffer::U32(IndexBufferU32 { data: v }) => v.len() as u32,
            IndexBuffer::None => get_mesh_geometry_vertex_count(geometry),
        };
        return if index_count >= 3 { index_count - 2 } else { 0 };
    }
    return 0;
}

/// Resolves one logical triangle for indexed or non-indexed triangle-list/triangle-strip geometry.
/// Returns false for unsupported topology or out-of-range triangle.
pub fn get_mesh_geometry_triangle_vertex_indices(
    out: &mut MeshTriangleVertexIndices,
    geometry: &MeshGeometry,
    triangle_index: u32,
) -> bool {
    if triangle_index >= get_mesh_geometry_triangle_count(geometry) {
        return false;
    }

    let element0: u32;
    let element1: u32;
    let element2: u32;

    if geometry.topology == PrimitiveTopology::TriangleList {
        element0 = triangle_index * 3;
        element1 = element0 + 1;
        element2 = element0 + 2;
    } else if geometry.topology == PrimitiveTopology::TriangleStrip {
        let mut e0 = triangle_index;
        let mut e1 = triangle_index + 1;
        let e2 = triangle_index + 2;
        if (triangle_index & 1) != 0 {
            let swap = e0;
            e0 = e1;
            e1 = swap;
        }
        element0 = e0;
        element1 = e1;
        element2 = e2;
    } else {
        return false;
    }

    match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            out.i0 = v[element0 as usize] as u32;
            out.i1 = v[element1 as usize] as u32;
            out.i2 = v[element2 as usize] as u32;
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            out.i0 = v[element0 as usize];
            out.i1 = v[element1 as usize];
            out.i2 = v[element2 as usize];
        }
        IndexBuffer::None => {
            out.i0 = element0;
            out.i1 = element1;
            out.i2 = element2;
        }
    }
    return true;
}

fn has_finite_vertex_channels(geometry: &MeshGeometry, floats_per_vertex: u32, vertex_count: u32) -> bool {
    let verts = &geometry.vertices;
    for attribute in &geometry.layout.attributes {
        if !is_float32_format(attribute.format) {
            continue;
        }
        let offset = attribute.byte_offset / 4;
        let components = match attribute.format {
            crate::VertexFormat::Float32x2 => 2u32,
            crate::VertexFormat::Float32x3 => 3,
            crate::VertexFormat::Float32x4 => 4,
            _ => 0,
        };
        if components == 0 {
            continue;
        }
        for v in 0..vertex_count {
            let base = (v * floats_per_vertex + offset) as usize;
            for c in 0..components as usize {
                if !verts[base + c].is_finite() {
                    return false;
                }
            }
        }
    }
    return true;
}

fn has_valid_draw_ranges(geometry: &MeshGeometry, vertex_count: u32) -> bool {
    let element_count = match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => v.len() as u32,
        IndexBuffer::U32(IndexBufferU32 { data: v }) => v.len() as u32,
        IndexBuffer::None => vertex_count,
    };
    for subset in &geometry.subsets {
        if subset.index_offset + subset.index_count > element_count {
            return false;
        }
        if !forms_whole_primitives(subset.index_count, geometry.topology) {
            return false;
        }
    }
    return forms_whole_primitives(element_count, geometry.topology);
}

fn layouts_match(a: &VertexAttributeLayout, b: &VertexAttributeLayout) -> bool {
    if a.stride != b.stride {
        return false;
    }
    if a.attributes.len() != b.attributes.len() {
        return false;
    }
    for i in 0..a.attributes.len() {
        let aa = &a.attributes[i];
        let ba = &b.attributes[i];
        if aa.semantic != ba.semantic || aa.format != ba.format || aa.byte_offset != ba.byte_offset {
            return false;
        }
    }
    return true;
}

/// Concatenates multiple geometries into a single MeshGeometry. All must share the same
/// layout and topology. Returns None on mismatch or empty input.
pub fn merge_mesh_geometries(geometries: &[&MeshGeometry]) -> Option<MeshGeometry> {
    if geometries.is_empty() {
        return None;
    }
    let reference = geometries[0];
    let layout = &reference.layout;
    let topology = reference.topology;
    for i in 1..geometries.len() {
        if !layouts_match(layout, &geometries[i].layout) {
            return None;
        }
        if geometries[i].topology != topology {
            return None;
        }
    }

    let floats_per_vertex = layout.stride / 4;
    let mut total_vertex_floats: usize = 0;
    let mut total_index_count: usize = 0;
    let mut all_indexed = true;

    for geo in geometries {
        let vc = if floats_per_vertex > 0 { geo.vertices.len() / floats_per_vertex as usize } else { 0 };
        total_vertex_floats += vc * floats_per_vertex as usize;
        match &geo.indices {
            IndexBuffer::U16(IndexBufferU16 { data: v }) => { total_index_count += v.len(); }
            IndexBuffer::U32(IndexBufferU32 { data: v }) => { total_index_count += v.len(); }
            IndexBuffer::None => {
                all_indexed = false;
                total_index_count += vc;
            }
        }
    }

    let mut merged_vertices = vec![0.0f32; total_vertex_floats];
    let needs_uint32 = (total_vertex_floats / floats_per_vertex as usize) > UINT16_INDEX_CEILING as usize;
    let mut merged_indices_u32: Vec<u32> = Vec::new();
    let mut merged_indices_u16: Vec<u16> = Vec::new();
    let has_indices = all_indexed || total_index_count > 0;
    if has_indices {
        if needs_uint32 {
            merged_indices_u32 = vec![0u32; total_index_count];
        } else {
            merged_indices_u16 = vec![0u16; total_index_count];
        }
    }
    let mut merged_subsets: Vec<MeshSubset> = Vec::new();

    let mut vertex_offset: u32 = 0;
    let mut index_offset: usize = 0;
    let mut vertex_float_offset: usize = 0;

    for geo in geometries {
        let vc = if floats_per_vertex > 0 { geo.vertices.len() / floats_per_vertex as usize } else { 0 };
        let copy_len = vc * floats_per_vertex as usize;
        merged_vertices[vertex_float_offset..vertex_float_offset + copy_len]
            .copy_from_slice(&geo.vertices[..copy_len]);

        if has_indices {
            let src_count = match &geo.indices {
                IndexBuffer::U16(IndexBufferU16 { data: v }) => v.len(),
                IndexBuffer::U32(IndexBufferU32 { data: v }) => v.len(),
                IndexBuffer::None => vc,
            };
            for j in 0..src_count {
                let src_idx = match &geo.indices {
                    IndexBuffer::U16(IndexBufferU16 { data: v }) => v[j] as u32,
                    IndexBuffer::U32(IndexBufferU32 { data: v }) => v[j],
                    IndexBuffer::None => j as u32,
                };
                let remapped = src_idx + vertex_offset;
                if needs_uint32 {
                    merged_indices_u32[index_offset + j] = remapped;
                } else {
                    merged_indices_u16[index_offset + j] = remapped as u16;
                }
            }
            for subset in &geo.subsets {
                merged_subsets.push(MeshSubset {
                    index_count: subset.index_count,
                    index_offset: subset.index_offset + index_offset as u32,
                });
            }
            index_offset += src_count;
        }
        vertex_offset += vc as u32;
        vertex_float_offset += copy_len;
    }

    if merged_subsets.is_empty() {
        let count = if has_indices {
            if needs_uint32 { merged_indices_u32.len() as u32 } else { merged_indices_u16.len() as u32 }
        } else {
            (total_vertex_floats / floats_per_vertex as usize) as u32
        };
        merged_subsets.push(MeshSubset { index_count: count, index_offset: 0 });
    }

    let index_buffer = if has_indices {
        if needs_uint32 {
            Some(IndexBuffer::U32(IndexBufferU32 { data: merged_indices_u32 }))
        } else {
            Some(IndexBuffer::U16(IndexBufferU16 { data: merged_indices_u16 }))
        }
    } else {
        None
    };

    let mut merged = create_mesh_geometry(MeshGeometryOptions {
        indices: index_buffer,
        layout: layout.clone(),
        subsets: Some(merged_subsets),
        topology: Some(topology),
        vertices: merged_vertices,
    });
    refresh_mesh_geometry_bounds(&mut merged);
    return Some(merged);
}

/// Validates a geometry for common structural errors. Returns true when valid.
pub fn validate_mesh_geometry(geometry: &MeshGeometry) -> bool {
    let floats_per_vertex = geometry.layout.stride / 4;
    if floats_per_vertex == 0 {
        return false;
    }
    if (geometry.vertices.len() as u32) % floats_per_vertex != 0 {
        return false;
    }
    let vertex_count = geometry.vertices.len() as u32 / floats_per_vertex;

    // All index values must be within range
    match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            for i in 0..v.len() {
                if v[i] as u32 >= vertex_count {
                    return false;
                }
            }
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            for i in 0..v.len() {
                if v[i] >= vertex_count {
                    return false;
                }
            }
        }
        IndexBuffer::None => {}
    }

    // Check positions for NaN/Inf
    let pos_offset = find_position_float_offset(&geometry.layout);
    if pos_offset >= 0 {
        let verts = &geometry.vertices;
        for i in 0..vertex_count {
            let base = (i * floats_per_vertex + pos_offset as u32) as usize;
            let x = verts[base];
            let y = verts[base + 1];
            let z = verts[base + 2];
            if !x.is_finite() || !y.is_finite() || !z.is_finite() {
                return false;
            }
        }
    }

    if !has_finite_vertex_channels(geometry, floats_per_vertex, vertex_count) {
        return false;
    }
    if !has_valid_draw_ranges(geometry, vertex_count) {
        return false;
    }
    return true;
}

