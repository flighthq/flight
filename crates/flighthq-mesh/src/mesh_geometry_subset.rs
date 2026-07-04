//! Subset range management over a `MeshGeometry`'s index buffer.
//!
//! Ports `@flighthq/mesh` `meshGeometrySubset.ts`. A subset is a contiguous
//! draw range (`index_offset` + `index_count`) addressing one material
//! binding; a single-material geometry is one subset spanning the whole index
//! buffer. These functions read or replace the geometry's `subsets` list —
//! they never touch vertex or index data, so `version` is unchanged (a
//! re-upload is only needed when the buffers themselves change).
//! Out-of-range subset lookups return the sentinel 0.

use flighthq_types::{MeshGeometry, MeshSubset, PrimitiveTopology};

/// Appends a subset range to the geometry's subset list. The new subset is
/// added as-is; the caller owns choosing a non-overlapping range within the
/// index buffer.
pub fn add_mesh_geometry_subset(geometry: &mut MeshGeometry, subset: MeshSubset) {
    geometry.subsets.push(subset);
}

/// Returns the number of triangles a subset spans, derived from its
/// `index_count` and the geometry's topology: triangle-list yields
/// `floor(index_count / 3)`, triangle-strip yields `max(0, index_count - 2)`.
/// Non-triangle topologies and out-of-range subset indices return the
/// sentinel 0.
pub fn get_mesh_geometry_subset_triangle_count(geometry: &MeshGeometry, subset_index: u32) -> u32 {
    let subset = match geometry.subsets.get(subset_index as usize) {
        Some(subset) => subset,
        None => return 0,
    };
    match geometry.topology {
        PrimitiveTopology::TriangleList => subset.index_count / 3,
        PrimitiveTopology::TriangleStrip => {
            if subset.index_count >= 2 {
                subset.index_count - 2
            } else {
                0
            }
        }
        _ => 0,
    }
}

/// Replaces the geometry's entire subset list with a fresh copy of
/// `subsets`, leaving the vertex/index buffers untouched. Pass a single
/// whole-buffer subset to collapse back to one material binding.
pub fn set_mesh_geometry_subsets(geometry: &mut MeshGeometry, subsets: &[MeshSubset]) {
    geometry.subsets = subsets.to_vec();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};
    use flighthq_types::{
        MeshIndices, VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic,
    };

    fn make_geometry() -> MeshGeometry {
        let layout = VertexAttributeLayout {
            stride: 12,
            attributes: vec![VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            }],
        };
        create_mesh_geometry(MeshGeometryOptions {
            indices: Some(MeshIndices::U16(vec![0, 1, 2, 0, 2, 3])),
            layout,
            subsets: None,
            topology: None,
            vertices: vec![0.0f32; 4 * 3],
        })
    }

    mod add_mesh_geometry_subset {
        use super::*;

        #[test]
        fn appends_a_subset_to_the_list() {
            let mut geo = make_geometry();
            assert_eq!(geo.subsets.len(), 1);
            add_mesh_geometry_subset(
                &mut geo,
                MeshSubset {
                    index_count: 3,
                    index_offset: 3,
                },
            );
            assert_eq!(geo.subsets.len(), 2);
            assert_eq!(geo.subsets[1].index_offset, 3);
        }
    }

    mod get_mesh_geometry_subset_triangle_count {
        use super::*;

        #[test]
        fn returns_the_triangle_count_for_a_triangle_list_subset() {
            let geo = make_geometry();
            assert_eq!(get_mesh_geometry_subset_triangle_count(&geo, 0), 2);
        }

        #[test]
        fn returns_0_for_an_out_of_range_subset_index() {
            let geo = make_geometry();
            assert_eq!(get_mesh_geometry_subset_triangle_count(&geo, 5), 0);
        }
    }

    mod set_mesh_geometry_subsets {
        use super::*;

        #[test]
        fn replaces_the_subset_list() {
            let mut geo = make_geometry();
            set_mesh_geometry_subsets(
                &mut geo,
                &[
                    MeshSubset {
                        index_count: 3,
                        index_offset: 0,
                    },
                    MeshSubset {
                        index_count: 3,
                        index_offset: 3,
                    },
                ],
            );
            assert_eq!(geo.subsets.len(), 2);
        }
    }
}
