use flight_meshgeometry::{IndexBuffer, MeshGeometry, MeshSubset, PrimitiveTopology};
use flight_scene3d_formats::contract::*;

fn contradicting_facet() -> [StlFixtureFacet; 1] {
    return [StlFixtureFacet {
        normal: [0.0, 0.0, -1.0],
        vertices: [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
    }];
}

fn triples(geometry: &MeshGeometry, channel: usize) -> Vec<[f32; 3]> {
    return geometry
        .vertices
        .chunks(CANONICAL_FLOATS_PER_VERTEX)
        .map(|record| [record[channel], record[channel + 1], record[channel + 2]])
        .collect();
}

mod get_stl_normal_policy_string {
    use super::*;
    #[test]
    fn returns_exact_source_strings() {
        assert_eq!(
            get_stl_normal_policy_string(StlNormalPolicy::FileNormals),
            "FileNormals"
        );
        assert_eq!(
            get_stl_normal_policy_string(StlNormalPolicy::RecomputeFromVertices),
            "RecomputeFromVertices"
        );
    }
}

mod parse_stl {
    use super::*;

    #[test]
    fn matches_geometry_across_ascii_binary_and_solid_binary_headers() {
        let binary = parse_stl(&build_binary_stl(&STL_SQUARE_FACETS, None), None).unwrap();
        let ascii = parse_stl(build_ascii_stl(&STL_SQUARE_FACETS, None).as_bytes(), None).unwrap();
        assert_eq!(ascii.vertices, binary.vertices);
        assert_eq!(
            *ascii.layout.read().unwrap(),
            *binary.layout.read().unwrap()
        );
        assert!(std::sync::Arc::ptr_eq(&ascii.layout, &binary.layout));
        assert!(std::sync::Arc::ptr_eq(&ascii.layout, &CANONICAL_LAYOUT));
        assert!(matches!(ascii.indices, IndexBuffer::None));
        assert!(matches!(binary.indices, IndexBuffer::None));
        assert_eq!(ascii.topology, binary.topology);
        let trap = parse_stl(
            &build_binary_stl(&STL_SQUARE_FACETS, Some("solid part")),
            None,
        )
        .unwrap();
        assert_eq!(triples(&trap, 0), triples(&binary, 0));
    }

    #[test]
    fn preserves_each_facet_without_welding_axis_conversion_or_missing_channels() {
        let geometry = parse_stl(&build_binary_stl(&STL_SQUARE_FACETS, None), None).unwrap();
        let positions = triples(&geometry, 0);
        assert_eq!(
            positions,
            vec![
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [1.0, 1.0, 0.0],
                [0.0, 0.0, 0.0],
                [1.0, 1.0, 0.0],
                [0.0, 1.0, 0.0]
            ]
        );
        assert_eq!(positions.iter().filter(|&&v| v == [0.0; 3]).count(), 2);
        assert_eq!(
            positions.iter().filter(|&&v| v == [1.0, 1.0, 0.0]).count(),
            2
        );
        assert_eq!(geometry.vertices.len(), 6 * CANONICAL_FLOATS_PER_VERTEX);
        assert!(matches!(geometry.indices, IndexBuffer::None));
        assert_eq!(geometry.topology, PrimitiveTopology::TriangleList);
        assert_eq!(
            geometry.subsets,
            vec![MeshSubset {
                index_count: 6,
                index_offset: 0
            }]
        );
        assert_eq!(geometry.layout.read().unwrap().stride, 48);
        for record in geometry.vertices.chunks(CANONICAL_FLOATS_PER_VERTEX) {
            assert_eq!(&record[6..12], &[0.0; 6]);
        }
    }

    #[test]
    fn returns_none_for_empty_unreadable_truncated_and_partially_malformed_files() {
        for bytes in [
            vec![],
            b"this solid object is not a model".to_vec(),
            b"solid empty\nendsolid empty".to_vec(),
            build_binary_stl(&[], None).to_vec(),
            build_binary_stl(&STL_SQUARE_FACETS, None)[..100].to_vec(),
        ] {
            assert!(parse_stl(&bytes, None).is_none());
        }
        let good = build_ascii_stl(&STL_SQUARE_FACETS, None);
        let partial = format!(
            "{}facet normal 0 0 1\nouter loop\nvertex 0 0 0\nendloop\nendfacet\nendsolid fixture",
            good.split("endsolid").next().unwrap()
        );
        assert!(parse_stl(partial.as_bytes(), None).is_none());
    }

    #[test]
    fn states_and_applies_the_default_normal_policy_explicitly() {
        assert_eq!(
            STL_FULL_IMPORT_OPTIONS,
            StlImportOptions {
                normals: Some(StlNormalPolicy::RecomputeFromVertices)
            }
        );
        let bytes = build_binary_stl(&contradicting_facet(), None);
        let explicit = parse_stl(&bytes, Some(&STL_FULL_IMPORT_OPTIONS)).unwrap();
        let default = parse_stl(&bytes, None).unwrap();
        assert_eq!(explicit.vertices, default.vertices);
        assert_eq!(triples(&default, 3), vec![[0.0, 0.0, 1.0]; 3]);
        let authored = parse_stl(
            &bytes,
            Some(&StlImportOptions {
                normals: Some(StlNormalPolicy::FileNormals),
            }),
        )
        .unwrap();
        assert_eq!(triples(&authored, 3), vec![[0.0, 0.0, -1.0]; 3]);
        assert_eq!(
            parse_stl(&bytes, Some(&StlImportOptions { normals: None }))
                .unwrap()
                .vertices,
            default.vertices
        );
    }

    #[test]
    fn normalizes_authored_vectors_and_falls_back_for_each_missing_direction() {
        let file = StlImportOptions {
            normals: Some(StlNormalPolicy::FileNormals),
        };
        for normal in [
            [0.0, 0.0, 7.0],
            [0.0; 3],
            [f32::NAN, 0.0, 0.0],
            [f32::INFINITY, 0.0, 0.0],
        ] {
            let mut facets = contradicting_facet();
            facets[0].normal = normal;
            let geometry = parse_stl(&build_binary_stl(&facets, None), Some(&file)).unwrap();
            assert_eq!(triples(&geometry, 3), vec![[0.0, 0.0, 1.0]; 3]);
        }
    }

    #[test]
    fn emits_zero_finite_normals_for_degenerate_vertices_under_both_policies() {
        let facets = [StlFixtureFacet {
            normal: [0.0; 3],
            vertices: [[1.0; 3]; 3],
        }];
        let file = StlImportOptions {
            normals: Some(StlNormalPolicy::FileNormals),
        };
        for options in [None, Some(&file)] {
            let geometry = parse_stl(&build_binary_stl(&facets, None), options).unwrap();
            assert_eq!(triples(&geometry, 3), vec![[0.0; 3]; 3]);
            assert!(geometry.vertices.iter().all(|value| value.is_finite()));
        }
    }

    #[test]
    fn reaches_same_normals_from_both_encodings_under_each_policy() {
        let binary = build_binary_stl(&contradicting_facet(), None);
        let ascii = build_ascii_stl(&contradicting_facet(), None);
        let file = StlImportOptions {
            normals: Some(StlNormalPolicy::FileNormals),
        };
        for options in [None, Some(&file), Some(&STL_FULL_IMPORT_OPTIONS)] {
            assert_eq!(
                triples(&parse_stl(ascii.as_bytes(), options).unwrap(), 3),
                triples(&parse_stl(&binary, options).unwrap(), 3)
            );
        }
    }

    #[test]
    fn keeps_large_file_normals_in_double_until_the_output_write() {
        let facets = [StlFixtureFacet {
            normal: [0.0, 0.0, 1e20],
            vertices: [[0.0; 3], [0.0, 1.0, 0.0], [1.0, 0.0, 0.0]],
        }];
        assert!((facets[0].normal[2] * facets[0].normal[2]).is_infinite());
        let bytes = build_binary_stl(&facets, None);
        let file = StlImportOptions {
            normals: Some(StlNormalPolicy::FileNormals),
        };
        assert_eq!(
            triples(&parse_stl(&bytes, Some(&file)).unwrap(), 3),
            vec![[0.0, 0.0, 1.0]; 3]
        );
        assert_eq!(
            triples(&parse_stl(&bytes, None).unwrap(), 3),
            vec![[0.0, 0.0, -1.0]; 3]
        );
    }

    #[test]
    fn accepts_finite_js_numbers_before_float32_output_overflows() {
        let text = build_ascii_stl(&STL_SQUARE_FACETS, None);
        for token in ["1e40", "1e300"] {
            let geometry = parse_stl(
                text.replacen("vertex 0 0 0", &format!("vertex {token} 0 0"), 1)
                    .as_bytes(),
                None,
            )
            .unwrap();
            assert!(geometry.vertices[0].is_infinite());
        }
        for token in ["NaN", "Infinity", "-Infinity", "1e309"] {
            assert!(
                parse_stl(
                    text.replacen("vertex 0 0 0", &format!("vertex {token} 0 0"), 1)
                        .as_bytes(),
                    None
                )
                .is_none()
            );
        }
    }
}

mod parse_stl_normal_policy {
    use super::*;
    #[test]
    fn accepts_only_exact_source_policy_names() {
        assert_eq!(
            parse_stl_normal_policy("FileNormals"),
            Some(StlNormalPolicy::FileNormals)
        );
        assert_eq!(
            parse_stl_normal_policy("RecomputeFromVertices"),
            Some(StlNormalPolicy::RecomputeFromVertices)
        );
        assert_eq!(parse_stl_normal_policy("fileNormals"), None);
        assert_eq!(parse_stl_normal_policy(""), None);
    }
}
