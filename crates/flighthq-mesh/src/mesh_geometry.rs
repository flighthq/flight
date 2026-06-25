//! `MeshGeometry` constructors, GPU-data teardown, and accessors.
//!
//! Ports `@flighthq/mesh` `meshGeometry.ts`.
//!
//! TS↔Rust divergence: in TS the `MeshGeometryRuntime` (the GPU upload slots) is
//! attached to the entity through `EntityRuntimeKey`, so `createMeshGeometry`
//! returns a geometry that already carries a runtime and the `destroy*` helpers
//! read the runtime off the entity. The Rust header keeps `MeshGeometry` (plain
//! data) and `MeshGeometryRuntime` (GPU slots) as separate structs, so
//! `create_mesh_geometry` returns only the geometry and the `destroy*` helpers
//! take `&mut MeshGeometryRuntime` directly — the slot owner the scene renderer
//! holds. // TODO(align): revisit if the header grows an entity-owned runtime.

use flighthq_types::{
    KindId, MeshGeometry, MeshGeometryRuntime, MeshIndices, MeshSubset, PrimitiveTopology,
    VertexAttributeLayout,
};

/// Marker type whose `TypeId` backs the stable mesh [`KindId`]. The kind is
/// defined here, at the crate that constructs the entity (per the kind rule).
pub struct MeshGeometryKindId;

/// Inputs to [`create_mesh_geometry`]. `vertices` is the raw interleaved record
/// stream read through `layout`; `indices` is `None` for non-indexed geometry.
/// `subsets` defaults to a single subset spanning the whole index (or vertex)
/// range. `topology` defaults to triangle-list. `bounds` is left `None` until
/// computed.
pub struct MeshGeometryOptions {
    pub indices: Option<MeshIndices>,
    pub layout: VertexAttributeLayout,
    pub subsets: Option<Vec<MeshSubset>>,
    pub topology: Option<PrimitiveTopology>,
    pub vertices: Vec<f32>,
}

/// Returns the stable [`KindId`] for mesh leaf nodes.
pub fn get_mesh_kind() -> KindId {
    KindId::of::<MeshGeometryKindId>()
}

/// Deep-copies a `MeshGeometry`: fresh vertex/index buffers, a cloned bounds (or
/// `None`), and a fresh subset list mirroring the source. `version` resets to 0
/// (a fresh upload target); GPU runtime slots are never carried (they live on a
/// separate `MeshGeometryRuntime`).
pub fn clone_mesh_geometry(source: &MeshGeometry) -> MeshGeometry {
    MeshGeometry {
        bounds: source.bounds,
        indices: source.indices.clone(),
        layout: source.layout.clone(),
        subsets: source.subsets.clone(),
        topology: source.topology,
        version: 0,
        vertices: source.vertices.clone(),
    }
}

/// Allocates a `MeshGeometry` from CPU vertex/index data plus a layout. Indices,
/// when present, are promoted to `u32` automatically once the vertex count
/// derived from the layout stride passes the `u16` ceiling so a 16-bit index
/// buffer is never silently truncated.
pub fn create_mesh_geometry(options: MeshGeometryOptions) -> MeshGeometry {
    let vertex_count = vertex_count_from_layout(&options.vertices, &options.layout);

    let indices = options
        .indices
        .map(|source| promote_indices(source, vertex_count));

    let subsets = options.subsets.unwrap_or_else(|| {
        let count = match &indices {
            Some(MeshIndices::U16(v)) => v.len() as u32,
            Some(MeshIndices::U32(v)) => v.len() as u32,
            None => vertex_count,
        };
        vec![MeshSubset {
            index_count: count,
            index_offset: 0,
        }]
    });

    MeshGeometry {
        bounds: None,
        indices,
        layout: options.layout,
        subsets,
        topology: options.topology.unwrap_or_default(),
        version: 0,
        vertices: options.vertices,
    }
}

/// Releases the Gl GPU upload slot on a geometry's runtime back to `None`. The
/// actual GL objects (VAO/buffers) are owned and freed by `scene-gl`; this clears
/// the named slot so the next draw re-uploads. Frees a non-GC GPU resource, hence
/// `destroy_*`, not `dispose_*`.
pub fn destroy_mesh_geometry_gl_data(runtime: &mut MeshGeometryRuntime) {
    runtime.webgl_data = None;
}

/// Releases the Wgpu GPU upload slot on a geometry's runtime back to `None`. The
/// vertex/index `GPUBuffer`s are owned and freed by `scene-wgpu`; this clears the
/// named slot so the next draw re-uploads. Frees a non-GC GPU resource, hence
/// `destroy_*`, not `dispose_*`.
pub fn destroy_mesh_geometry_wgpu_data(runtime: &mut MeshGeometryRuntime) {
    runtime.webgpu_data = None;
}

/// Number of indices in the geometry's index buffer, or 0 for non-indexed
/// geometry.
pub fn get_mesh_geometry_index_count(geometry: &MeshGeometry) -> u32 {
    match &geometry.indices {
        Some(MeshIndices::U16(v)) => v.len() as u32,
        Some(MeshIndices::U32(v)) => v.len() as u32,
        None => 0,
    }
}

/// Number of vertices, derived from the interleaved vertex stream and the layout
/// stride (stride is in bytes; a Float32 is 4 bytes).
pub fn get_mesh_geometry_vertex_count(geometry: &MeshGeometry) -> u32 {
    vertex_count_from_layout(&geometry.vertices, &geometry.layout)
}

fn vertex_count_from_layout(vertices: &[f32], layout: &VertexAttributeLayout) -> u32 {
    let floats_per_vertex = layout.stride / 4;
    if floats_per_vertex == 0 {
        return 0;
    }
    vertices.len() as u32 / floats_per_vertex
}

/// Copies an index source into the narrowest index type that addresses
/// `vertex_count` vertices, promoting to `u32` once the count exceeds the `u16`
/// ceiling so high indices never truncate.
fn promote_indices(source: MeshIndices, vertex_count: u32) -> MeshIndices {
    match source {
        MeshIndices::U32(v) => MeshIndices::U32(v),
        MeshIndices::U16(v) => {
            if vertex_count > UINT16_INDEX_CEILING {
                MeshIndices::U32(v.into_iter().map(u32::from).collect())
            } else {
                MeshIndices::U16(v)
            }
        }
    }
}

const UINT16_INDEX_CEILING: u32 = 65535;

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{
        Aabb, EntityRuntime, Vector3, VertexAttribute, VertexFormat, VertexSemantic,
    };

    fn canonical_layout() -> VertexAttributeLayout {
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

    fn make_vertices(count: usize) -> Vec<f32> {
        vec![0.0; count * 12]
    }

    mod clone_mesh_geometry {
        use super::*;

        #[test]
        fn deep_copies_vertices_and_indices_independently() {
            let mut vertices = make_vertices(3);
            vertices[0] = 7.0;
            let source = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(MeshIndices::U16(vec![0, 1, 2])),
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices,
            });

            let mut clone = clone_mesh_geometry(&source);
            assert_eq!(clone.vertices[0], 7.0);
            assert!(clone.indices.is_some());

            clone.vertices[0] = 99.0;
            assert_eq!(source.vertices[0], 7.0);
        }

        #[test]
        fn resets_the_upload_version() {
            let mut source = create_mesh_geometry(MeshGeometryOptions {
                indices: None,
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(1),
            });
            source.version = 5;
            let clone = clone_mesh_geometry(&source);
            assert_eq!(clone.version, 0);
        }

        #[test]
        fn clones_bounds_when_present_without_sharing() {
            let mut source = create_mesh_geometry(MeshGeometryOptions {
                indices: None,
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(1),
            });
            source.bounds = Some(Aabb {
                min: Vector3 {
                    x: -1.0,
                    y: -1.0,
                    z: -1.0,
                },
                max: Vector3 {
                    x: 1.0,
                    y: 1.0,
                    z: 1.0,
                },
            });
            let clone = clone_mesh_geometry(&source);
            let bounds = clone.bounds.unwrap();
            assert_eq!(bounds.min.x, -1.0);
            assert_eq!(bounds.max.z, 1.0);
        }
    }

    mod create_mesh_geometry {
        use super::*;

        #[test]
        fn defaults_topology_to_triangle_list_and_a_single_full_subset() {
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(MeshIndices::U16(vec![0, 1, 2])),
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(3),
            });
            assert_eq!(geometry.topology, PrimitiveTopology::TriangleList);
            assert_eq!(geometry.subsets.len(), 1);
            assert_eq!(
                geometry.subsets[0],
                MeshSubset {
                    index_count: 3,
                    index_offset: 0,
                }
            );
        }

        #[test]
        fn keeps_u16_indices_below_the_ceiling() {
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(MeshIndices::U16(vec![0, 1, 2])),
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(3),
            });
            assert!(matches!(geometry.indices, Some(MeshIndices::U16(_))));
        }

        #[test]
        fn auto_promotes_indices_to_u32_past_65535_vertices() {
            let vertex_count = 70000;
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(MeshIndices::U16(vec![0, 1, 2])),
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(vertex_count),
            });
            assert!(matches!(geometry.indices, Some(MeshIndices::U32(_))));
            assert_eq!(
                get_mesh_geometry_vertex_count(&geometry),
                vertex_count as u32
            );
        }

        #[test]
        fn keeps_already_u32_indices_as_u32() {
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(MeshIndices::U32(vec![0, 1, 2])),
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(3),
            });
            assert!(matches!(geometry.indices, Some(MeshIndices::U32(_))));
        }

        #[test]
        fn allows_non_indexed_geometry_with_a_vertex_count_subset() {
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: None,
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(6),
            });
            assert!(geometry.indices.is_none());
            assert_eq!(geometry.subsets[0].index_count, 6);
        }

        #[test]
        fn initializes_null_gpu_upload_slots_on_the_runtime() {
            let runtime = MeshGeometryRuntime::default();
            assert!(runtime.webgl_data.is_none());
            assert!(runtime.webgpu_data.is_none());
            assert!(runtime.binding().is_none());
        }
    }

    mod destroy_mesh_geometry_gl_data {
        use super::*;

        #[derive(Debug)]
        struct FakeGlData;
        impl flighthq_types::MeshGeometryGlData for FakeGlData {}

        #[test]
        fn clears_the_webgl_upload_slot() {
            let mut runtime = MeshGeometryRuntime {
                webgl_data: Some(Box::new(FakeGlData)),
                ..Default::default()
            };
            destroy_mesh_geometry_gl_data(&mut runtime);
            assert!(runtime.webgl_data.is_none());
        }
    }

    mod destroy_mesh_geometry_wgpu_data {
        use super::*;

        #[derive(Debug)]
        struct FakeWgpuData;
        impl flighthq_types::MeshGeometryWgpuData for FakeWgpuData {}

        #[test]
        fn clears_the_webgpu_upload_slot() {
            let mut runtime = MeshGeometryRuntime {
                webgpu_data: Some(Box::new(FakeWgpuData)),
                ..Default::default()
            };
            destroy_mesh_geometry_wgpu_data(&mut runtime);
            assert!(runtime.webgpu_data.is_none());
        }
    }

    mod get_mesh_geometry_index_count {
        use super::*;

        #[test]
        fn returns_the_index_length() {
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(MeshIndices::U16(vec![0, 1, 2, 0, 2, 3])),
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(4),
            });
            assert_eq!(get_mesh_geometry_index_count(&geometry), 6);
        }

        #[test]
        fn returns_0_for_non_indexed_geometry() {
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: None,
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(3),
            });
            assert_eq!(get_mesh_geometry_index_count(&geometry), 0);
        }
    }

    mod get_mesh_geometry_vertex_count {
        use super::*;

        #[test]
        fn derives_the_vertex_count_from_stride() {
            let geometry = create_mesh_geometry(MeshGeometryOptions {
                indices: None,
                layout: canonical_layout(),
                subsets: None,
                topology: None,
                vertices: make_vertices(5),
            });
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), 5);
        }
    }
}
