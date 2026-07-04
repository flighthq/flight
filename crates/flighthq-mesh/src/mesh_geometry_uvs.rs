//! UV transform helpers for the uv0 channel.
//!
//! Ports `@flighthq/mesh` `meshGeometryUvs.ts`. All functions write directly
//! into `geometry.vertices` and bump `geometry.version`. They operate on
//! whatever attribute is registered under the `Uv0` semantic in the
//! geometry's layout — so they work on canonical-layout geometry and any
//! custom layout that includes uv0. No-ops (no version bump) when uv0 is
//! absent from the layout.

use flighthq_types::{MeshGeometry, VertexSemantic};

use crate::mesh_geometry::vertex_count_from_layout;
use crate::mesh_geometry_attributes::get_vertex_attribute_float_offset;

/// Offsets every uv0 coordinate by `(du, dv)`: `u' = u + du`, `v' = v + dv`.
/// Useful for texture atlas panning or tiling offset corrections.
pub fn offset_mesh_geometry_uvs(geometry: &mut MeshGeometry, du: f32, dv: f32) {
    let float_offset =
        match get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Uv0) {
            Some(off) => off,
            None => return,
        };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    let verts = &mut geometry.vertices;
    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + float_offset) as usize;
        verts[base] += du;
        verts[base + 1] += dv;
    }
    if vertex_count > 0 {
        geometry.version += 1;
    }
}

/// Scales every uv0 coordinate by `(su, sv)` around the origin: `u' = u *
/// su`, `v' = v * sv`. Useful for tiling — e.g. `scale_mesh_geometry_uvs(geo,
/// 2.0, 2.0)` tiles the texture 2x in each direction.
pub fn scale_mesh_geometry_uvs(geometry: &mut MeshGeometry, su: f32, sv: f32) {
    let float_offset =
        match get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Uv0) {
            Some(off) => off,
            None => return,
        };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    let verts = &mut geometry.vertices;
    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + float_offset) as usize;
        verts[base] *= su;
        verts[base + 1] *= sv;
    }
    if vertex_count > 0 {
        geometry.version += 1;
    }
}

/// Wraps every uv0 coordinate into `[0, 1)` using the fractional-part
/// operation: `u' = u - floor(u)`. Useful after scale or offset operations
/// that push coordinates outside the 0..1 atlas tile. Coordinates that are
/// exactly on integer boundaries (e.g. `u = 1.0`) wrap to `0.0`.
pub fn wrap_mesh_geometry_uvs(geometry: &mut MeshGeometry) {
    let float_offset =
        match get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Uv0) {
            Some(off) => off,
            None => return,
        };
    let floats_per_vertex = geometry.layout.stride / 4;
    let vertex_count = vertex_count_from_layout(&geometry.vertices, &geometry.layout);
    let verts = &mut geometry.vertices;
    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + float_offset) as usize;
        verts[base] -= verts[base].floor();
        verts[base + 1] -= verts[base + 1].floor();
    }
    if vertex_count > 0 {
        geometry.version += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh_geometry::{MeshGeometryOptions, create_mesh_geometry};
    use flighthq_types::{VertexAttribute, VertexAttributeLayout, VertexFormat};

    fn layout_with_uv0() -> VertexAttributeLayout {
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

    fn layout_without_uv0() -> VertexAttributeLayout {
        VertexAttributeLayout {
            attributes: vec![VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            }],
            stride: 12,
        }
    }

    fn make_geometry(layout: VertexAttributeLayout, vertices: Vec<f32>) -> MeshGeometry {
        create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            subsets: None,
            topology: None,
            vertices,
        })
    }

    mod offset_mesh_geometry_uvs {
        use super::*;

        #[test]
        fn shifts_every_uv_coordinate() {
            let mut geo = make_geometry(layout_with_uv0(), vec![0.0, 0.0, 0.0, 0.25, 0.5]);
            offset_mesh_geometry_uvs(&mut geo, 0.1, -0.1);
            assert!((geo.vertices[3] - 0.35).abs() < 1e-6);
            assert!((geo.vertices[4] - 0.4).abs() < 1e-6);
            assert_eq!(geo.version, 1);
        }

        #[test]
        fn no_ops_when_uv0_is_absent() {
            let mut geo = make_geometry(layout_without_uv0(), vec![0.0, 0.0, 0.0]);
            offset_mesh_geometry_uvs(&mut geo, 0.1, 0.1);
            assert_eq!(geo.version, 0);
        }
    }

    mod scale_mesh_geometry_uvs {
        use super::*;

        #[test]
        fn scales_every_uv_coordinate() {
            let mut geo = make_geometry(layout_with_uv0(), vec![0.0, 0.0, 0.0, 0.25, 0.5]);
            scale_mesh_geometry_uvs(&mut geo, 2.0, 2.0);
            assert!((geo.vertices[3] - 0.5).abs() < 1e-6);
            assert!((geo.vertices[4] - 1.0).abs() < 1e-6);
        }
    }

    mod wrap_mesh_geometry_uvs {
        use super::*;

        #[test]
        fn wraps_coordinates_into_0_1() {
            let mut geo = make_geometry(layout_with_uv0(), vec![0.0, 0.0, 0.0, 1.5, -0.25]);
            wrap_mesh_geometry_uvs(&mut geo);
            assert!((geo.vertices[3] - 0.5).abs() < 1e-6);
            assert!((geo.vertices[4] - 0.75).abs() < 1e-6);
        }

        #[test]
        fn wraps_an_exact_integer_boundary_to_zero() {
            let mut geo = make_geometry(layout_with_uv0(), vec![0.0, 0.0, 0.0, 1.0, 2.0]);
            wrap_mesh_geometry_uvs(&mut geo);
            assert_eq!(geo.vertices[3], 0.0);
            assert_eq!(geo.vertices[4], 0.0);
        }
    }
}
