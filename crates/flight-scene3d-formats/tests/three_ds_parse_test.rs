use super::three_ds_test_helper::*;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d_formats::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

mod pack_three_ds_color {
    use super::*;
    #[test]
    fn packs_srgb_channels_alpha_rounding_and_source_clamps_as_unsigned_rgba() {
        assert_eq!(pack_three_ds_color(&[1.0, 0.0, 0.0], None), 0xff0000ff);
        assert_eq!(pack_three_ds_color(&[0.0, 1.0, 0.0], None), 0x00ff00ff);
        assert_eq!(pack_three_ds_color(&[0.0, 0.0, 1.0], None), 0x0000ffff);
        assert_eq!(pack_three_ds_color(&[1.0; 3], Some(0.5)), 0xffffff80);
        assert_eq!(
            pack_three_ds_color(&[2.0, -1.0, f32::NAN], Some(0.0)),
            0xff000000
        );
    }
}

mod parse_color_chunk {
    use super::*;
    #[test]
    fn reads_float_or_byte_color_and_skips_unknown_short_and_malformed_chunks() {
        let bytes: Vec<u8> = [0.25f32, 0.5, 0.75]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let chunk = write_chunk(THREE_DS_COLOR_FLOAT, &bytes);
        assert_eq!(
            parse_color_chunk(&chunk, 0, chunk.len()),
            Some([0.25, 0.5, 0.75])
        );
        let chunk = write_chunk(THREE_DS_COLOR_BYTE, &[204, 102, 51]);
        assert_eq!(
            parse_color_chunk(&chunk, 0, chunk.len()),
            Some([204.0 / 255.0, 102.0 / 255.0, 51.0 / 255.0])
        );
        for chunk in [
            write_chunk(0x9999, &[]),
            write_chunk(THREE_DS_COLOR_FLOAT, &[0; 4]),
            vec![0; 6].into_boxed_slice(),
        ] {
            assert_eq!(parse_color_chunk(&chunk, 0, chunk.len()), None);
        }
    }
}

mod parse_three_ds_document_with_dispatch {
    use super::*;
    #[test]
    fn rejects_small_or_wrong_main_input_and_empty_dispatch_has_no_hidden_default() {
        for bytes in [vec![1, 2, 3].into_boxed_slice(), write_chunk(0x9999, &[])] {
            let mut diagnostics = Vec::new();
            let document =
                parse_three_ds_document_with_dispatch(&bytes, Some(&mut diagnostics), &Vec::new());
            assert!(document.meshes.is_empty());
            assert!(document.nodes.is_empty());
            assert!(document.materials.is_empty());
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
            assert_eq!(diagnostics[0].origin, "parse3ds");
        }
        let bytes =
            build_minimal_three_ds(&[write_object_chunk("unclaimed", THREE_DS_TRIMESH, &[])]);
        let mut diagnostics = Vec::new();
        let document =
            parse_three_ds_document_with_dispatch(&bytes, Some(&mut diagnostics), &Vec::new());
        assert!(document.meshes.is_empty());
        assert_eq!(diagnostics[0].kind, "3ds.non-entity-object");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Skip);
    }

    #[test]
    fn walks_custom_chunks_and_builds_each_original_handler_once_in_dispatch_map_order() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let handler = |name: &'static str, chunk_ids: Vec<u16>| {
            let collect_events = events.clone();
            let build_events = events.clone();
            return Arc::new(RwLock::new(ThreeDsChunkHandler {
                chunk_ids,
                collect: Arc::new(move |state, _view, offset, end, object_name| {
                    assert!(end >= offset + 6);
                    collect_events
                        .lock()
                        .unwrap()
                        .push(format!("collect:{name}:{object_name}"));
                    assert!(state.document.meshes.is_empty());
                }),
                build: Some(Arc::new(move |state| {
                    build_events.lock().unwrap().push(format!("build:{name}"));
                    state.document.scenes[0].name = Some(name.to_string());
                })),
            }));
        };
        let first = handler("first", vec![0x8888, 0x8889]);
        let last = handler("last", vec![0x8888, 0x8890]);
        let dispatch = {
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &[first, last]);
            output
        };
        let bytes = build_minimal_three_ds(&[
            write_object_chunk("Box", 0x8888, &[]),
            write_chunk(0x8889, &[]),
            write_chunk(0x8890, &[]),
        ]);
        let document = parse_three_ds_document_with_dispatch(&bytes, None, &dispatch);
        assert_eq!(
            *events.lock().unwrap(),
            [
                "collect:last:Box",
                "collect:first:",
                "collect:last:",
                "build:last",
                "build:first"
            ]
        );
        assert_eq!(document.scenes[0].name.as_deref(), Some("first"));
    }

    #[test]
    fn stops_on_short_or_overrunning_chunks_and_aggregates_before_returning_partial_state() {
        for length in [0, 1, 3, 5, 100] {
            let mut child = write_chunk(THREE_DS_OBJECT, &[]);
            child[2..6].copy_from_slice(&(length as u32).to_le_bytes());
            let bytes = write_chunk(THREE_DS_MAIN, &child);
            let mut diagnostics = Vec::new();
            parse_three_ds_document_with_dispatch(&bytes, Some(&mut diagnostics), &Vec::new());
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, "3ds.chunk-exceeds-parent");
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        }
        let mut child = write_chunk(0x8888, &[]);
        child[2..6].copy_from_slice(&100u32.to_le_bytes());
        let mut body = b"Box\0".to_vec();
        body.extend_from_slice(&child);
        let bytes = build_minimal_three_ds(&[
            write_chunk(THREE_DS_OBJECT, &body),
            write_chunk(THREE_DS_OBJECT, &body),
        ]);
        let mut diagnostics = Vec::new();
        parse_three_ds_document_with_dispatch(&bytes, Some(&mut diagnostics), &Vec::new());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "3ds.subchunk-exceeds-object");
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("count"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
    }

    #[test]
    fn named_object_stops_after_first_claim_and_latin1_names_advance_by_wire_bytes() {
        let names = Arc::new(Mutex::new(Vec::new()));
        let output = names.clone();
        let handler = Arc::new(RwLock::new(ThreeDsChunkHandler {
            chunk_ids: vec![0x8888, 0x8889],
            build: None,
            collect: Arc::new(move |_, _, _, _, name| {
                output.lock().unwrap().push(name.to_string())
            }),
        }));
        let mut object = vec![0xe9, 0];
        object.extend_from_slice(&write_chunk(0x8888, &[]));
        object.extend_from_slice(&write_chunk(0x8889, &[]));
        let bytes = build_minimal_three_ds(&[write_chunk(THREE_DS_OBJECT, &object)]);
        let mut framed = vec![9; 11];
        framed.extend_from_slice(&bytes);
        framed.extend_from_slice(&[8; 7]);
        parse_three_ds_document_with_dispatch(&framed[11..11 + bytes.len()], None, &{
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &[handler]);
            output
        });
        assert_eq!(*names.lock().unwrap(), ["é"]);
    }
}

mod read_chunk_end {
    use super::*;
    #[test]
    fn returns_exact_unsigned_length_endpoints_without_colliding_with_the_negative_sentinel_or_allocating_large_buffers()
     {
        for length in [0x80000000_u32, 0xffffffff_u32] {
            for cursor in [0_usize, 2] {
                let mut header = vec![0; cursor + 6];
                header[cursor + 2..cursor + 6].copy_from_slice(&length.to_le_bytes());
                let end = cursor + length as usize;
                assert_eq!(
                    i64::from(read_chunk_end(&header, cursor, end)),
                    cursor as i64 + i64::from(length)
                );
                assert_eq!(read_chunk_end(&header, cursor, end - 1), -1);
                assert_eq!(header.len(), cursor + 6);
            }
        }
        let error =
            std::panic::catch_unwind(|| read_chunk_end(&[0; 5], 0, usize::MAX)).unwrap_err();
        let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
        assert_eq!(
            error.message,
            "Offset is outside the bounds of the DataView"
        );
    }

    #[test]
    fn preserves_exact_end_and_negative_one_sentinel_for_short_or_overrunning_lengths() {
        let chunk = write_chunk(0x1234, &[0; 4]);
        assert_eq!(read_chunk_end(&chunk, 0, chunk.len()), 10);
        assert_eq!(read_chunk_end(&chunk, 0, 6), -1);
        for length in 0u32..6 {
            let mut chunk = chunk.clone();
            chunk[2..6].copy_from_slice(&length.to_le_bytes());
            assert_eq!(read_chunk_end(&chunk, 0, 10), -1);
        }
    }
}

mod read_chunk_length {
    use super::*;
    #[test]
    fn reads_little_endian_length_relative_to_the_supplied_view_and_preserves_range_error() {
        let chunk = write_chunk(0x1234, &[0; 10]);
        let mut framed = vec![99; 5];
        framed.extend_from_slice(&chunk);
        assert_eq!(read_chunk_length(&framed[5..], 0), 16);
        let error = std::panic::catch_unwind(|| read_chunk_length(&[0; 5], 0)).unwrap_err();
        let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
    }
}

mod read_null_terminated_string {
    use super::*;
    #[test]
    fn reads_until_null_or_end_and_maps_each_wire_byte_to_its_source_character() {
        assert_eq!(read_null_terminated_string(b"Box\0\xff", 0, 5), "Box");
        assert_eq!(read_null_terminated_string(b"AB", 0, 2), "AB");
        assert_eq!(read_null_terminated_string(&[0xff, 0], 0, 2), "ÿ");
        assert_eq!(read_null_terminated_string(b"AB", 2, 2), "");
    }
}

mod tally_three_ds_drop {
    use super::*;
    #[test]
    fn keeps_first_detail_severity_and_insertion_order_while_counting_each_categorical_key() {
        tally_three_ds_drop(
            None,
            ImportDiagnosticSeverity::Drop,
            "test",
            "",
            HashMap::new(),
        );
        let mut tallies = Vec::new();
        for (kind, discriminator, reason, severity) in [
            ("kind", "disc", "a", ImportDiagnosticSeverity::Drop),
            ("kind", "disc", "b", ImportDiagnosticSeverity::Recover),
            ("kind", "other", "c", ImportDiagnosticSeverity::Drop),
        ] {
            tally_three_ds_drop(
                Some(&mut tallies),
                severity,
                kind,
                discriminator,
                HashMap::from([(
                    "reason".to_string(),
                    ImportDiagnosticDetailValue::String(reason.to_string()),
                )]),
            );
        }
        assert_eq!(tallies.len(), 2);
        assert_eq!(tallies[0].key, "kind|disc");
        assert_eq!(tallies[0].value.count, 2);
        assert_eq!(tallies[0].value.severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            tallies[0].value.detail.get("reason"),
            Some(&ImportDiagnosticDetailValue::String("a".to_string()))
        );
    }
}
