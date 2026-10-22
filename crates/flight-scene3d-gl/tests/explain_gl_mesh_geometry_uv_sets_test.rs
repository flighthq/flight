use std::sync::{Arc, RwLock};

use flight_materials::PbrUvSet;
use flight_meshgeometry::{
    MeshGeometry, MeshGeometryOptions, VertexAttribute, VertexAttributeLayout, VertexFormat,
    VertexSemantic, create_mesh_geometry,
};
use flight_scene3d_gl::contract::*;

// One float32x2 per named semantic, which is all this query reads.
fn geometry_with(semantics: &[VertexSemantic]) -> MeshGeometry {
    let attributes = semantics
        .iter()
        .enumerate()
        .map(|(index, semantic)| VertexAttribute {
            byte_offset: index as u32 * 8,
            format: VertexFormat::Float32x2,
            semantic: *semantic,
        })
        .collect();
    let stride = semantics.len() as u32 * 8;
    return create_mesh_geometry(MeshGeometryOptions {
        vertices: vec![0.0; semantics.len() * 2].into_boxed_slice(),
        layout: Arc::new(RwLock::new(VertexAttributeLayout { attributes, stride })),
        indices: None,
        subsets: None,
        topology: None,
    });
}

mod explain_gl_mesh_geometry_uv_sets {
    use super::*;

    #[test]
    fn serves_a_uv1_request_when_the_layout_carries_uv1() {
        let explanation = explain_gl_mesh_geometry_uv_sets(
            &geometry_with(&[
                VertexSemantic::Position,
                VertexSemantic::Uv0,
                VertexSemantic::Uv1,
            ]),
            &[0, 1],
        );
        assert_eq!(explanation.available_uv_sets, vec![0, 1]);
        assert!(explanation.unserved_uv_sets.is_empty());
        assert!(!explanation.samples_at_origin);
    }

    #[test]
    fn names_uv1_unserved_when_the_layout_carries_only_uv0() {
        let explanation = explain_gl_mesh_geometry_uv_sets(
            &geometry_with(&[VertexSemantic::Position, VertexSemantic::Uv0]),
            &[0, 1],
        );
        assert_eq!(explanation.available_uv_sets, vec![0]);
        assert_eq!(explanation.unserved_uv_sets, vec![1]);
        // The draw succeeds and every texel of that map reads the map's origin texel.
        assert!(explanation.samples_at_origin);
    }

    #[test]
    fn stays_quiet_when_a_uv1_less_geometry_is_only_asked_for_uv0() {
        let explanation = explain_gl_mesh_geometry_uv_sets(
            &geometry_with(&[VertexSemantic::Position, VertexSemantic::Uv0]),
            &[0],
        );
        assert!(!explanation.samples_at_origin);
        assert!(explanation.unserved_uv_sets.is_empty());
    }

    #[test]
    fn reports_a_geometry_with_no_uv_channel_at_all_as_serving_neither_set() {
        let explanation = explain_gl_mesh_geometry_uv_sets(
            &geometry_with(&[VertexSemantic::Position, VertexSemantic::Normal]),
            &[0, 1],
        );
        assert!(explanation.available_uv_sets.is_empty());
        assert_eq!(explanation.unserved_uv_sets, vec![0, 1]);
    }

    #[test]
    fn collapses_a_repeated_request_so_a_material_with_many_maps_on_one_set_reports_it_once() {
        let requested: [PbrUvSet; 4] = [1, 1, 0, 1];
        let explanation = explain_gl_mesh_geometry_uv_sets(
            &geometry_with(&[VertexSemantic::Position, VertexSemantic::Uv0]),
            &requested,
        );
        assert_eq!(explanation.requested_uv_sets, vec![0, 1]);
        assert_eq!(explanation.unserved_uv_sets, vec![1]);
    }

    #[test]
    fn retains_and_mutates_nothing_so_repeated_queries_agree() {
        let geometry = geometry_with(&[VertexSemantic::Position, VertexSemantic::Uv0]);
        let first = explain_gl_mesh_geometry_uv_sets(&geometry, &[1]);
        let second = explain_gl_mesh_geometry_uv_sets(&geometry, &[1]);
        assert_eq!(second, first);
        assert_eq!(geometry.layout.read().unwrap().attributes.len(), 2);
    }
}
