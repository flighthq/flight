//! Vertex layout conversion and the canonical PBR vertex layout constant.
//!
//! Ports `@flighthq/mesh` `meshGeometryLayout.ts`.

use flighthq_types::{
    MeshGeometry, VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic,
};

use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};

/// The canonical interleaved PBR vertex layout used by every built-in
/// primitive builder: `position(3) + normal(3) + tangent(4, w = glTF
/// handedness) + uv0(2) = 12 floats / 48 bytes`. Pass this to
/// [`crate::create_mesh_geometry_from_attributes`] or `create_mesh_geometry`
/// when building geometry that should match the layout of the built-in
/// primitives.
pub fn canonical_mesh_geometry_layout() -> VertexAttributeLayout {
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

/// Re-packs a geometry's interleaved vertex stream into a new layout.
/// Attributes present in both the source layout and `target_layout` are
/// copied by semantic into the corresponding slot of the new stream.
/// Attributes in `target_layout` that are absent in the source are
/// zero-filled. Attributes in the source that are absent in `target_layout`
/// are silently dropped. Only float32* attributes (4 bytes per component)
/// are copied; other formats are not yet supported and are zero-filled in
/// the target.
///
/// Returns a new `MeshGeometry` with the same index buffer, topology, and
/// subsets as `source`. `version` resets to 0. Bounds are left `None`
/// (caller should recompute if needed). The source geometry is not modified.
pub fn convert_mesh_geometry_layout(
    source: &MeshGeometry,
    target_layout: &VertexAttributeLayout,
) -> MeshGeometry {
    let src_stride = source.layout.stride;
    let dst_stride = target_layout.stride;
    let src_floats_per_vertex = (src_stride / 4) as usize;
    let dst_floats_per_vertex = (dst_stride / 4) as usize;
    let vertex_count = if src_floats_per_vertex > 0 {
        source.vertices.len() / src_floats_per_vertex
    } else {
        0
    };
    let mut dst_vertices = vec![0.0f32; vertex_count * dst_floats_per_vertex];
    let src_verts = &source.vertices;

    // Build a mapping from each target attribute to its source float offset.
    // Only float32* formats are handled; non-float32 target attributes stay
    // zero.
    struct Mapping {
        component_count: usize,
        dst_float_offset: usize,
        src_float_offset: usize,
    }
    let mut mapping: Vec<Mapping> = Vec::new();
    for dst_attr in &target_layout.attributes {
        let component_count = get_float32_component_count(dst_attr.format);
        if component_count == 0 {
            continue;
        }
        let dst_float_offset = (dst_attr.byte_offset / 4) as usize;
        let src_attr =
            source.layout.attributes.iter().find(|a| {
                a.semantic == dst_attr.semantic && get_float32_component_count(a.format) > 0
            });
        let src_attr = match src_attr {
            Some(attr) => attr,
            None => continue,
        };
        mapping.push(Mapping {
            component_count,
            dst_float_offset,
            src_float_offset: (src_attr.byte_offset / 4) as usize,
        });
    }

    for i in 0..vertex_count {
        let src_base = i * src_floats_per_vertex;
        let dst_base = i * dst_floats_per_vertex;
        for m in &mapping {
            for c in 0..m.component_count {
                dst_vertices[dst_base + m.dst_float_offset + c] =
                    src_verts[src_base + m.src_float_offset + c];
            }
        }
    }

    create_mesh_geometry(MeshGeometryOptions {
        indices: source.indices.clone(),
        layout: target_layout.clone(),
        subsets: Some(source.subsets.clone()),
        topology: Some(source.topology),
        vertices: dst_vertices,
    })
}

/// Returns the number of float32 components for a float32* `VertexFormat`
/// (e.g. `Float32x3` -> 3). Returns 0 for unrecognized (non-float32) formats.
fn get_float32_component_count(format: VertexFormat) -> usize {
    match format {
        VertexFormat::Float32x2 => 2,
        VertexFormat::Float32x3 => 3,
        VertexFormat::Float32x4 => 4,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::MeshIndices;

    fn source_layout() -> VertexAttributeLayout {
        VertexAttributeLayout {
            attributes: vec![
                VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                },
                VertexAttribute {
                    byte_offset: 12,
                    format: VertexFormat::Float32x2,
                    semantic: VertexSemantic::Uv0,
                },
            ],
            stride: 20,
        }
    }

    mod canonical_mesh_geometry_layout {
        use super::*;

        #[test]
        fn returns_the_48_byte_pbr_layout() {
            let layout = canonical_mesh_geometry_layout();
            assert_eq!(layout.stride, 48);
            assert_eq!(layout.attributes.len(), 4);
        }
    }

    mod convert_mesh_geometry_layout {
        use super::*;

        #[test]
        fn copies_matching_semantics_and_zero_fills_the_rest() {
            let source = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(MeshIndices::U16(vec![0, 1, 2])),
                layout: source_layout(),
                subsets: None,
                topology: None,
                vertices: vec![
                    1.0, 2.0, 3.0, 0.5, 0.25, 4.0, 5.0, 6.0, 0.75, 0.1, 7.0, 8.0, 9.0, 0.0, 0.0,
                ],
            });
            let target = canonical_mesh_geometry_layout();
            let converted = convert_mesh_geometry_layout(&source, &target);
            assert_eq!(converted.layout.stride, 48);
            // Position copied into the new stride-48 record.
            assert_eq!(converted.vertices[0], 1.0);
            assert_eq!(converted.vertices[1], 2.0);
            assert_eq!(converted.vertices[2], 3.0);
            // Normal (absent in source) is zero-filled.
            assert_eq!(converted.vertices[3], 0.0);
            // Uv0 copied at its new float offset (byte offset 40 / 4 = float 10).
            assert_eq!(converted.vertices[10], 0.5);
            assert_eq!(converted.vertices[11], 0.25);
            assert_eq!(converted.version, 0);
            assert!(converted.bounds.is_none());
        }

        #[test]
        fn preserves_indices_topology_and_subsets_from_the_source() {
            let source = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(MeshIndices::U16(vec![0, 1, 2])),
                layout: source_layout(),
                subsets: None,
                topology: None,
                vertices: vec![0.0; 10],
            });
            let target = canonical_mesh_geometry_layout();
            let converted = convert_mesh_geometry_layout(&source, &target);
            assert!(converted.indices.is_some());
            assert_eq!(converted.subsets, source.subsets);
            assert_eq!(converted.topology, source.topology);
        }
    }
}
