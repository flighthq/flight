//! Whole-geometry operations: build from raw attribute arrays, merge
//! multiple geometries, and validate structural invariants.
//!
//! Ports `@flighthq/mesh` `meshGeometryOperations.ts` (the triangle-count
//! query from that file already lives in `mesh_geometry_attributes.rs`).

use flighthq_types::{Aabb, MeshGeometry, MeshIndices, MeshSubset, VertexAttributeLayout};

use crate::mesh_geometry::{MeshGeometryOptions, UINT16_INDEX_CEILING, create_mesh_geometry};
use crate::mesh_geometry_compute::{
    compute_mesh_geometry_bounds, compute_mesh_geometry_normals, compute_mesh_geometry_tangents,
};
use crate::mesh_geometry_layout::canonical_mesh_geometry_layout;

const CANONICAL_FLOATS_PER_VERTEX: usize = 12;

/// Inputs to [`create_mesh_geometry_from_attributes`]. `positions` is a flat
/// xyz array (3 floats per vertex). `normals` (flat xyz) is optional — when
/// `None`, normals are computed from the faces. `uvs` (flat uv) is optional.
/// `indices` describes the triangle connectivity; `None` for non-indexed
/// geometry.
pub struct MeshGeometryFromAttributesOptions {
    pub indices: Option<Vec<u32>>,
    pub normals: Option<Vec<f32>>,
    pub positions: Vec<f32>,
    pub uvs: Option<Vec<f32>>,
}

/// Builds a `MeshGeometry` from separate position/normal/uv arrays using the
/// canonical 12-float PBR record (position + normal + tangent.w + uv0).
/// Normals are computed when omitted; tangents are always computed from the
/// UV gradient. Promotes indices to `u32` past 65535 vertices. This is the
/// public counterpart to the primitive builders' internal finalize path.
pub fn create_mesh_geometry_from_attributes(
    options: MeshGeometryFromAttributesOptions,
) -> MeshGeometry {
    let vertex_count = options.positions.len() / 3;
    let normals = &options.normals;
    let uvs = &options.uvs;
    let mut vertices = vec![0.0f32; vertex_count * CANONICAL_FLOATS_PER_VERTEX];
    for i in 0..vertex_count {
        let base = i * CANONICAL_FLOATS_PER_VERTEX;
        vertices[base] = options.positions[i * 3];
        vertices[base + 1] = options.positions[i * 3 + 1];
        vertices[base + 2] = options.positions[i * 3 + 2];
        if let Some(normals) = normals {
            vertices[base + 3] = normals[i * 3];
            vertices[base + 4] = normals[i * 3 + 1];
            vertices[base + 5] = normals[i * 3 + 2];
        }
        if let Some(uvs) = uvs {
            vertices[base + 10] = uvs[i * 2];
            vertices[base + 11] = uvs[i * 2 + 1];
        }
    }

    let index_array = options.indices.map(|src| {
        if vertex_count as u32 > UINT16_INDEX_CEILING {
            MeshIndices::U32(src)
        } else {
            MeshIndices::U16(src.into_iter().map(|i| i as u16).collect())
        }
    });

    let mut geometry = create_mesh_geometry(MeshGeometryOptions {
        indices: index_array,
        layout: canonical_mesh_geometry_layout(),
        subsets: None,
        topology: None,
        vertices,
    });
    if normals.is_none() {
        let source = geometry.clone();
        compute_mesh_geometry_normals(&mut geometry, &source);
    }
    let source = geometry.clone();
    compute_mesh_geometry_tangents(&mut geometry, &source);
    let mut bounds = Aabb::default();
    compute_mesh_geometry_bounds(&mut bounds, &geometry);
    geometry.bounds = Some(bounds);
    geometry
}

/// Concatenates multiple geometries into a single `MeshGeometry`. All source
/// geometries must share the same layout (matching stride and attribute
/// count, semantic, and format) — returns `None` on mismatch. Index buffers
/// are offset so each source's indices remain valid within the merged
/// vertex stream. Subsets are re-based so each source's draw ranges are
/// individually addressable. Bounds are recomputed. An empty slice returns
/// `None`.
pub fn merge_mesh_geometries(geometries: &[MeshGeometry]) -> Option<MeshGeometry> {
    let reference = geometries.first()?;
    let layout = &reference.layout;
    for geo in &geometries[1..] {
        if !layouts_match(layout, &geo.layout) {
            return None;
        }
    }

    let floats_per_vertex = (layout.stride / 4) as usize;
    let mut total_vertex_floats = 0usize;
    let mut total_index_count = 0usize;
    for geo in geometries {
        let vc = if floats_per_vertex > 0 {
            geo.vertices.len() / floats_per_vertex
        } else {
            0
        };
        total_vertex_floats += vc * floats_per_vertex;
        total_index_count += match &geo.indices {
            Some(MeshIndices::U16(v)) => v.len(),
            Some(MeshIndices::U32(v)) => v.len(),
            None => vc,
        };
    }

    let total_vertex_count = if floats_per_vertex > 0 {
        total_vertex_floats / floats_per_vertex
    } else {
        0
    };
    let needs_u32 = total_vertex_count as u32 > UINT16_INDEX_CEILING;

    let mut merged_vertices = vec![0.0f32; total_vertex_floats];
    let mut merged_indices_u32: Vec<u32> = Vec::with_capacity(total_index_count);
    let mut merged_subsets: Vec<MeshSubset> = Vec::new();

    let mut vertex_offset: u32 = 0;
    let mut index_offset: u32 = 0;
    let mut vertex_float_offset = 0usize;
    for geo in geometries {
        let vc = if floats_per_vertex > 0 {
            geo.vertices.len() / floats_per_vertex
        } else {
            0
        };
        let copy_len = vc * floats_per_vertex;
        merged_vertices[vertex_float_offset..vertex_float_offset + copy_len]
            .copy_from_slice(&geo.vertices[..copy_len]);

        let src_count = match &geo.indices {
            Some(MeshIndices::U16(v)) => v.len(),
            Some(MeshIndices::U32(v)) => v.len(),
            None => vc,
        };
        for j in 0..src_count {
            let src_idx: u32 = match &geo.indices {
                Some(MeshIndices::U16(v)) => v[j] as u32,
                Some(MeshIndices::U32(v)) => v[j],
                None => j as u32,
            };
            merged_indices_u32.push(src_idx + vertex_offset);
        }
        for subset in &geo.subsets {
            merged_subsets.push(MeshSubset {
                index_count: subset.index_count,
                index_offset: subset.index_offset + index_offset,
            });
        }
        index_offset += src_count as u32;
        vertex_offset += vc as u32;
        vertex_float_offset += copy_len;
    }

    if merged_subsets.is_empty() {
        merged_subsets.push(MeshSubset {
            index_count: if merged_indices_u32.is_empty() {
                total_vertex_count as u32
            } else {
                merged_indices_u32.len() as u32
            },
            index_offset: 0,
        });
    }

    let merged_indices = if needs_u32 {
        MeshIndices::U32(merged_indices_u32)
    } else {
        MeshIndices::U16(merged_indices_u32.into_iter().map(|i| i as u16).collect())
    };

    let mut merged = create_mesh_geometry(MeshGeometryOptions {
        indices: Some(merged_indices),
        layout: layout.clone(),
        subsets: Some(merged_subsets),
        topology: Some(reference.topology),
        vertices: merged_vertices,
    });
    let mut bounds = Aabb::default();
    compute_mesh_geometry_bounds(&mut bounds, &merged);
    merged.bounds = Some(bounds);
    Some(merged)
}

/// Validates a geometry for common structural errors. Returns `true` when
/// the geometry is valid. Returns `false` (does not panic) for: index
/// values out of vertex range, a vertex stream length not divisible by the
/// layout stride, and NaN or infinite values in position attributes.
pub fn validate_mesh_geometry(geometry: &MeshGeometry) -> bool {
    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    if floats_per_vertex == 0 {
        return false;
    }
    if geometry.vertices.len() % floats_per_vertex != 0 {
        return false;
    }
    let vertex_count = geometry.vertices.len() / floats_per_vertex;

    if let Some(indices) = &geometry.indices {
        let out_of_range = match indices {
            MeshIndices::U16(v) => v.iter().any(|&i| i as usize >= vertex_count),
            MeshIndices::U32(v) => v.iter().any(|&i| i as usize >= vertex_count),
        };
        if out_of_range {
            return false;
        }
    }

    let pos_offset = geometry
        .layout
        .attributes
        .iter()
        .find(|a| {
            a.semantic == flighthq_types::VertexSemantic::Position && is_float32_format(a.format)
        })
        .map(|a| (a.byte_offset / 4) as usize);

    if let Some(pos_offset) = pos_offset {
        for i in 0..vertex_count {
            let base = i * floats_per_vertex + pos_offset;
            let x = geometry.vertices[base];
            let y = geometry.vertices[base + 1];
            let z = geometry.vertices[base + 2];
            if !x.is_finite() || !y.is_finite() || !z.is_finite() {
                return false;
            }
        }
    }

    true
}

fn is_float32_format(format: flighthq_types::VertexFormat) -> bool {
    use flighthq_types::VertexFormat;
    matches!(
        format,
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4
    )
}

/// Checks whether two `VertexAttributeLayout`s are compatible for merging:
/// same stride and the same attributes in the same order (same semantic,
/// format, and byte offset).
fn layouts_match(a: &VertexAttributeLayout, b: &VertexAttributeLayout) -> bool {
    if a.stride != b.stride {
        return false;
    }
    if a.attributes.len() != b.attributes.len() {
        return false;
    }
    a.attributes
        .iter()
        .zip(b.attributes.iter())
        .all(|(aa, ba)| {
            aa.semantic == ba.semantic && aa.format == ba.format && aa.byte_offset == ba.byte_offset
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{VertexAttribute, VertexFormat, VertexSemantic};

    fn make_triangle_geometry() -> MeshGeometry {
        create_mesh_geometry_from_attributes(MeshGeometryFromAttributesOptions {
            indices: Some(vec![0, 1, 2]),
            normals: None,
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            uvs: Some(vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0]),
        })
    }

    mod create_mesh_geometry_from_attributes {
        use super::*;

        #[test]
        fn builds_the_canonical_layout_and_computes_normals_and_tangents() {
            let geo = make_triangle_geometry();
            assert_eq!(geo.layout.stride, 48);
            // Computed face normal is +Z for a CCW XY triangle.
            assert!((geo.vertices[5] - 1.0).abs() < 1e-5);
            assert!(geo.bounds.is_some());
        }

        #[test]
        fn keeps_provided_normals_instead_of_computing_them() {
            let geo = create_mesh_geometry_from_attributes(MeshGeometryFromAttributesOptions {
                indices: None,
                normals: Some(vec![0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0]),
                positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                uvs: None,
            });
            assert_eq!(geo.vertices[5], -1.0);
        }
    }

    mod merge_mesh_geometries {
        use super::*;

        #[test]
        fn concatenates_vertices_and_rebases_indices() {
            let a = make_triangle_geometry();
            let b = make_triangle_geometry();
            let merged = merge_mesh_geometries(&[a, b]).unwrap();
            assert_eq!(merged.subsets.len(), 2);
            assert_eq!(merged.subsets[1].index_offset, 3);
            match &merged.indices {
                Some(MeshIndices::U16(v)) => assert_eq!(v[3], 3),
                Some(MeshIndices::U32(v)) => assert_eq!(v[3], 3),
                None => panic!("expected indices"),
            }
        }

        #[test]
        fn returns_none_for_an_empty_input() {
            assert!(merge_mesh_geometries(&[]).is_none());
        }

        #[test]
        fn returns_none_when_layouts_do_not_match() {
            let a = make_triangle_geometry();
            let mismatched_layout = VertexAttributeLayout {
                attributes: vec![VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                }],
                stride: 12,
            };
            let b = create_mesh_geometry(MeshGeometryOptions {
                indices: None,
                layout: mismatched_layout,
                subsets: None,
                topology: None,
                vertices: vec![0.0; 3],
            });
            assert!(merge_mesh_geometries(&[a, b]).is_none());
        }
    }

    mod validate_mesh_geometry {
        use super::*;

        #[test]
        fn accepts_a_well_formed_geometry() {
            let geo = make_triangle_geometry();
            assert!(validate_mesh_geometry(&geo));
        }

        #[test]
        fn rejects_out_of_range_indices() {
            let mut geo = make_triangle_geometry();
            geo.indices = Some(MeshIndices::U16(vec![0, 1, 99]));
            assert!(!validate_mesh_geometry(&geo));
        }

        #[test]
        fn rejects_non_finite_positions() {
            let mut geo = make_triangle_geometry();
            geo.vertices[0] = f32::NAN;
            assert!(!validate_mesh_geometry(&geo));
        }
    }
}
