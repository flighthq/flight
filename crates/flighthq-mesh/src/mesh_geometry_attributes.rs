//! Vertex attribute accessors for MeshGeometry.
//!
//! Port of `meshGeometryAttributes.ts` and the triangle-count query from
//! `meshGeometryOperations.ts`.

use flighthq_types::{MeshGeometry, MeshIndices, PrimitiveTopology, Vector3Like, VertexSemantic};

use crate::mesh_geometry::get_mesh_geometry_vertex_count;

/// Returns the number of triangles in a `MeshGeometry`.
///
/// For `triangle-list` topology, this is `floor(indexCount / 3)`.
/// For `triangle-strip`, this is `max(0, indexCount - 2)`.
/// Other topologies return 0.
pub fn get_mesh_geometry_triangle_count(geometry: &MeshGeometry) -> u32 {
    let index_count = match &geometry.indices {
        Some(MeshIndices::U16(v)) => v.len() as u32,
        Some(MeshIndices::U32(v)) => v.len() as u32,
        None => get_mesh_geometry_vertex_count(geometry),
    };
    match geometry.topology {
        PrimitiveTopology::TriangleList => index_count / 3,
        PrimitiveTopology::TriangleStrip => {
            if index_count >= 3 {
                index_count - 2
            } else {
                0
            }
        }
        _ => 0,
    }
}

/// Returns the index stored at position `index_position` in the index buffer.
pub fn get_mesh_geometry_index(geometry: &MeshGeometry, index_position: u32) -> Option<u32> {
    match &geometry.indices {
        Some(MeshIndices::U16(v)) => v.get(index_position as usize).map(|&i| i as u32),
        Some(MeshIndices::U32(v)) => v.get(index_position as usize).copied(),
        None => Some(index_position),
    }
}

/// Writes the position (x, y, z) of vertex `vertex_index` into `out`.
///
/// Returns `false` when the layout has no position attribute or `vertex_index`
/// is out of range; `out` is left unchanged on `false`.
pub fn get_mesh_geometry_vertex_position(
    out: &mut Vector3Like,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    let float_offset = match vertex_semantic_float_offset(geometry, VertexSemantic::Position) {
        Some(off) => off,
        None => return false,
    };
    let floats_per_vertex = geometry.layout.stride / 4;
    if floats_per_vertex == 0 {
        return false;
    }
    let vertex_count = geometry.vertices.len() as u32 / floats_per_vertex;
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset) as usize;
    let verts = &geometry.vertices;
    out.x = verts[base];
    out.y = verts[base + 1];
    out.z = verts[base + 2];
    true
}

/// Returns the float offset of the first component of the attribute with
/// `semantic` within one interleaved vertex record, or `None` if absent.
fn vertex_semantic_float_offset(geometry: &MeshGeometry, semantic: VertexSemantic) -> Option<u32> {
    geometry
        .layout
        .attributes
        .iter()
        .find(|a| a.semantic == semantic)
        .map(|a| a.byte_offset / 4)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};
    use flighthq_types::{Vector3Like, VertexAttribute, VertexAttributeLayout, VertexFormat};

    fn make_triangle_geometry() -> MeshGeometry {
        let layout = VertexAttributeLayout {
            stride: 12,
            attributes: vec![VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            }],
        };
        #[rustfmt::skip]
        let vertices = vec![
            0.0f32, 0.0, 0.0,
            1.0,    0.0, 0.0,
            0.0,    1.0, 0.0,
        ];
        create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            subsets: None,
            topology: None,
            vertices,
        })
    }

    // get_mesh_geometry_triangle_count

    #[test]
    fn get_mesh_geometry_triangle_count_triangle_list_no_indices() {
        let geo = make_triangle_geometry();
        assert_eq!(get_mesh_geometry_triangle_count(&geo), 1);
    }

    #[test]
    fn get_mesh_geometry_triangle_count_triangle_strip() {
        use flighthq_types::PrimitiveTopology;
        let layout = VertexAttributeLayout {
            stride: 12,
            attributes: vec![VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            }],
        };
        let vertices = vec![0.0f32; 4 * 3];
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            subsets: None,
            topology: Some(PrimitiveTopology::TriangleStrip),
            vertices,
        });
        assert_eq!(get_mesh_geometry_triangle_count(&geo), 2);
    }

    // get_mesh_geometry_vertex_position

    #[test]
    fn get_mesh_geometry_vertex_position_reads_correct_vertex() {
        let geo = make_triangle_geometry();
        let mut out = Vector3Like::default();
        assert!(get_mesh_geometry_vertex_position(&mut out, &geo, 1));
        assert!((out.x - 1.0).abs() < 1e-6);
        assert!((out.y).abs() < 1e-6);
        assert!((out.z).abs() < 1e-6);
    }

    #[test]
    fn get_mesh_geometry_vertex_position_out_of_range_returns_false() {
        let geo = make_triangle_geometry();
        let mut out = Vector3Like::default();
        assert!(!get_mesh_geometry_vertex_position(&mut out, &geo, 10));
    }
}
