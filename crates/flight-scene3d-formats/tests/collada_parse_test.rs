use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

const MINIMAL: &str = "<COLLADA><asset><up_axis>Y_UP</up_axis></asset><scene/></COLLADA>";
const WITH_SCENE: &str = "<COLLADA><asset><up_axis>Y_UP</up_axis></asset><library_visual_scenes><visual_scene id=\"s\"><node id=\"n\"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url=\"#s\"/></scene></COLLADA>";
const Z_UP: &str = "<COLLADA><asset><up_axis>Z_UP</up_axis></asset><scene/></COLLADA>";

fn probe(name: &str, order: &Ref<Vec<String>>, phase: Option<f32>) -> Ref<ColladaElementDecoder> {
    let decode_name = name.to_string();
    let build_name = name.to_string();
    let decode_order = order.clone();
    let build_order = order.clone();
    return Arc::new(RwLock::new(ColladaElementDecoder {
        build: Some(Arc::new(move |_| {
            build_order
                .write()
                .unwrap()
                .push(format!("{build_name}:build"))
        })),
        build_phase: phase,
        elements: Vec::new(),
        features: Vec::new(),
        decode: Arc::new(move |_| decode_order.write().unwrap().push(decode_name.clone())),
    }));
}

mod parse_collada_with_decoders {
    use super::*;

    #[test]
    fn runs_exactly_the_original_decoder_handles_in_the_callers_order_without_a_hidden_default_family()
     {
        let order = Arc::new(RwLock::new(Vec::new()));
        let first = probe("first", &order, None);
        let second = probe("second", &order, None);
        parse_collada_with_decoders(MINIMAL, &[first.clone(), second.clone()], None);
        assert_eq!(*order.read().unwrap(), ["first", "second"]);
        order.write().unwrap().clear();
        parse_collada_with_decoders(MINIMAL, &[second, first], None);
        assert_eq!(*order.read().unwrap(), ["second", "first"]);
    }

    #[test]
    fn reads_nonfeature_metadata_and_preserves_the_original_empty_family_and_coordinate_conversion_cases()
     {
        let result = parse_collada_with_decoders(MINIMAL, &[], None);
        assert!(result.diagnostics.read().unwrap().is_empty());
        assert_eq!(result.up_axis, ColladaUpAxis::YUp);
        assert!(result.document.read().unwrap().meshes.is_empty());
        let converted = parse_collada_with_decoders(Z_UP, &[], None);
        assert_eq!(converted.up_axis, ColladaUpAxis::ZUp);
        assert_eq!(converted.root_transform[6], -1.0);
        let diagnostics = converted.diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "collada.coordinate-conversion");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(diagnostics[0].origin, "parseCollada");
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("from"),
            Some(&ImportDiagnosticDetailValue::String("Z_UP".to_string()))
        );
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("to"),
            Some(&ImportDiagnosticDetailValue::String("Y_UP".to_string()))
        );
        let second = parse_collada_with_decoders(MINIMAL, &[], None);
        assert!(Arc::ptr_eq(&result.root_transform, &second.root_transform));
    }

    #[test]
    fn orders_the_original_build_phases_independently_of_decode_order_and_runs_unphased_builds_last()
     {
        let order = Arc::new(RwLock::new(Vec::new()));
        let late = probe("late", &order, Some(90.0));
        let early = probe("early", &order, Some(10.0));
        parse_collada_with_decoders(WITH_SCENE, &[late, early], None);
        assert_eq!(
            *order.read().unwrap(),
            ["late", "early", "early:build", "late:build"]
        );
        order.write().unwrap().clear();
        let phased = probe("phased", &order, Some(50.0));
        let unphased = probe("unphased", &order, None);
        parse_collada_with_decoders(WITH_SCENE, &[unphased, phased], None);
        assert_eq!(
            *order.read().unwrap(),
            ["unphased", "phased", "phased:build", "unphased:build"]
        );
    }

    #[test]
    fn skips_the_entire_build_pass_when_the_original_minimal_document_resolves_no_visual_scene() {
        let order = Arc::new(RwLock::new(Vec::new()));
        parse_collada_with_decoders(MINIMAL, &[probe("only", &order, Some(10.0))], None);
        assert_eq!(*order.read().unwrap(), ["only"]);
    }

    #[test]
    fn keeps_the_exact_max_safe_integer_default_boundary_and_stable_equal_phase_order() {
        let order = Arc::new(RwLock::new(Vec::new()));
        let family = vec![
            probe("huge", &order, Some(1e20)),
            probe("rounds_up", &order, Some(9007199254740992.0)),
            probe("unphased", &order, None),
            probe("first", &order, Some(10.0)),
            probe("second", &order, Some(10.0)),
        ];
        parse_collada_with_decoders(WITH_SCENE, &family, None);
        let builds = order
            .read()
            .unwrap()
            .iter()
            .filter(|name| name.ends_with(":build"))
            .cloned()
            .collect::<Vec<_>>();
        assert_eq!(
            builds,
            [
                "first:build",
                "second:build",
                "unphased:build",
                "rounds_up:build",
                "huge:build"
            ]
        );
    }

    #[test]
    fn retains_the_original_context_document_maps_and_root_and_releases_locks_before_reentrant_callbacks()
     {
        let saved = Arc::new(RwLock::new(None::<Ref<ColladaParseContext>>));
        let decode_saved = saved.clone();
        let build_saved = saved.clone();
        let decoder = Arc::new(RwLock::new(ColladaElementDecoder {
            elements: vec![],
            features: vec![],
            build_phase: Some(0.0),
            decode: Arc::new(move |context| {
                assert!(context.try_write().is_ok());
                let (root, map, document) = {
                    let context = context.read().unwrap();
                    assert_eq!(context.base_url.as_deref(), Some(""));
                    (
                        context.root.clone(),
                        context.material_indices.clone(),
                        context.document.clone(),
                    )
                };
                assert!(root.try_write().is_ok());
                assert!(document.try_write().is_ok());
                map.write().unwrap().push(ColladaIndexEntry {
                    key: "custom".to_string(),
                    value: 7,
                });
                *decode_saved.write().unwrap() = Some(context.clone());
                assert!(
                    parse_collada_with_decoders(MINIMAL, &[], None)
                        .diagnostics
                        .read()
                        .unwrap()
                        .is_empty()
                );
            }),
            build: Some(Arc::new(move |build| {
                assert!(build.try_write().is_ok());
                let (context, roots) = {
                    let build = build.read().unwrap();
                    assert_eq!(build.node_id_map[0].key, "n");
                    (build.parse.clone(), build.root_node_indices.clone())
                };
                assert!(Arc::ptr_eq(
                    build_saved.read().unwrap().as_ref().unwrap(),
                    &context
                ));
                let (document, map) = {
                    let context = context.read().unwrap();
                    (context.document.clone(), context.material_indices.clone())
                };
                assert!(document.try_write().is_ok());
                assert_eq!(document.read().unwrap().nodes.len(), 1);
                assert!(document.read().unwrap().scenes.is_empty());
                assert_eq!(map.read().unwrap()[0].value, 7);
                assert_eq!(roots, [0]);
            })),
        }));
        let options = ColladaImportOptions {
            base_url: Some(String::new()),
            decoders: None,
        };
        let result = parse_collada_with_decoders(WITH_SCENE, &[decoder], Some(&options));
        let saved = saved.read().unwrap();
        let saved = saved.as_ref().unwrap().read().unwrap();
        assert!(Arc::ptr_eq(&saved.document, &result.document));
        assert!(Arc::ptr_eq(&saved.diagnostics, &result.diagnostics));
        assert_eq!(result.document.read().unwrap().scenes[0].root_nodes, [0]);
    }

    #[test]
    fn rejects_invalid_roots_before_invoking_any_supplied_decoder_and_preserves_empty_result_shape()
    {
        let original =
            parse_collada_with_decoders("<NOTCOLLADA/>", &[COLLADA_GEOMETRY_DECODER.clone()], None);
        assert_eq!(
            original
                .diagnostics
                .read()
                .unwrap()
                .iter()
                .map(|diagnostic| diagnostic.kind.as_str())
                .collect::<Vec<_>>(),
            ["collada.invalid-document"]
        );
        assert!(original.document.read().unwrap().meshes.is_empty());
        let order = Arc::new(RwLock::new(Vec::new()));
        let result = parse_collada_with_decoders(
            "<NOTCOLLADA/>",
            &[probe("must_not_run", &order, None)],
            None,
        );
        assert!(order.read().unwrap().is_empty());
        let diagnostics = result.diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "collada.invalid-document");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(diagnostics[0].origin, "parseCollada");
        assert!(diagnostics[0].detail.is_none());
        let document = result.document.read().unwrap();
        assert!(document.meshes.is_empty());
        assert!(document.scenes.is_empty());
        assert!(document.metadata.is_none());
    }
}
