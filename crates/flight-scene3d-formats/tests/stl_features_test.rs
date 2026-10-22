use flight_scene3d_formats::contract::*;

mod collect_stl_features {
    use super::*;

    #[test]
    fn reports_each_encoding_and_rejects_binary_header_traps_as_ascii() {
        let ascii = build_ascii_stl(&STL_SQUARE_FACETS, None);
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(&mut output, ascii.as_bytes()) {
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
        for header in [
            "binary stl fixture",
            "binary fixture",
            "solid part made by an exporter that writes this",
            "solid part\n",
            "solid part\nfacet normal 0 0 1\n",
        ] {
            let bytes = build_binary_stl(&STL_SQUARE_FACETS, Some(header));
            assert_eq!(
                {
                    let mut output = StlFeatures {
                        triangle_count: 0,
                        variant: StlVariant::Ascii,
                    };
                    if collect_stl_features(&mut output, &bytes) {
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
                count_ascii_stl_facets(&flight_encoding::decode_utf8(&bytes, None, None)),
                None
            );
        }
    }

    #[test]
    fn rejects_truncated_excess_overflow_count_and_zero_payloads() {
        let bytes = build_binary_stl(&STL_SQUARE_FACETS, None);
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(&mut output, &bytes[..bytes.len() - 1]) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
        let mut excess = bytes.to_vec();
        excess.push(0);
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(&mut output, &excess) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
        let mut overflow = bytes.to_vec();
        overflow[80..84].copy_from_slice(&100000_u32.to_le_bytes());
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(&mut output, &overflow) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(&mut output, &build_binary_stl(&[], None)) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(&mut output, &[0; BINARY_STL_HEADER_SIZE]) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
    }

    #[test]
    fn rejects_all_source_non_stl_content() {
        for text in [
            "",
            "this solid object is not a model",
            "solid empty\nendsolid empty",
            "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
            "<?xml version=\"1.0\"?><COLLADA/>",
        ] {
            assert_eq!(
                {
                    let mut output = StlFeatures {
                        triangle_count: 0,
                        variant: StlVariant::Ascii,
                    };
                    if collect_stl_features(&mut output, text.as_bytes()) {
                        Some(output)
                    } else {
                        None
                    }
                },
                None,
                "{text}"
            );
        }
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(
                    &mut output,
                    &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
                ) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
    }

    #[test]
    fn detects_a_binary_subslice_using_its_own_length_and_offset() {
        let bytes = build_binary_stl(&STL_SQUARE_FACETS, None);
        let mut padded = vec![9; 7];
        padded.extend_from_slice(&bytes);
        padded.extend_from_slice(&[8; 5]);
        assert_eq!(
            {
                let mut output = StlFeatures {
                    triangle_count: 0,
                    variant: StlVariant::Ascii,
                };
                if collect_stl_features(&mut output, &padded[7..7 + bytes.len()]) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap()
            .triangle_count,
            2
        );
    }
    #[test]
    fn overwrites_each_successful_record_and_keeps_the_previous_record_when_the_source_is_invalid()
    {
        let mut out = StlFeatures {
            triangle_count: 99,
            variant: StlVariant::Ascii,
        };
        let binary = build_binary_stl(&STL_SQUARE_FACETS, None);
        assert!(collect_stl_features(&mut out, &binary));
        assert_eq!(
            out,
            StlFeatures {
                triangle_count: 2,
                variant: StlVariant::Binary
            }
        );
        assert!(!collect_stl_features(&mut out, &[]));
        assert_eq!(
            out,
            StlFeatures {
                triangle_count: 2,
                variant: StlVariant::Binary
            }
        );
        let ascii = build_ascii_stl(&STL_SQUARE_FACETS[..1], None);
        assert!(collect_stl_features(&mut out, ascii.as_bytes()));
        assert_eq!(
            out,
            StlFeatures {
                triangle_count: 1,
                variant: StlVariant::Ascii
            }
        );
    }
}

mod constants {
    use super::*;

    #[test]
    fn states_the_exact_source_layout_and_mesh_feature() {
        assert_eq!(BINARY_STL_COUNT_OFFSET, 80);
        assert_eq!(BINARY_STL_HEADER_SIZE, BINARY_STL_COUNT_OFFSET + 4);
        assert_eq!(BINARY_STL_TRIANGLE_SIZE, 4 * 3 * 4 + 2);
        assert_eq!(STL_MESH_FEATURE, "Mesh");
    }
}

mod count_ascii_stl_facets {
    use super::*;

    #[test]
    fn accepts_source_writer_conventions_and_multiword_names() {
        let text = build_ascii_stl(&STL_SQUARE_FACETS, None);
        assert_eq!(count_ascii_stl_facets(&text), Some(2));
        assert_eq!(
            count_ascii_stl_facets(&text.to_uppercase().replace('\n', "\r\n")),
            Some(2)
        );
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(
            count_ascii_stl_facets(&format!("solid\n{}", lines[1..lines.len() - 1].join("\n"))),
            Some(2)
        );
        assert_eq!(
            count_ascii_stl_facets(&build_ascii_stl(
                &STL_SQUARE_FACETS,
                Some("a part with a long name")
            )),
            Some(2)
        );
    }

    #[test]
    fn rejects_every_malformed_source_facet_instead_of_a_partial_model() {
        for text in [
            "solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nendloop\nendfacet\nendsolid s",
            "solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid s",
            "solid s\nfacet normal a b c\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s",
            "solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s",
            "solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendfacet\nendsolid s",
            "solid s\nfacet normal 0 0 1\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s",
            "solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\n",
            "solid s\nfacet normal 0 0 1\nouter loop\nvertex NaN 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s",
        ] {
            assert_eq!(count_ascii_stl_facets(text), None, "{text}");
        }
    }

    #[test]
    fn rejects_content_between_header_and_first_facet() {
        let text = build_ascii_stl(&STL_SQUARE_FACETS, None).replacen(
            '\n',
            "\nthis line does not belong here\n",
            1,
        );
        assert_eq!(count_ascii_stl_facets(&text), None);
        let text = "solid s\nthis line does not belong here\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s";
        assert_eq!(count_ascii_stl_facets(text), None);
    }

    #[test]
    fn preserves_js_number_finiteness_and_supported_numeric_token_grammar() {
        let text = build_ascii_stl(&STL_SQUARE_FACETS, None);
        for token in ["1e40", "1e300", "0x10", "0o10", "0b10", "+.5", "1.", "-0"] {
            assert_eq!(
                count_ascii_stl_facets(&text.replacen(
                    "vertex 0 0 0",
                    &format!("vertex {token} 0 0"),
                    1
                )),
                Some(2),
                "{token}"
            );
        }
        for token in [
            "NaN",
            "Infinity",
            "-Infinity",
            "1e309",
            "1_0",
            "+0x10",
            "1e",
            "1f32",
            "infinity",
        ] {
            assert_eq!(
                count_ascii_stl_facets(&text.replacen(
                    "vertex 0 0 0",
                    &format!("vertex {token} 0 0"),
                    1
                )),
                None,
                "{token}"
            );
        }
    }
}

mod get_stl_variant_string {
    use super::*;
    #[test]
    fn returns_exact_serialized_names() {
        assert_eq!(get_stl_variant_string(StlVariant::Ascii), "Ascii");
        assert_eq!(get_stl_variant_string(StlVariant::Binary), "Binary");
    }
}

mod parse_stl_variant {
    use super::*;
    #[test]
    fn accepts_exact_serialized_names_only() {
        assert_eq!(parse_stl_variant("Ascii"), Some(StlVariant::Ascii));
        assert_eq!(parse_stl_variant("Binary"), Some(StlVariant::Binary));
        for value in ["ascii", "binary", "", "Other"] {
            assert_eq!(parse_stl_variant(value), None);
        }
    }
}

mod read_binary_stl_triangle_count {
    use super::*;
    #[test]
    fn agrees_with_feature_census_and_checks_exact_subview_payload_bounds() {
        let binary = build_binary_stl(&STL_SQUARE_FACETS, None);
        assert_eq!(read_binary_stl_triangle_count(&binary), Some(2));
        assert_eq!(read_binary_stl_triangle_count(&[0; 10]), None);
        for bytes in [
            binary.to_vec(),
            build_binary_stl(&STL_SQUARE_FACETS, Some("solid trap")).to_vec(),
            build_ascii_stl(&STL_SQUARE_FACETS, None).into_bytes(),
            vec![0; BINARY_STL_HEADER_SIZE],
        ] {
            let count = read_binary_stl_triangle_count(&bytes);
            assert_eq!(
                count.is_some(),
                {
                    let mut output = StlFeatures {
                        triangle_count: 0,
                        variant: StlVariant::Ascii,
                    };
                    if collect_stl_features(&mut output, &bytes) {
                        Some(output)
                    } else {
                        None
                    }
                }
                .is_some_and(|features| features.variant == StlVariant::Binary)
            );
        }
    }
}
