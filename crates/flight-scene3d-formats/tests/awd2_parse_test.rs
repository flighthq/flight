use super::awd2_test_helper::{block, file};
use flight_compression::{
    CompressionFraming, HostDecompressDeflateCapability, HostDecompressLzmaCapability,
    SDK_HOST_DECOMPRESS_DEFLATE,
};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

fn compressed_input(payload: &[u8], method: u8) -> Ref<Box<Uint8Array>> {
    let mut bytes = file(&[]);
    bytes[7] = method;
    bytes[8..12].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    return Arc::new(RwLock::new(bytes.into_boxed_slice()));
}

mod create_scene3d_from_awd2 {
    use super::*;

    #[test]
    fn returns_an_empty_canonical_scene_for_rejected_or_empty_input_and_forwards_diagnostics() {
        for bytes in [vec![], file(&[])] {
            let input = Arc::new(RwLock::new(bytes.into_boxed_slice()));
            let diagnostics = Arc::new(RwLock::new(Vec::new()));
            let scene = create_scene3d_from_awd2(
                &input,
                &Awd2ParseOptions {
                    blocks: Vec::new(),
                    deflate: None,
                    lzma: None,
                },
                Some(&diagnostics),
            );
            assert!(
                {
                    let mut output = Vec::new();
                    flight_node::get_node_children(
                        &mut output,
                        &(scene.root.clone() as flight_node::NodeRef),
                    );
                    output
                }
                .is_empty()
            );
            assert!(scene.animations.is_empty());
            assert_eq!(
                diagnostics.read().unwrap().is_empty(),
                input.read().unwrap().len() >= 12
            );
        }
    }
}

mod parse_awd2 {
    use super::*;
    use flight_entity::get_entity_uid;

    #[test]
    fn rejects_compressed_input_through_both_document_and_scene_paths_when_the_requested_codec_is_absent_or_fails()
     {
        let failing = Arc::new(HostDecompressDeflateCapability {
            decompress: Arc::new(|_, _, _| None),
        });
        for (method, deflate, kind) in [
            (1, None, "awd2.compression-no-decompressor"),
            (2, None, "awd2.compression-no-decompressor"),
            (200, None, "awd2.compression-no-decompressor"),
            (1, Some(Some(failing)), "awd2.decompression-failed"),
        ] {
            let input = compressed_input(&[1, 2, 3], method);
            let options = Awd2ParseOptions {
                blocks: Vec::new(),
                deflate,
                lzma: None,
            };
            let document_diagnostics = Arc::new(RwLock::new(Vec::new()));
            let scene_diagnostics = Arc::new(RwLock::new(Vec::new()));
            let document = parse_awd2(&input, &options, Some(&document_diagnostics));
            let scene = create_scene3d_from_awd2(&input, &options, Some(&scene_diagnostics));
            let document = document.read().unwrap();
            assert!(document.nodes.is_empty());
            assert!(document.meshes.is_empty());
            assert!(document.animations.is_empty());
            assert!(document.scenes[0].root_nodes.is_empty());
            assert!(
                {
                    let mut output = Vec::new();
                    flight_node::get_node_children(
                        &mut output,
                        &(scene.root.clone() as flight_node::NodeRef),
                    );
                    output
                }
                .is_empty()
            );
            assert!(scene.animations.is_empty());
            let document_diagnostics = document_diagnostics.read().unwrap();
            let scene_diagnostics = scene_diagnostics.read().unwrap();
            assert_eq!(*document_diagnostics, *scene_diagnostics);
            assert_eq!(document_diagnostics.len(), 1);
            assert_eq!(document_diagnostics[0].kind, kind);
            assert_eq!(document_diagnostics[0].origin, "rehydrateAwd2Body");
            assert_eq!(
                document_diagnostics[0].severity,
                ImportDiagnosticSeverity::Reject
            );
            assert_eq!(
                document_diagnostics[0].detail.as_ref().unwrap()["compression"],
                ImportDiagnosticDetailValue::Number(method as f32)
            );
        }
    }

    #[test]
    fn validates_header_magic_and_major_version_before_compression_and_returns_all_document_tables()
    {
        let mut bad_magic = file(&[]);
        bad_magic[0] = 0x42;
        let mut awd3 = file(&[]);
        awd3[3] = 3;
        for (bytes, kind, origin) in [
            (vec![], "awd2.header-too-short", "parseAwd2"),
            (bad_magic, "awd2.bad-magic", "parseAwd2"),
            (awd3, "awd2.unsupported-version", "isAwd2Version"),
        ] {
            let diagnostics = Arc::new(RwLock::new(Vec::new()));
            let document = parse_awd2(
                &Arc::new(RwLock::new(bytes.into_boxed_slice())),
                &Awd2ParseOptions {
                    blocks: Vec::new(),
                    deflate: None,
                    lzma: None,
                },
                Some(&diagnostics),
            );
            let document = document.read().unwrap();
            assert!(document.animations.is_empty());
            assert!(document.cameras.is_empty());
            assert!(document.lights.is_empty());
            assert!(document.materials.is_empty());
            assert!(document.meshes.is_empty());
            assert!(document.nodes.is_empty());
            assert!(document.resources.is_empty());
            assert!(document.skins.is_empty());
            assert!(document.metadata.is_none());
            assert_eq!(document.scenes.len(), 1);
            assert!(document.scenes[0].root_nodes.is_empty());
            let diagnostics = diagnostics.read().unwrap();
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, kind);
            assert_eq!(diagnostics[0].origin, origin);
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
            if origin == "isAwd2Version" {
                assert_eq!(
                    diagnostics[0].detail.as_ref().unwrap()["version"],
                    ImportDiagnosticDetailValue::Number(3.0)
                );
            }
        }
    }

    #[test]
    fn defers_selected_blocks_until_the_first_pass_finishes_and_builds_in_stable_phase_order_without_hidden_families()
     {
        let seen = Arc::new(RwLock::new(Vec::<String>::new()));
        let mut handlers = Vec::new();
        for (label, kind, phase, deferred) in [
            ("late", 90, 4.0, false),
            ("early", 91, 0.0, false),
            ("deferred", 92, 1.0, true),
            ("same", 93, 1.0, false),
        ] {
            let parse_seen = seen.clone();
            let build_seen = seen.clone();
            handlers.push(Arc::new(RwLock::new(Awd2BlockHandler {
                block_types: vec![kind],
                build_phase: Some(phase),
                deferred: Some(deferred),
                parse: Arc::new(move |state, block| {
                    assert!(Arc::ptr_eq(&state.source, &block.source));
                    assert!(Arc::ptr_eq(&state.view, &block.view));
                    parse_seen
                        .write()
                        .unwrap()
                        .push(format!("parse:{label}:{}", block.block_id));
                }),
                build: Some(Arc::new(move |_| {
                    build_seen.write().unwrap().push(format!("build:{label}"))
                })),
            })));
        }
        let input = Arc::new(RwLock::new(
            file(&[
                block(92, 0, 1, &[]),
                block(90, 0, 2, &[]),
                block(91, 0, 3, &[]),
                block(93, 0, 4, &[]),
            ])
            .into_boxed_slice(),
        ));
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        parse_awd2(
            &input,
            &Awd2ParseOptions {
                blocks: handlers,
                deflate: None,
                lzma: None,
            },
            Some(&diagnostics),
        );
        assert_eq!(
            *seen.read().unwrap(),
            [
                "parse:late:2",
                "parse:early:3",
                "parse:same:4",
                "parse:deferred:1",
                "build:early",
                "build:deferred",
                "build:same",
                "build:late"
            ]
        );
        assert!(diagnostics.read().unwrap().is_empty());
    }

    #[test]
    fn tallies_unknown_core_and_extension_blocks_by_pair_after_deferred_parse_and_preserves_first_id_order()
     {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let handled = Arc::new(RwLock::new(Awd2BlockHandler {
            block_types: vec![81],
            build_phase: None,
            deferred: Some(true),
            build: None,
            parse: Arc::new(|state, _| {
                assert!(
                    state
                        .diagnostics
                        .as_ref()
                        .unwrap()
                        .read()
                        .unwrap()
                        .is_empty()
                );
            }),
        }));
        let bytes = file(&[
            block(200, 0, 10, &[]),
            block(81, 1, 11, &[]),
            block(200, 0, 12, &[]),
            block(81, 0, 13, &[]),
            block(81, 1, 14, &[]),
        ]);
        let document = parse_awd2(
            &Arc::new(RwLock::new(bytes.into_boxed_slice())),
            &Awd2ParseOptions {
                blocks: vec![handled],
                deflate: None,
                lzma: None,
            },
            Some(&diagnostics),
        );
        assert!(document.read().unwrap().nodes.is_empty());
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 2);
        for (crumb, kind, namespace, id) in [
            (&diagnostics[0], 200.0, 0.0, 10.0),
            (&diagnostics[1], 81.0, 1.0, 11.0),
        ] {
            assert_eq!(crumb.kind, "awd2.block-unhandled");
            assert_eq!(crumb.origin, "parseAwd2");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            let detail = crumb.detail.as_ref().unwrap();
            assert_eq!(
                detail["blockType"],
                ImportDiagnosticDetailValue::Number(kind)
            );
            assert_eq!(
                detail["namespace"],
                ImportDiagnosticDetailValue::Number(namespace)
            );
            assert_eq!(
                detail["firstBlockId"],
                ImportDiagnosticDetailValue::Number(id)
            );
            assert_eq!(detail["count"], ImportDiagnosticDetailValue::Number(2.0));
        }
    }

    #[test]
    fn stops_at_the_declared_body_end_and_drops_overruns_before_flushing_prior_unknown_counts() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let mut bytes = file(&[block(200, 0, 1, &[]), block(201, 0, 2, &[])]);
        bytes[30..34].copy_from_slice(&500_u32.to_le_bytes());
        parse_awd2(
            &Arc::new(RwLock::new(bytes.into_boxed_slice())),
            &Awd2ParseOptions {
                blocks: Vec::new(),
                deflate: None,
                lzma: None,
            },
            Some(&diagnostics),
        );
        assert_eq!(
            diagnostics
                .read()
                .unwrap()
                .iter()
                .map(|c| c.kind.as_str())
                .collect::<Vec<_>>(),
            ["awd2.block-length-past-end", "awd2.block-unhandled"]
        );
        let mut bytes = file(&[block(200, 0, 1, &[])]);
        bytes[8..12].copy_from_slice(&0_u32.to_le_bytes());
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        parse_awd2(
            &Arc::new(RwLock::new(bytes.into_boxed_slice())),
            &Awd2ParseOptions {
                blocks: Vec::new(),
                deflate: None,
                lzma: None,
            },
            Some(&diagnostics),
        );
        assert!(diagnostics.read().unwrap().is_empty());
    }

    #[test]
    fn reads_block_precision_flags_releases_callback_locks_and_retains_the_same_document_outside_the_parser()
     {
        let retained = Arc::new(RwLock::new(None));
        let retained_parse = retained.clone();
        let handler: Ref<Awd2BlockHandler> =
            Arc::new_cyclic(|weak: &std::sync::Weak<RwLock<Awd2BlockHandler>>| {
                let parse_weak = weak.clone();
                let build_weak = weak.clone();
                return RwLock::new(Awd2BlockHandler {
                    block_types: vec![90],
                    build_phase: Some(0.0),
                    deferred: None,
                    parse: Arc::new(move |state, block| {
                        assert!(parse_weak.upgrade().unwrap().try_write().is_ok());
                        assert!(state.source.try_write().is_ok());
                        assert!(state.document.try_write().is_ok());
                        assert!(block.geometry_wide);
                        assert!(block.matrix_wide);
                        assert_eq!(block.data_start, 23);
                        assert_eq!(block.data_end, 26);
                        let uid = get_entity_uid(state);
                        assert!(!uid.is_empty());
                        state.document.write().unwrap().scenes[0].name =
                            Some("original".to_string());
                        *retained_parse.write().unwrap() = Some(state.document.clone());
                    }),
                    build: Some(Arc::new(move |state| {
                        assert!(build_weak.upgrade().unwrap().try_write().is_ok());
                        state.document.write().unwrap().scenes[0].name = Some("built".to_string());
                    })),
                });
            });
        let mut bytes = file(&[block(90, 0, 1, &[1, 2, 3])]);
        bytes[18] = 3;
        let document = parse_awd2(
            &Arc::new(RwLock::new(bytes.into_boxed_slice())),
            &Awd2ParseOptions {
                blocks: vec![handler],
                deflate: None,
                lzma: None,
            },
            None,
        );
        let retained = retained.read().unwrap();
        let original = retained.as_ref().unwrap();
        assert!(Arc::ptr_eq(&document, original));
        assert_eq!(
            document.read().unwrap().scenes[0].name.as_deref(),
            Some("built")
        );
        original.write().unwrap().scenes[0].name = Some("after".to_string());
        assert_eq!(
            document.read().unwrap().scenes[0].name.as_deref(),
            Some("after")
        );
    }

    #[test]
    fn builds_each_list_entry_including_duplicates_and_shadowed_handlers_without_deduplicating_by_dispatch()
     {
        let seen = Arc::new(RwLock::new(Vec::new()));
        let a_seen = seen.clone();
        let b_seen = seen.clone();
        let a = Arc::new(RwLock::new(Awd2BlockHandler {
            block_types: vec![90],
            build_phase: None,
            deferred: None,
            parse: Arc::new(|_, _| panic!("shadowed parser")),
            build: Some(Arc::new(move |_| a_seen.write().unwrap().push("a"))),
        }));
        let b = Arc::new(RwLock::new(Awd2BlockHandler {
            block_types: vec![90],
            build_phase: None,
            deferred: None,
            parse: Arc::new(|_, _| {}),
            build: Some(Arc::new(move |_| b_seen.write().unwrap().push("b"))),
        }));
        let input = Arc::new(RwLock::new(
            file(&[block(90, 0, 1, &[])]).into_boxed_slice(),
        ));
        parse_awd2(
            &input,
            &Awd2ParseOptions {
                blocks: vec![a.clone(), a, b],
                deflate: None,
                lzma: None,
            },
            None,
        );
        assert_eq!(*seen.read().unwrap(), ["a", "a", "b"]);
    }
}

mod rehydrate_awd2_body {
    use super::*;

    #[test]
    fn retains_the_original_uncompressed_source_handle_and_aliases_its_view_window() {
        let original = Arc::new(RwLock::new(
            file(&[block(42, 0, 1, &[])]).into_boxed_slice(),
        ));
        let result = rehydrate_awd2_body(&original, None, None, None).unwrap();
        assert!(Arc::ptr_eq(&result.source, &original));
        assert!(Arc::ptr_eq(&result.view, &original));
        original.write().unwrap()[4] = 3;
        assert_eq!(result.source.read().unwrap()[4], 3);
    }

    #[test]
    fn routes_deflate_through_rfc1950_with_unknown_length_and_rewrites_only_the_rehydrated_header()
    {
        let body = block(42, 0, 7, &[]);
        let mut payload = vec![0xde, 0xad, 0xbe, 0xef];
        payload.extend_from_slice(&body);
        let input = compressed_input(&payload, 1);
        let input_for_codec = input.clone();
        let expected_payload = payload.clone();
        let slot = HostDecompressDeflateCapability {
            decompress: Arc::new(move |compressed, length, framing| {
                assert_eq!(compressed, &expected_payload);
                assert_eq!(length, 0);
                assert_eq!(framing, CompressionFraming::Rfc1950);
                input_for_codec.try_write().unwrap()[5] = 9;
                return Some(compressed[4..].to_vec().into_boxed_slice());
            }),
        };
        let result = rehydrate_awd2_body(&input, Some(&slot), None, None).unwrap();
        assert!(!Arc::ptr_eq(&result.source, &input));
        assert!(Arc::ptr_eq(&result.source, &result.view));
        let bytes = result.source.read().unwrap();
        assert_eq!(bytes[7], 0);
        assert_eq!(bytes[5], 9);
        assert_eq!(&bytes[8..12], &(body.len() as u32).to_le_bytes());
        assert_eq!(&bytes[12..], body);
        assert_eq!(input.read().unwrap()[7], 1);
        let counts = {
            let mut output = Vec::new();
            if flight_scene3d_formats::contract::collect_awd2_block_counts(
                &mut output,
                &input.read().unwrap(),
                Some(&HostDecompressDeflateCapability {
                    decompress: Arc::new(|compressed, _, _| {
                        Some(compressed[4..].to_vec().into_boxed_slice())
                    }),
                }),
                None,
            ) {
                Some(output)
            } else {
                None
            }
        }
        .unwrap();
        assert_eq!(counts[0].name, "Camera");
    }

    #[test]
    fn routes_lzma_through_raw_framing_and_clamps_the_compressed_span_to_the_declared_length() {
        let mut bytes = file(&[]);
        bytes[7] = 2;
        bytes[8..12].copy_from_slice(&3_u32.to_le_bytes());
        bytes.extend_from_slice(&[1, 2, 3, 99, 99]);
        let input = Arc::new(RwLock::new(bytes.into_boxed_slice()));
        let slot = HostDecompressLzmaCapability {
            decompress: Arc::new(|bytes, length, framing| {
                assert_eq!(bytes, &[1, 2, 3]);
                assert_eq!(length, 0);
                assert_eq!(framing, CompressionFraming::Raw);
                return Some(vec![9, 8].into_boxed_slice());
            }),
        };
        let result = rehydrate_awd2_body(&input, None, Some(&slot), None).unwrap();
        assert_eq!(&result.source.read().unwrap()[12..], &[9, 8]);
        input.write().unwrap()[8..12].copy_from_slice(&100_u32.to_le_bytes());
        let slot = HostDecompressLzmaCapability {
            decompress: Arc::new(|bytes, _, _| {
                assert_eq!(bytes, &[1, 2, 3, 99, 99]);
                return Some(vec![].into_boxed_slice());
            }),
        };
        assert!(rehydrate_awd2_body(&input, None, Some(&slot), None).is_some());
    }

    #[test]
    fn reports_missing_unknown_and_failing_codecs_as_distinct_rejects_and_stays_quiet_without_a_collector()
     {
        for method in [1, 2, 200] {
            let input = compressed_input(&[1, 2, 3], method);
            let diagnostics = Arc::new(RwLock::new(Vec::new()));
            assert!(rehydrate_awd2_body(&input, None, None, Some(&diagnostics)).is_none());
            let diagnostics = diagnostics.read().unwrap();
            assert_eq!(diagnostics.len(), 1);
            let crumb = &diagnostics[0];
            assert_eq!(crumb.kind, "awd2.compression-no-decompressor");
            assert_eq!(crumb.origin, "rehydrateAwd2Body");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Reject);
            assert_eq!(
                crumb.detail.as_ref().unwrap()["compression"],
                ImportDiagnosticDetailValue::Number(method as f32)
            );
            assert!(rehydrate_awd2_body(&input, None, None, None).is_none());
        }
        let slot = HostDecompressDeflateCapability {
            decompress: Arc::new(|_, _, _| None),
        };
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        assert!(
            rehydrate_awd2_body(
                &compressed_input(&[], 1),
                Some(&slot),
                None,
                Some(&diagnostics)
            )
            .is_none()
        );
        let diagnostics = diagnostics.read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "awd2.decompression-failed");
        assert_eq!(diagnostics[0].origin, "rehydrateAwd2Body");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
    }

    #[test]
    fn reconstructs_the_pinned_zlib_body_byte_for_byte_through_the_canonical_sdk_capability() {
        // Pinned awd2Parse.test.ts SKINNED_BODY_COMPRESSED; expected body independently inflated once with Python zlib.
        let compressed = include_bytes!("fixtures/awd2-skinned-body.zlib");
        let expected = include_bytes!("fixtures/awd2-skinned-body.bin");
        let input = compressed_input(compressed, 1);
        let result =
            rehydrate_awd2_body(&input, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None, None).unwrap();
        assert_eq!(&result.source.read().unwrap()[12..], expected);
        let counts = {
            let mut output = Vec::new();
            if flight_scene3d_formats::contract::collect_awd2_block_counts(
                &mut output,
                &input.read().unwrap(),
                Some(&SDK_HOST_DECOMPRESS_DEFLATE),
                None,
            ) {
                Some(output)
            } else {
                None
            }
        }
        .unwrap();
        assert!(counts.iter().any(|r| r.name == "Skeleton"));
        assert!(counts.iter().any(|r| r.name == "TriangleGeometry"));
    }
    #[test]
    fn constructs_independent_compressed_bodies_while_retaining_the_original_uncompressed_handle_and_prior_results()
     {
        let original = Arc::new(RwLock::new(file(&[]).into_boxed_slice()));
        let plain = rehydrate_awd2_body(&original, None, None, None).unwrap();
        assert!(Arc::ptr_eq(&plain.source, &original));
        assert!(Arc::ptr_eq(&plain.view, &original));
        let compressed = compressed_input(&[99], 1);
        let decoder = HostDecompressDeflateCapability {
            decompress: Arc::new(|_, _, _| Some(vec![7, 8].into_boxed_slice())),
        };
        let first = rehydrate_awd2_body(&compressed, Some(&decoder), None, None).unwrap();
        let second = rehydrate_awd2_body(&compressed, Some(&decoder), None, None).unwrap();
        assert!(!Arc::ptr_eq(&first.source, &compressed));
        assert!(!Arc::ptr_eq(&first.source, &second.source));
        assert!(Arc::ptr_eq(&first.source, &first.view));
        assert!(Arc::ptr_eq(&second.source, &second.view));
        assert_eq!(&first.source.read().unwrap()[12..], &[7, 8]);
        assert_eq!(&second.source.read().unwrap()[12..], &[7, 8]);
        assert!(rehydrate_awd2_body(&compressed, None, None, None).is_none());
        assert_eq!(&first.source.read().unwrap()[12..], &[7, 8]);
        assert!(Arc::ptr_eq(&plain.source, &original));
    }
}
