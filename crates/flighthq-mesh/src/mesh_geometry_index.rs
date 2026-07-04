//! Index-buffer pipeline over a `MeshGeometry`: de-index a welded stream to a
//! flat non-indexed one, and derive a wireframe line-list from a triangle
//! index buffer.
//!
//! Ports `@flighthq/mesh` `meshGeometryIndex.ts`. These read the existing
//! vertex/index streams and produce fresh data; they do not mutate the
//! source geometry.

use flighthq_types::{MeshGeometry, MeshIndices, PrimitiveTopology};

use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};

/// Returns the wireframe line-list index buffer for the geometry's triangle
/// indices: every triangle edge expands to a two-index line segment, so a
/// triangle `(a, b, c)` yields the lines `(a, b)`, `(b, c)`, `(c, a)`. Reads
/// the existing index stream (or sequential triangles for non-indexed
/// geometry) and assembles a new index buffer suitable for `line-list`
/// topology. Returns an empty buffer for geometry whose topology is not a
/// triangle family. The element type matches the source index width
/// (`u32` for non-indexed, mirroring the source buffer otherwise).
pub fn compute_mesh_geometry_wireframe_indices(geometry: &MeshGeometry) -> MeshIndices {
    let use_u32 = match &geometry.indices {
        Some(MeshIndices::U32(_)) => true,
        Some(MeshIndices::U16(_)) => false,
        None => true,
    };
    if geometry.topology != PrimitiveTopology::TriangleList
        && geometry.topology != PrimitiveTopology::TriangleStrip
    {
        return if use_u32 {
            MeshIndices::U32(Vec::new())
        } else {
            MeshIndices::U16(Vec::new())
        };
    }

    let indices = &geometry.indices;
    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() / floats_per_vertex
    } else {
        0
    };
    let index_count = match indices {
        Some(MeshIndices::U16(v)) => v.len(),
        Some(MeshIndices::U32(v)) => v.len(),
        None => vertex_count,
    };

    let get_index = |i: usize| -> u32 {
        match indices {
            Some(MeshIndices::U16(v)) => v[i] as u32,
            Some(MeshIndices::U32(v)) => v[i],
            None => i as u32,
        }
    };

    let mut lines: Vec<u32> = Vec::new();
    if geometry.topology == PrimitiveTopology::TriangleList {
        let mut t = 0;
        while t + 2 < index_count {
            let a = get_index(t);
            let b = get_index(t + 1);
            let c = get_index(t + 2);
            lines.extend_from_slice(&[a, b, b, c, c, a]);
            t += 3;
        }
    } else {
        let mut t = 0;
        while t + 2 < index_count {
            let a = get_index(t);
            let b = get_index(t + 1);
            let c = get_index(t + 2);
            lines.extend_from_slice(&[a, b, b, c, c, a]);
            t += 1;
        }
    }

    if use_u32 {
        MeshIndices::U32(lines)
    } else {
        MeshIndices::U16(lines.into_iter().map(|i| i as u16).collect())
    }
}

/// De-indexes (un-welds) the geometry into a flat non-indexed stream: each
/// triangle index expands into its own copy of the referenced vertex
/// record, so shared vertices become distinct. The result is a new
/// `MeshGeometry` with the same layout and topology, `indices` `None`, and a
/// single whole-range subset. This is the prerequisite for truly per-face
/// attributes (flat shading, per-face UVs) where shared vertices must not be
/// welded. Non-indexed geometry is deep-copied as-is.
pub fn expand_mesh_geometry_indices(geometry: &MeshGeometry) -> MeshGeometry {
    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    let source_vertices = &geometry.vertices;

    let vertices = match &geometry.indices {
        None => source_vertices.clone(),
        Some(indices) => {
            let index_count = match indices {
                MeshIndices::U16(v) => v.len(),
                MeshIndices::U32(v) => v.len(),
            };
            let mut vertices = vec![0.0f32; index_count * floats_per_vertex];
            for i in 0..index_count {
                let idx = match indices {
                    MeshIndices::U16(v) => v[i] as usize,
                    MeshIndices::U32(v) => v[i] as usize,
                };
                let src = idx * floats_per_vertex;
                let dst = i * floats_per_vertex;
                vertices[dst..dst + floats_per_vertex]
                    .copy_from_slice(&source_vertices[src..src + floats_per_vertex]);
            }
            vertices
        }
    };

    create_mesh_geometry(MeshGeometryOptions {
        indices: None,
        layout: geometry.layout.clone(),
        subsets: None,
        topology: Some(geometry.topology),
        vertices,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic};

    fn layout() -> VertexAttributeLayout {
        VertexAttributeLayout {
            stride: 12,
            attributes: vec![VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            }],
        }
    }

    fn make_quad() -> MeshGeometry {
        #[rustfmt::skip]
        let vertices = vec![
            0.0f32, 0.0, 0.0,
            1.0, 0.0, 0.0,
            1.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        create_mesh_geometry(MeshGeometryOptions {
            indices: Some(MeshIndices::U16(vec![0, 1, 2, 0, 2, 3])),
            layout: layout(),
            subsets: None,
            topology: None,
            vertices,
        })
    }

    mod compute_mesh_geometry_wireframe_indices {
        use super::*;

        #[test]
        fn expands_each_triangle_into_three_line_segments() {
            let geo = make_quad();
            let wire = compute_mesh_geometry_wireframe_indices(&geo);
            match wire {
                MeshIndices::U16(v) => assert_eq!(v.len(), 12),
                MeshIndices::U32(v) => assert_eq!(v.len(), 12),
            }
        }

        #[test]
        fn returns_empty_for_non_triangle_topology() {
            let mut geo = make_quad();
            geo.topology = PrimitiveTopology::LineList;
            let wire = compute_mesh_geometry_wireframe_indices(&geo);
            match wire {
                MeshIndices::U16(v) => assert!(v.is_empty()),
                MeshIndices::U32(v) => assert!(v.is_empty()),
            }
        }
    }

    mod expand_mesh_geometry_indices {
        use super::*;

        #[test]
        fn duplicates_vertices_per_triangle_and_clears_the_index_buffer() {
            let geo = make_quad();
            let expanded = expand_mesh_geometry_indices(&geo);
            assert!(expanded.indices.is_none());
            assert_eq!(expanded.vertices.len(), 6 * 3);
            assert_eq!(expanded.subsets.len(), 1);
            assert_eq!(expanded.subsets[0].index_count, 6);
        }

        #[test]
        fn deep_copies_non_indexed_geometry_as_is() {
            let geo = create_mesh_geometry(MeshGeometryOptions {
                indices: None,
                layout: layout(),
                subsets: None,
                topology: None,
                vertices: vec![1.0, 2.0, 3.0],
            });
            let expanded = expand_mesh_geometry_indices(&geo);
            assert_eq!(expanded.vertices, geo.vertices);
        }
    }
}
