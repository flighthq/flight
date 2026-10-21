use crate::IndexBufferU16;
use crate::IndexBufferU32;
use std::collections::HashMap;

use crate::IndexBuffer;
use crate::MeshGeometry;

use crate::PrimitiveTopology;
use crate::clone_mesh_geometry;
use crate::clone_mesh_geometry_metadata;
use crate::get_mesh_geometry_vertex_count;

const UINT16_INDEX_CEILING: u32 = 65535;
const UINT32_UNMAPPED: u32 = 0xFFFFFFFF;

/// Removes vertex records not referenced by an indexed geometry and remaps the element
/// stream to the compact records. Non-indexed input is deep-cloned. Invalid stride
/// alignment or out-of-range source indices likewise return an unchanged deep clone.
pub fn compact_mesh_geometry_vertices(geometry: &MeshGeometry) -> MeshGeometry {
    let stride = geometry.layout.read().unwrap().stride;
    let byte_length = (geometry.vertices.len() as u32) * 4;
    let has_indices = match &geometry.indices {
        IndexBuffer::None => false,
        _ => true,
    };
    if !has_indices || stride == 0 || stride % 4 != 0 || byte_length % stride != 0 {
        return clone_mesh_geometry(geometry);
    }

    let vertex_count = byte_length / stride;
    let floats_per_vertex = (stride / 4) as usize;
    let mut source_to_compact = vec![UINT32_UNMAPPED; vertex_count as usize];
    let mut compact_count: u32 = 0;

    let index_len = match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            let v = v.read().unwrap();
            v.len()
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            let v = v.read().unwrap();
            v.len()
        }
        IndexBuffer::None => 0,
    };

    for element in 0..index_len {
        let source_index = match &geometry.indices {
            IndexBuffer::U16(IndexBufferU16 { data: v }) => {
                let v = v.read().unwrap();
                v[element] as u32
            }
            IndexBuffer::U32(IndexBufferU32 { data: v }) => {
                let v = v.read().unwrap();
                v[element]
            }
            IndexBuffer::None => element as u32,
        };
        if source_index >= vertex_count {
            return clone_mesh_geometry(geometry);
        }
        if source_to_compact[source_index as usize] == UINT32_UNMAPPED {
            source_to_compact[source_index as usize] = compact_count;
            compact_count += 1;
        }
    }

    let mut compact_vertices = vec![0.0f32; compact_count as usize * floats_per_vertex];
    for source_index in 0..vertex_count as usize {
        let compact_index = source_to_compact[source_index];
        if compact_index == UINT32_UNMAPPED {
            continue;
        }
        let src_start = source_index * floats_per_vertex;
        let dst_start = compact_index as usize * floats_per_vertex;
        compact_vertices[dst_start..dst_start + floats_per_vertex]
            .copy_from_slice(&geometry.vertices[src_start..src_start + floats_per_vertex]);
    }

    let indices = if compact_count > UINT16_INDEX_CEILING {
        let mut out = vec![0u32; index_len];
        for element in 0..index_len {
            let source_index = match &geometry.indices {
                IndexBuffer::U16(IndexBufferU16 { data: v }) => {
                    let v = v.read().unwrap();
                    v[element] as u32
                }
                IndexBuffer::U32(IndexBufferU32 { data: v }) => {
                    let v = v.read().unwrap();
                    v[element]
                }
                IndexBuffer::None => element as u32,
            };
            out[element] = source_to_compact[source_index as usize];
        }
        IndexBuffer::U32(IndexBufferU32 {
            data: std::sync::Arc::new(std::sync::RwLock::new((out).into())),
        })
    } else {
        let mut out = vec![0u16; index_len];
        for element in 0..index_len {
            let source_index = match &geometry.indices {
                IndexBuffer::U16(IndexBufferU16 { data: v }) => {
                    let v = v.read().unwrap();
                    v[element] as u32
                }
                IndexBuffer::U32(IndexBufferU32 { data: v }) => {
                    let v = v.read().unwrap();
                    v[element]
                }
                IndexBuffer::None => element as u32,
            };
            out[element] = source_to_compact[source_index as usize] as u16;
        }
        IndexBuffer::U16(IndexBufferU16 {
            data: std::sync::Arc::new(std::sync::RwLock::new((out).into())),
        })
    };

    let mut out = clone_mesh_geometry_metadata(geometry);
    out.vertices = (compact_vertices).into();
    out.indices = indices;
    return out;
}

/// Returns the wireframe line-list index buffer for the geometry's triangle indices.
/// Every triangle edge expands to a two-index line segment. Returns an empty buffer
/// for non-triangle topologies.
pub fn compute_mesh_geometry_wireframe_indices(geometry: &MeshGeometry) -> IndexBuffer {
    let use_u32 = match &geometry.indices {
        IndexBuffer::U32(_) => true,
        IndexBuffer::None => true,
        IndexBuffer::U16(_) => false,
    };
    if geometry.topology != PrimitiveTopology::TriangleList
        && geometry.topology != PrimitiveTopology::TriangleStrip
    {
        return if use_u32 {
            IndexBuffer::U32(IndexBufferU32 {
                data: std::sync::Arc::new(std::sync::RwLock::new((Vec::new()).into())),
            })
        } else {
            IndexBuffer::U16(IndexBufferU16 {
                data: std::sync::Arc::new(std::sync::RwLock::new((Vec::new()).into())),
            })
        };
    }

    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    let index_count = match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            let v = v.read().unwrap();
            v.len()
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            let v = v.read().unwrap();
            v.len()
        }
        IndexBuffer::None => vertex_count as usize,
    };

    let mut lines: Vec<u32> = Vec::new();
    if geometry.topology == PrimitiveTopology::TriangleList {
        let mut t = 0;
        while t + 2 < index_count {
            let a = get_index(geometry, t);
            let b = get_index(geometry, t + 1);
            let c = get_index(geometry, t + 2);
            lines.extend_from_slice(&[a, b, b, c, c, a]);
            t += 3;
        }
    } else {
        let mut t = 0;
        while t + 2 < index_count {
            let a = get_index(geometry, t);
            let b = get_index(geometry, t + 1);
            let c = get_index(geometry, t + 2);
            lines.extend_from_slice(&[a, b, b, c, c, a]);
            t += 1;
        }
    }

    if use_u32 {
        return IndexBuffer::U32(IndexBufferU32 {
            data: std::sync::Arc::new(std::sync::RwLock::new((lines).into())),
        });
    }
    let u16_lines: Vec<u16> = lines.iter().map(|&v| v as u16).collect();
    return IndexBuffer::U16(IndexBufferU16 {
        data: std::sync::Arc::new(std::sync::RwLock::new((u16_lines).into())),
    });
}

fn equal_vertex_record(
    a: &[u8],
    a_offset: usize,
    b: &[u8],
    b_offset: usize,
    byte_length: usize,
) -> bool {
    for i in 0..byte_length {
        if a[a_offset + i] != b[b_offset + i] {
            return false;
        }
    }
    return true;
}

/// De-indexes the geometry into a flat non-indexed stream: each index entry expands
/// into its own copy of the referenced vertex record. Non-indexed geometry is deep-copied.
pub fn expand_mesh_geometry_indices(geometry: &MeshGeometry) -> MeshGeometry {
    let has_indices = match &geometry.indices {
        IndexBuffer::None => false,
        _ => true,
    };
    if !has_indices {
        return clone_mesh_geometry(geometry);
    }

    let floats_per_vertex = (geometry.layout.read().unwrap().stride / 4) as usize;
    let index_count = match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            let v = v.read().unwrap();
            v.len()
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            let v = v.read().unwrap();
            v.len()
        }
        IndexBuffer::None => 0,
    };

    let mut vertices = vec![0.0f32; index_count * floats_per_vertex];
    for i in 0..index_count {
        let src_index = match &geometry.indices {
            IndexBuffer::U16(IndexBufferU16 { data: v }) => {
                let v = v.read().unwrap();
                v[i] as usize
            }
            IndexBuffer::U32(IndexBufferU32 { data: v }) => {
                let v = v.read().unwrap();
                v[i] as usize
            }
            IndexBuffer::None => i,
        };
        let src = src_index * floats_per_vertex;
        let dst = i * floats_per_vertex;
        for f in 0..floats_per_vertex {
            vertices[dst + f] = geometry.vertices[src + f];
        }
    }

    let mut out = clone_mesh_geometry_metadata(geometry);
    out.indices = IndexBuffer::None;
    out.vertices = (vertices).into();
    return out;
}

fn get_index(geometry: &MeshGeometry, element: usize) -> u32 {
    return match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            let v = v.read().unwrap();
            v[element] as u32
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            let v = v.read().unwrap();
            v[element]
        }
        IndexBuffer::None => element as u32,
    };
}

fn hash_vertex_record(bytes: &[u8], offset: usize, byte_length: usize) -> u32 {
    let mut hash: u32 = 0x811c9dc5;
    for i in 0..byte_length {
        hash ^= bytes[offset + i] as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    return hash;
}

/// Converts a non-indexed vertex stream to an indexed stream without welding.
/// Already-indexed input is deep-cloned unchanged.
pub fn index_mesh_geometry_vertices(geometry: &MeshGeometry) -> MeshGeometry {
    let mut out = clone_mesh_geometry(geometry);
    let has_indices = match &out.indices {
        IndexBuffer::None => false,
        _ => true,
    };
    if has_indices {
        return out;
    }
    let vertex_count = get_mesh_geometry_vertex_count(&out);
    if vertex_count > UINT16_INDEX_CEILING {
        let indices: Vec<u32> = (0..vertex_count).collect();
        out.indices = IndexBuffer::U32(IndexBufferU32 {
            data: std::sync::Arc::new(std::sync::RwLock::new((indices).into())),
        });
    } else {
        let indices: Vec<u16> = (0..vertex_count as u16).collect();
        out.indices = IndexBuffer::U16(IndexBufferU16 {
            data: std::sync::Arc::new(std::sync::RwLock::new((indices).into())),
        });
    }
    return out;
}

fn vertices_as_bytes_readonly(vertices: &[f32]) -> &[u8] {
    let ptr = vertices.as_ptr() as *const u8;
    let len = vertices.len() * 4;
    return unsafe { std::slice::from_raw_parts(ptr, len) };
}

/// Welds byte-identical interleaved vertex records and remaps the element stream to the
/// unique records. Invalid stride alignment returns an unchanged deep clone.
pub fn weld_mesh_geometry_vertices(geometry: &MeshGeometry) -> MeshGeometry {
    let stride = geometry.layout.read().unwrap().stride;
    let byte_length = (geometry.vertices.len() as u32) * 4;
    if stride == 0 || stride % 4 != 0 || byte_length % stride != 0 {
        return clone_mesh_geometry(geometry);
    }

    let vertex_count = (byte_length / stride) as usize;
    let floats_per_vertex = (stride / 4) as usize;
    let source_bytes = vertices_as_bytes_readonly(&geometry.vertices);
    let mut unique_bytes = vec![0u8; byte_length as usize];
    let mut source_to_unique = vec![0u32; vertex_count];
    let mut candidates_by_hash: HashMap<u32, Vec<u32>> = HashMap::new();
    let mut unique_count: u32 = 0;

    for vertex in 0..vertex_count {
        let source_offset = vertex * stride as usize;
        let hash = hash_vertex_record(source_bytes, source_offset, stride as usize);
        let candidates = candidates_by_hash.get(&hash);
        let mut unique_index: i64 = -1;
        if let Some(cands) = candidates {
            for &candidate in cands {
                if equal_vertex_record(
                    source_bytes,
                    source_offset,
                    &unique_bytes,
                    candidate as usize * stride as usize,
                    stride as usize,
                ) {
                    unique_index = candidate as i64;
                    break;
                }
            }
        }
        if unique_index < 0 {
            unique_index = unique_count as i64;
            unique_count += 1;
            let dst_offset = unique_index as usize * stride as usize;
            unique_bytes[dst_offset..dst_offset + stride as usize]
                .copy_from_slice(&source_bytes[source_offset..source_offset + stride as usize]);
            candidates_by_hash
                .entry(hash)
                .or_insert_with(Vec::new)
                .push(unique_index as u32);
        }
        source_to_unique[vertex] = unique_index as u32;
    }

    let element_count = match &geometry.indices {
        IndexBuffer::U16(IndexBufferU16 { data: v }) => {
            let v = v.read().unwrap();
            v.len()
        }
        IndexBuffer::U32(IndexBufferU32 { data: v }) => {
            let v = v.read().unwrap();
            v.len()
        }
        IndexBuffer::None => vertex_count,
    };

    let indices = if unique_count > UINT16_INDEX_CEILING {
        let mut out = vec![0u32; element_count];
        for element in 0..element_count {
            let source_index = match &geometry.indices {
                IndexBuffer::U16(IndexBufferU16 { data: v }) => {
                    let v = v.read().unwrap();
                    v[element] as usize
                }
                IndexBuffer::U32(IndexBufferU32 { data: v }) => {
                    let v = v.read().unwrap();
                    v[element] as usize
                }
                IndexBuffer::None => element,
            };
            if source_index >= vertex_count {
                return clone_mesh_geometry(geometry);
            }
            out[element] = source_to_unique[source_index];
        }
        IndexBuffer::U32(IndexBufferU32 {
            data: std::sync::Arc::new(std::sync::RwLock::new((out).into())),
        })
    } else {
        let mut out = vec![0u16; element_count];
        for element in 0..element_count {
            let source_index = match &geometry.indices {
                IndexBuffer::U16(IndexBufferU16 { data: v }) => {
                    let v = v.read().unwrap();
                    v[element] as usize
                }
                IndexBuffer::U32(IndexBufferU32 { data: v }) => {
                    let v = v.read().unwrap();
                    v[element] as usize
                }
                IndexBuffer::None => element,
            };
            if source_index >= vertex_count {
                return clone_mesh_geometry(geometry);
            }
            out[element] = source_to_unique[source_index] as u16;
        }
        IndexBuffer::U16(IndexBufferU16 {
            data: std::sync::Arc::new(std::sync::RwLock::new((out).into())),
        })
    };

    // Truncate unique bytes to only what was used
    let welded_float_count = unique_count as usize * floats_per_vertex;
    let mut welded_vertices = vec![0.0f32; welded_float_count];
    for i in 0..welded_float_count {
        let offset = i * 4;
        let b = [
            unique_bytes[offset],
            unique_bytes[offset + 1],
            unique_bytes[offset + 2],
            unique_bytes[offset + 3],
        ];
        welded_vertices[i] = f32::from_le_bytes(b);
    }

    let mut out = clone_mesh_geometry_metadata(geometry);
    out.vertices = (welded_vertices).into();
    out.indices = indices;
    return out;
}
