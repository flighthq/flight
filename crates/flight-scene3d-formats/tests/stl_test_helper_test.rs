use flight_scene3d_formats::contract::*;

mod build_ascii_stl {
    use super::*;
    #[test]
    fn writes_complete_named_facets_and_three_vertices_each() {
        let text = build_ascii_stl(&STL_SQUARE_FACETS, None);
        assert!(text.starts_with("solid fixture"));
        assert!(text.ends_with("endsolid fixture"));
        assert_eq!(text.matches("facet normal").count(), 2);
        assert_eq!(text.matches("vertex ").count(), 6);
        assert!(
            build_ascii_stl(&STL_SQUARE_FACETS, Some("a part with a long name"))
                .starts_with("solid a part with a long name")
        );
    }
}

mod build_binary_stl {
    use super::*;
    #[test]
    fn writes_exact_size_little_endian_count_and_truncated_header() {
        let bytes = build_binary_stl(&STL_SQUARE_FACETS, None);
        assert_eq!(
            bytes.len(),
            BINARY_STL_HEADER_SIZE + 2 * BINARY_STL_TRIANGLE_SIZE
        );
        assert_eq!(u32::from_le_bytes(bytes[80..84].try_into().unwrap()), 2);
        let bytes = build_binary_stl(&STL_SQUARE_FACETS, Some("solid trap"));
        assert_eq!(
            bytes.len(),
            BINARY_STL_HEADER_SIZE + 2 * BINARY_STL_TRIANGLE_SIZE
        );
        assert_eq!(u32::from_le_bytes(bytes[80..84].try_into().unwrap()), 2);
        assert_eq!(&bytes[..10], b"solid trap");
        let bytes = build_binary_stl(&STL_SQUARE_FACETS, Some(&"x".repeat(200)));
        assert_eq!(&bytes[..80], &[b'x'; 80]);
        assert_eq!(
            bytes.len(),
            BINARY_STL_HEADER_SIZE + 2 * BINARY_STL_TRIANGLE_SIZE
        );
        assert_eq!(u32::from_le_bytes(bytes[80..84].try_into().unwrap()), 2);
    }
}

mod stl_square_facets {
    use super::*;
    #[test]
    fn shares_two_square_corners_and_has_matching_normals_in_both_encodings() {
        assert_eq!(STL_SQUARE_FACETS.len(), 2);
        let corners: Vec<[f32; 3]> = STL_SQUARE_FACETS
            .iter()
            .flat_map(|facet| facet.vertices)
            .collect();
        assert_eq!(corners.iter().filter(|&&v| v == [0.0; 3]).count(), 2);
        assert_eq!(corners.iter().filter(|&&v| v == [1.0, 1.0, 0.0]).count(), 2);
        for facet in &STL_SQUARE_FACETS {
            assert_eq!(facet.normal, [0.0, 0.0, 1.0]);
        }
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(&mut output, &build_binary_stl(&STL_SQUARE_FACETS, None)) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(StlFeatures {
                triangle_count: 2,
                variant: StlVariant::Binary
            })
        );
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(
                    &mut output,
                    build_ascii_stl(&STL_SQUARE_FACETS, None).as_bytes(),
                ) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(StlFeatures {
                triangle_count: 2,
                variant: StlVariant::Ascii
            })
        );
    }
}
