//! Attribute introspection and typed per-vertex read/write accessors for
//! interleaved mesh geometry.
//!
//! Ports `@flighthq/mesh` `meshGeometryAttributes.ts`, plus the triangle-count
//! query from `meshGeometryOperations.ts`. Every accessor resolves float
//! offsets through [`get_vertex_attribute_float_offset`], so they work on any
//! layout, not just the canonical PBR record. `set_*` functions bump
//! `geometry.version` so backends know to re-upload.

use flighthq_types::{
    MeshGeometry, MeshIndices, PrimitiveTopology, Vector2Like, Vector3Like, Vector4Like,
    VertexAttribute, VertexAttributeLayout, VertexSemantic,
};

use crate::mesh_geometry::vertex_count_from_layout;

/// Returns the number of triangles in a `MeshGeometry`.
///
/// For `triangle-list` topology, this is `floor(indexCount / 3)`.
/// For `triangle-strip`, this is `max(0, indexCount - 2)`.
/// Other topologies return 0.
pub fn get_mesh_geometry_triangle_count(geometry: &MeshGeometry) -> u32 {
    let index_count = match &geometry.indices {
        Some(MeshIndices::U16(v)) => v.len() as u32,
        Some(MeshIndices::U32(v)) => v.len() as u32,
        None => vertex_count_from_layout(&geometry.vertices, &geometry.layout),
    };
    match geometry.topology {
        PrimitiveTopology::TriangleList => index_count / 3,
        PrimitiveTopology::TriangleStrip if index_count >= 3 => index_count - 2,
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

/// Reads the normal (x, y, z) of vertex `vertex_index` into `out`. Returns
/// `false` when the layout has no normal semantic or `vertex_index` is out of
/// range; `out` is unchanged.
pub fn get_mesh_geometry_vertex_normal(
    out: &mut Vector3Like,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    get_float3_attribute(out, geometry, vertex_index, VertexSemantic::Normal)
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
    get_float3_attribute(out, geometry, vertex_index, VertexSemantic::Position)
}

/// Reads the tangent (x, y, z, w) of vertex `vertex_index` into `out`.
/// Returns `false` when the layout has no tangent semantic or `vertex_index`
/// is out of range; `out` is unchanged.
pub fn get_mesh_geometry_vertex_tangent(
    out: &mut Vector4Like,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    let float_offset =
        match get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Tangent) {
            Some(off) => off,
            None => return false,
        };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset) as usize;
    let verts = &geometry.vertices;
    out.x = verts[base];
    out.y = verts[base + 1];
    out.z = verts[base + 2];
    out.w = verts[base + 3];
    true
}

/// Reads the uv0 (u, v) of vertex `vertex_index` into `out`. Returns `false`
/// when the layout has no uv0 semantic or `vertex_index` is out of range;
/// `out` is unchanged.
pub fn get_mesh_geometry_vertex_uv0(
    out: &mut Vector2Like,
    geometry: &MeshGeometry,
    vertex_index: u32,
) -> bool {
    let float_offset =
        match get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Uv0) {
            Some(off) => off,
            None => return false,
        };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset) as usize;
    let verts = &geometry.vertices;
    out.x = verts[base];
    out.y = verts[base + 1];
    true
}

/// Returns a copy of the `VertexAttribute` for the given semantic from the
/// layout, or `None` if absent.
pub fn get_vertex_attribute(
    layout: &VertexAttributeLayout,
    semantic: VertexSemantic,
) -> Option<VertexAttribute> {
    layout
        .attributes
        .iter()
        .find(|a| a.semantic == semantic)
        .copied()
}

/// Returns the float index (`byte_offset / 4`) within one vertex record for
/// the given semantic, or `None` when the semantic is absent from the layout
/// or has a non-float format. Only float32* formats (4-byte aligned) are
/// supported by the typed accessors.
pub fn get_vertex_attribute_float_offset(
    layout: &VertexAttributeLayout,
    semantic: VertexSemantic,
) -> Option<u32> {
    let attr = layout.attributes.iter().find(|a| a.semantic == semantic)?;
    if !is_float32_format(attr.format) {
        return None;
    }
    Some(attr.byte_offset / 4)
}

/// Writes the normal (x, y, z) for vertex `vertex_index`. Bumps
/// `geometry.version`. Returns `false` when the layout has no normal semantic
/// or `vertex_index` is out of range; `geometry` is unchanged.
pub fn set_mesh_geometry_vertex_normal(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    set_float3_attribute(geometry, vertex_index, VertexSemantic::Normal, x, y, z)
}

/// Writes the position (x, y, z) for vertex `vertex_index`. Bumps
/// `geometry.version`. Returns `false` when the layout has no position
/// semantic or `vertex_index` is out of range; `geometry` is unchanged.
pub fn set_mesh_geometry_vertex_position(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    set_float3_attribute(geometry, vertex_index, VertexSemantic::Position, x, y, z)
}

/// Writes the tangent (x, y, z, w) for vertex `vertex_index`. Bumps
/// `geometry.version`. Returns `false` when the layout has no tangent
/// semantic or `vertex_index` is out of range.
pub fn set_mesh_geometry_vertex_tangent(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    x: f32,
    y: f32,
    z: f32,
    w: f32,
) -> bool {
    let float_offset =
        match get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Tangent) {
            Some(off) => off,
            None => return false,
        };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset) as usize;
    geometry.vertices[base] = x;
    geometry.vertices[base + 1] = y;
    geometry.vertices[base + 2] = z;
    geometry.vertices[base + 3] = w;
    geometry.version += 1;
    true
}

/// Writes the uv0 (u, v) for vertex `vertex_index`. Bumps `geometry.version`.
/// Returns `false` when the layout has no uv0 semantic or `vertex_index` is
/// out of range.
pub fn set_mesh_geometry_vertex_uv0(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    u: f32,
    v: f32,
) -> bool {
    let float_offset =
        match get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Uv0) {
            Some(off) => off,
            None => return false,
        };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset) as usize;
    geometry.vertices[base] = u;
    geometry.vertices[base + 1] = v;
    geometry.version += 1;
    true
}

fn get_float3_attribute(
    out: &mut Vector3Like,
    geometry: &MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
) -> bool {
    let float_offset = match get_vertex_attribute_float_offset(&geometry.layout, semantic) {
        Some(off) => off,
        None => return false,
    };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
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

fn is_float32_format(format: flighthq_types::VertexFormat) -> bool {
    use flighthq_types::VertexFormat;
    matches!(
        format,
        VertexFormat::Float32x2 | VertexFormat::Float32x3 | VertexFormat::Float32x4
    )
}

fn set_float3_attribute(
    geometry: &mut MeshGeometry,
    vertex_index: u32,
    semantic: VertexSemantic,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    let float_offset = match get_vertex_attribute_float_offset(&geometry.layout, semantic) {
        Some(off) => off,
        None => return false,
    };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    if vertex_index >= vertex_count {
        return false;
    }
    let base = (vertex_index * floats_per_vertex + float_offset) as usize;
    geometry.vertices[base] = x;
    geometry.vertices[base + 1] = y;
    geometry.vertices[base + 2] = z;
    geometry.version += 1;
    true
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};
    use flighthq_types::{VertexAttribute, VertexAttributeLayout, VertexFormat};

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

    fn make_canonical_geometry() -> MeshGeometry {
        let vertices = vec![0.0f32; 12];
        create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            subsets: None,
            topology: None,
            vertices,
        })
    }

    mod get_mesh_geometry_index {
        use super::*;

        #[test]
        fn returns_the_vertex_index_as_is_when_non_indexed() {
            let geo = make_triangle_geometry();
            assert_eq!(get_mesh_geometry_index(&geo, 2), Some(2));
        }
    }

    mod get_mesh_geometry_triangle_count {
        use super::*;

        #[test]
        fn triangle_list_no_indices() {
            let geo = make_triangle_geometry();
            assert_eq!(get_mesh_geometry_triangle_count(&geo), 1);
        }

        #[test]
        fn triangle_strip() {
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
    }

    mod get_mesh_geometry_vertex_normal {
        use super::*;

        #[test]
        fn reads_the_normal_at_the_given_vertex() {
            let mut geo = make_canonical_geometry();
            geo.vertices[3] = 0.0;
            geo.vertices[4] = 1.0;
            geo.vertices[5] = 0.0;
            let mut out = Vector3Like::default();
            assert!(get_mesh_geometry_vertex_normal(&mut out, &geo, 0));
            assert_eq!(out.y, 1.0);
        }

        #[test]
        fn returns_false_when_the_layout_has_no_normal() {
            let geo = make_triangle_geometry();
            let mut out = Vector3Like::default();
            assert!(!get_mesh_geometry_vertex_normal(&mut out, &geo, 0));
        }
    }

    mod get_mesh_geometry_vertex_position {
        use super::*;

        #[test]
        fn reads_correct_vertex() {
            let geo = make_triangle_geometry();
            let mut out = Vector3Like::default();
            assert!(get_mesh_geometry_vertex_position(&mut out, &geo, 1));
            assert!((out.x - 1.0).abs() < 1e-6);
            assert!((out.y).abs() < 1e-6);
            assert!((out.z).abs() < 1e-6);
        }

        #[test]
        fn out_of_range_returns_false() {
            let geo = make_triangle_geometry();
            let mut out = Vector3Like::default();
            assert!(!get_mesh_geometry_vertex_position(&mut out, &geo, 10));
        }
    }

    mod get_mesh_geometry_vertex_tangent {
        use super::*;

        #[test]
        fn reads_the_tangent_with_w_handedness() {
            let mut geo = make_canonical_geometry();
            geo.vertices[6] = 1.0;
            geo.vertices[9] = -1.0;
            let mut out = Vector4Like::default();
            assert!(get_mesh_geometry_vertex_tangent(&mut out, &geo, 0));
            assert_eq!(out.x, 1.0);
            assert_eq!(out.w, -1.0);
        }

        #[test]
        fn returns_false_when_absent() {
            let geo = make_triangle_geometry();
            let mut out = Vector4Like::default();
            assert!(!get_mesh_geometry_vertex_tangent(&mut out, &geo, 0));
        }
    }

    mod get_mesh_geometry_vertex_uv0 {
        use super::*;

        #[test]
        fn reads_uv_coordinates() {
            let mut geo = make_canonical_geometry();
            geo.vertices[10] = 0.25;
            geo.vertices[11] = 0.75;
            let mut out = Vector2Like::default();
            assert!(get_mesh_geometry_vertex_uv0(&mut out, &geo, 0));
            assert_eq!(out.x, 0.25);
            assert_eq!(out.y, 0.75);
        }

        #[test]
        fn returns_false_when_absent() {
            let geo = make_triangle_geometry();
            let mut out = Vector2Like::default();
            assert!(!get_mesh_geometry_vertex_uv0(&mut out, &geo, 0));
        }
    }

    mod get_vertex_attribute {
        use super::*;

        #[test]
        fn finds_the_attribute_with_a_matching_semantic() {
            let layout = canonical_layout();
            let attr = get_vertex_attribute(&layout, VertexSemantic::Tangent).unwrap();
            assert_eq!(attr.byte_offset, 24);
        }

        #[test]
        fn returns_none_when_absent() {
            let layout = canonical_layout();
            assert!(get_vertex_attribute(&layout, VertexSemantic::Color0).is_none());
        }
    }

    mod get_vertex_attribute_float_offset {
        use super::*;

        #[test]
        fn returns_the_float_offset_for_a_present_semantic() {
            let layout = canonical_layout();
            assert_eq!(
                get_vertex_attribute_float_offset(&layout, VertexSemantic::Uv0),
                Some(10)
            );
        }

        #[test]
        fn returns_none_for_an_absent_semantic() {
            let layout = canonical_layout();
            assert_eq!(
                get_vertex_attribute_float_offset(&layout, VertexSemantic::Color0),
                None
            );
        }
    }

    mod set_mesh_geometry_vertex_normal {
        use super::*;

        #[test]
        fn writes_the_normal_and_bumps_version() {
            let mut geo = make_canonical_geometry();
            assert!(set_mesh_geometry_vertex_normal(&mut geo, 0, 0.0, 1.0, 0.0));
            assert_eq!(geo.vertices[4], 1.0);
            assert_eq!(geo.version, 1);
        }
    }

    mod set_mesh_geometry_vertex_position {
        use super::*;

        #[test]
        fn writes_the_position_and_bumps_version() {
            let mut geo = make_triangle_geometry();
            assert!(set_mesh_geometry_vertex_position(
                &mut geo, 0, 5.0, 6.0, 7.0
            ));
            assert_eq!(geo.vertices[0], 5.0);
            assert_eq!(geo.version, 1);
        }

        #[test]
        fn out_of_range_returns_false_and_leaves_geometry_unchanged() {
            let mut geo = make_triangle_geometry();
            assert!(!set_mesh_geometry_vertex_position(
                &mut geo, 99, 5.0, 6.0, 7.0
            ));
            assert_eq!(geo.version, 0);
        }
    }

    mod set_mesh_geometry_vertex_tangent {
        use super::*;

        #[test]
        fn writes_the_tangent_with_handedness_and_bumps_version() {
            let mut geo = make_canonical_geometry();
            assert!(set_mesh_geometry_vertex_tangent(
                &mut geo, 0, 1.0, 0.0, 0.0, -1.0
            ));
            assert_eq!(geo.vertices[9], -1.0);
            assert_eq!(geo.version, 1);
        }
    }

    mod set_mesh_geometry_vertex_uv0 {
        use super::*;

        #[test]
        fn writes_uv_coordinates_and_bumps_version() {
            let mut geo = make_canonical_geometry();
            assert!(set_mesh_geometry_vertex_uv0(&mut geo, 0, 0.5, 0.5));
            assert_eq!(geo.vertices[10], 0.5);
            assert_eq!(geo.version, 1);
        }
    }
}
