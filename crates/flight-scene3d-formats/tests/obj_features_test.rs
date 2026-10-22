use flight_scene3d_formats::*;

mod collect_obj_features {
    use super::*;

    #[test]
    fn preserves_every_original_source_input_and_feature_expectation() {
        for (source, expected) in [
            ("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3", vec!["Face"]),
            ("v 0 0 0\nv 1 0 0\nv 0 1 0", vec![]),
            ("", vec![]),
            ("# OBJ file\n# exported by tool\n\n  \n", vec![]),
            (
                "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nmtllib material.mtl\nusemtl stone\nf 1 2 3\nl 1 2 3\np 4",
                vec!["Material", "Face", "Line", "Point"],
            ),
            (
                "v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl stone\nf 1 2 3",
                vec!["Material", "Face"],
            ),
            (
                "mtllib scene.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3",
                vec!["Material", "Face"],
            ),
            ("v 0 0 0\nv 1 0 0\nl 1 2", vec!["Line"]),
            ("v 0 0 0\np 1", vec!["Point"]),
            (
                "# comment\nv 0 0 0\n# another\nv 1 0 0\nv 0 1 0\n# face:\nf 1 2 3",
                vec!["Face"],
            ),
            ("  f 1 2 3", vec!["Face"]),
            ("f\t1\t2\t3\nusemtl\tstone", vec!["Face", "Material"]),
            ("# f 1 2 3\n# usemtl stone", vec![]),
            ("v 0 0 0\nf 1", vec!["Face"]),
            ("f", vec!["Face"]),
        ] {
            let mut output = Vec::new();
            collect_obj_features(&mut output, source);
            assert_eq!(output, expected, "{source}");
        }
    }

    #[test]
    fn inventories_topology_and_material_directives_in_discovery_order_without_decoding_data() {
        for source in [
            "",
            "# OBJ file\n# f 1 2 3\n# usemtl stone\n  ",
            "v 0 0 0\nv 1 0 0\nv 0 1 0",
        ] {
            assert!(
                {
                    let mut output = Vec::new();
                    collect_obj_features(&mut output, source);
                    output
                }
                .is_empty()
            );
        }
        for source in [
            "v 0 0 0\nf 1 2 3",
            "# comment\nv 0 0 0\n# face\n f 1 2 3",
            "  f 1 2 3",
            "f",
            "v 0 0 0\nf 1",
        ] {
            assert_eq!(
                {
                    let mut output = Vec::new();
                    collect_obj_features(&mut output, source);
                    output
                },
                ["Face"]
            );
        }
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_features(&mut output, "l 1 2");
                output
            },
            ["Line"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_features(&mut output, "p 1");
                output
            },
            ["Point"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_features(&mut output, "f\t1\t2\t3\nusemtl\tstone");
                output
            },
            ["Face", "Material"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_features(&mut output, "mtllib scene.mtl\nv 0 0 0\nf 1 2 3");
                output
            },
            ["Material", "Face"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_features(&mut output, "usemtl stone\nf 1 2 3");
                output
            },
            ["Material", "Face"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_features(
                    &mut output,
                    "mtllib material.mtl\nusemtl stone\nf 1 2 3\nl 1 2 3\np 4\nf 1 1 1",
                );
                output
            },
            ["Material", "Face", "Line", "Point"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_features(&mut output, "\u{feff}f\u{00a0}1 2 3");
                output
            },
            ["Face"]
        );
    }
    #[test]
    fn clears_stale_results_retains_capacity_and_reads_a_retained_source_before_reusing_its_container()
     {
        let mut out = Vec::with_capacity(32);
        out.push("p 1\nf 1 2 3\nl 1 2".to_string());
        out.push("stale".to_string());
        let source = out[0].clone();
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        collect_obj_features(&mut out, &source);
        assert_eq!(out, ["Point", "Face", "Line"]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        collect_obj_features(&mut out, "");
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod collect_obj_material_library_references {
    use super::*;

    #[test]
    fn preserves_every_original_library_reference_input_and_first_seen_order() {
        for (source, expected) in [
            (
                "mtllib a.mtl\nv 0 0 0\nmtllib b.mtl\n",
                vec!["a.mtl", "b.mtl"],
            ),
            ("mtllib a.mtl b.mtl\n", vec!["a.mtl", "b.mtl"]),
            ("mtllib a.mtl\nmtllib a.mtl\n", vec!["a.mtl"]),
            ("v 0 0 0\nf 1 1 1\n", vec![]),
            ("# mtllib a.mtl\n", vec![]),
            ("usemtl Red\n", vec![]),
        ] {
            let mut output = Vec::new();
            collect_obj_material_library_references(&mut output, source);
            assert_eq!(output, expected, "{source}");
        }
    }

    #[test]
    fn keeps_every_path_once_in_first_seen_order_and_never_interprets_material_names_as_files() {
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_material_library_references(
                    &mut output,
                    "mtllib a.mtl\nv 0 0 0\nmtllib b.mtl\nmtllib a.mtl c.mtl\n",
                );
                output
            },
            ["a.mtl", "b.mtl", "c.mtl"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_material_library_references(&mut output, "mtllib a.mtl b.mtl");
                output
            },
            ["a.mtl", "b.mtl"]
        );
        for source in ["v 0 0 0\nf 1 1 1", "# mtllib a.mtl", "usemtl Red", "mtllib"] {
            assert!(
                {
                    let mut output = Vec::new();
                    collect_obj_material_library_references(&mut output, source);
                    output
                }
                .is_empty()
            );
        }
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_material_library_references(&mut output, "mtllib\ta.mtl\tb.mtl");
                output
            },
            ["a.mtl", "b.mtl"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_obj_material_library_references(&mut output, "mtllibSuffix.mtl");
                output
            },
            ["Suffix.mtl"]
        );
    }
    #[test]
    fn clears_stale_results_retains_capacity_and_reads_a_retained_source_before_reusing_its_container()
     {
        let mut out = Vec::with_capacity(32);
        out.push("mtllib a.mtl b.mtl\nmtllib a.mtl".to_string());
        out.push("stale".to_string());
        let source = out[0].clone();
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        collect_obj_material_library_references(&mut out, &source);
        assert_eq!(out, ["a.mtl", "b.mtl"]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        collect_obj_material_library_references(&mut out, "");
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod obj_feature_directives {
    use super::*;
    #[test]
    fn defines_exactly_the_four_source_features_and_their_directive_vocabularies() {
        assert_eq!(
            OBJ_FEATURE_DIRECTIVES
                .iter()
                .map(|entry| entry.feature.as_str())
                .collect::<Vec<_>>(),
            ["Face", "Line", "Material", "Point"]
        );
        assert_eq!(
            OBJ_FEATURE_DIRECTIVES
                .iter()
                .map(|entry| entry
                    .directives
                    .iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>())
                .collect::<Vec<_>>(),
            [vec!["f"], vec!["l"], vec!["usemtl", "mtllib"], vec!["p"]]
        );
    }
}
