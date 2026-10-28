use std::sync::{Arc, RwLock};

use crate::support::{font_options, font_view};
use flight_buffer::{ArrayBufferViewKind, create_array_buffer_view, get_array_buffer_storage};
use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_entity::{allocate_entity, get_entity_uid, set_entity_uid};
use flight_font::{
    GlyphOutlineMetrics, GlyphOutlineSource,
    allocate_glyph_rasterizer_backend_from_glyph_outline_source,
};
use flight_font_formats::contract::*;
use flight_path::{PathWinding, create_path};

fn cff2_only_font() -> Box<[u8]> {
    let mut font = create_synthetic_font(Some(&SyntheticFontOptions {
        flavor: Some(SyntheticFontFlavor::OpenType),
        ..font_options()
    }));
    let directory = read_sfnt_table_directory(&font).unwrap();
    let index = directory
        .table_order
        .iter()
        .position(|tag| tag == "CFF ")
        .unwrap();
    font[12 + index * 16..16 + index * 16].copy_from_slice(b"CFF2");
    return font;
}
fn malformed_units_font() -> Box<[u8]> {
    let mut font = create_synthetic_font(None);
    let directory = read_sfnt_table_directory(&font).unwrap();
    let at = directory.tables.get("head").unwrap().offset + 18;
    font[at..at + 2].copy_from_slice(&0u16.to_be_bytes());
    return font;
}
fn woff2_bytes() -> Box<[u8]> {
    let mut bytes = vec![0; 20];
    bytes[..4].copy_from_slice(b"wOF2");
    return bytes.into_boxed_slice();
}
fn source_from_options(options: Option<&SyntheticFontOptions>) -> Arc<GlyphOutlineSource> {
    return create_glyph_outline_source_from_open_type_font(
        &font_view(create_synthetic_font(options)),
        &SDK_HOST_DECOMPRESS_DEFLATE,
        None,
    )
    .unwrap();
}

mod create_glyph_outline_source_from_open_type_font {
    use super::*;
    #[test]
    fn validates_the_kind_of_the_retained_input_window() {
        let mut view = font_view(create_synthetic_font(None));
        view.kind = ArrayBufferViewKind::DataView;
        let thrown = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            create_glyph_outline_source_from_open_type_font(
                &view,
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None,
            );
        }))
        .unwrap_err();
        assert_eq!(
            thrown
                .downcast::<flight_entity::FlightError>()
                .unwrap()
                .kind,
            flight_entity::FlightErrorKind::TypeError
        );
    }
    #[test]
    fn produces_a_source_from_a_well_formed_true_type_font() {
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(create_synthetic_font(None)),
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_some()
        );
    }
    #[test]
    fn reports_design_unit_metrics_with_positive_descent() {
        let source = source_from_options(Some(&SyntheticFontOptions {
            units_per_em: Some(2048.0),
            ..font_options()
        }));
        assert_eq!(
            *(source.get_glyph_outline_metrics)(),
            GlyphOutlineMetrics {
                ascent: 800.0,
                descent: 200.0,
                line_gap: 100.0,
                units_per_em: 2048.0
            }
        );
    }
    #[test]
    fn maps_covered_codepoints_and_sentinels_uncovered_ones() {
        let source = source_from_options(Some(&SyntheticFontOptions {
            codepoints: Some(vec![(65.0, 1.0)]),
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(100.0)]),
            ..font_options()
        }));
        assert_eq!((source.get_glyph_outline_index_for_code_point)(65), 1);
        assert_eq!((source.get_glyph_outline_index_for_code_point)(66), -1);
    }
    #[test]
    fn reads_a_square_with_y_negated_to_the_downward_convention() {
        let source = source_from_options(Some(&SyntheticFontOptions {
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(100.0)]),
            ..font_options()
        }));
        let mut path = create_path(flight_path::PathWinding::NonZero);
        path.winding = PathWinding::EvenOdd;
        assert!((source.get_glyph_outline)(&mut path, 1));
        assert_eq!(path.commands, [1, 2, 2, 2, 7]);
        assert_eq!(
            path.data,
            [0.0, -0.0, 100.0, -0.0, 100.0, -100.0, 0.0, -100.0]
        );
    }
    #[test]
    fn returns_true_with_an_empty_path_for_a_blank_glyph() {
        let source = source_from_options(Some(&SyntheticFontOptions {
            glyphs: Some(vec![empty_synthetic_glyph()]),
            ..font_options()
        }));
        let mut path = create_path(flight_path::PathWinding::NonZero);
        assert!((source.get_glyph_outline)(&mut path, 0));
        assert!(path.commands.is_empty());
    }
    #[test]
    fn returns_false_for_glyph_indices_the_font_does_not_have() {
        let source = source_from_options(None);
        assert!(!(source.get_glyph_outline)(
            &mut create_path(flight_path::PathWinding::NonZero),
            99
        ));
        assert!(!(source.get_glyph_outline)(
            &mut create_path(flight_path::PathWinding::NonZero),
            -1
        ));
    }
    #[test]
    fn reports_each_glyph_its_own_advance() {
        let source = source_from_options(Some(&SyntheticFontOptions {
            advances: Some(vec![300.0, 750.0]),
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(50.0)]),
            ..font_options()
        }));
        assert_eq!((source.get_glyph_outline_advance)(0), 300.0);
        assert_eq!((source.get_glyph_outline_advance)(1), 750.0);
    }
    #[test]
    fn repeats_the_final_long_metric_advance() {
        let source = source_from_options(Some(&SyntheticFontOptions {
            advances: Some(vec![600.0]),
            glyphs: Some(vec![
                empty_synthetic_glyph(),
                square_synthetic_glyph(10.0),
                square_synthetic_glyph(20.0),
            ]),
            ..font_options()
        }));
        assert_eq!((source.get_glyph_outline_advance)(1), 600.0);
        assert_eq!((source.get_glyph_outline_advance)(2), 600.0);
    }
    #[test]
    fn returns_null_for_nonfont_bytes_and_empty_input() {
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].into_boxed_slice()),
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_none()
        );
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(vec![].into_boxed_slice()),
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_none()
        );
    }
    #[test]
    fn produces_a_source_from_cff_outline_fonts() {
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(create_synthetic_font(Some(&SyntheticFontOptions {
                    flavor: Some(SyntheticFontFlavor::OpenType),
                    ..font_options()
                }))),
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_some()
        );
    }
    #[test]
    fn reads_cff_cubic_outlines_end_to_end() {
        let source = source_from_options(Some(&SyntheticFontOptions {
            flavor: Some(SyntheticFontFlavor::OpenType),
            charstrings: Some(vec![
                vec![14].into_boxed_slice(),
                vec![139, 139, 21, 149, 139, 149, 149, 139, 149, 8, 14].into_boxed_slice(),
            ]),
            ..font_options()
        }));
        let mut path = create_path(flight_path::PathWinding::NonZero);
        assert!((source.get_glyph_outline)(&mut path, 1));
        assert_eq!(path.commands, [1, 6, 7]);
    }
    #[test]
    fn resolves_identical_subroutine_indices_against_distinct_cid_pools() {
        let call = vec![139, 139, 21, 32, 10, 14].into_boxed_slice();
        let source = source_from_options(Some(&SyntheticFontOptions {
            charstrings: Some(vec![call.clone(), call]),
            cid: Some(SyntheticCidOptions {
                fd_select: vec![0.0, 1.0],
                pools: vec![
                    vec![vec![149, 139, 5, 11].into_boxed_slice()],
                    vec![vec![139, 149, 5, 11].into_boxed_slice()],
                ],
            }),
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..font_options()
        }));
        let mut first = create_path(flight_path::PathWinding::NonZero);
        let mut second = create_path(flight_path::PathWinding::NonZero);
        assert!((source.get_glyph_outline)(&mut first, 0));
        assert!((source.get_glyph_outline)(&mut second, 1));
        assert_ne!(first.data, second.data);
        assert_eq!(first.data, [0.0, -0.0, 10.0, -0.0]);
        assert_eq!(second.data, [0.0, -0.0, 0.0, -10.0]);
    }
    #[test]
    fn reads_woff_outlines_from_rebuilt_sfnt_bytes() {
        let woff = encode_synthetic_woff(
            &create_synthetic_font(Some(&SyntheticFontOptions {
                glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(100.0)]),
                ..font_options()
            })),
            None,
        );
        let source = create_glyph_outline_source_from_open_type_font(
            &font_view(woff),
            &SDK_HOST_DECOMPRESS_DEFLATE,
            None,
        )
        .unwrap();
        let mut path = create_path(flight_path::PathWinding::NonZero);
        assert!((source.get_glyph_outline)(&mut path, 1));
        assert_eq!(
            path.data,
            [0.0, -0.0, 100.0, -0.0, 100.0, -100.0, 0.0, -100.0]
        );
    }
    #[test]
    fn reads_cff_fonts_through_woff() {
        let woff = encode_synthetic_woff(
            &create_synthetic_font(Some(&SyntheticFontOptions {
                flavor: Some(SyntheticFontFlavor::OpenType),
                ..font_options()
            })),
            None,
        );
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(woff),
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_some()
        );
    }
    #[test]
    fn keeps_the_source_missing_outline_reason_when_cff_is_omitted() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            flavor: Some(SyntheticFontFlavor::OpenType),
            omit_table: Some("CFF ".to_string()),
            ..font_options()
        }));
        assert_eq!(
            explain_open_type_font(&font, &SDK_HOST_DECOMPRESS_DEFLATE).reason,
            OpenTypeFontExplanationReason::MissingRequiredTable
        );
    }
    #[test]
    fn returns_null_when_any_required_table_is_missing() {
        for table in ["cmap", "head", "hhea", "hmtx", "maxp", "loca", "glyf"] {
            let font = create_synthetic_font(Some(&SyntheticFontOptions {
                omit_table: Some(table.to_string()),
                ..font_options()
            }));
            assert!(
                create_glyph_outline_source_from_open_type_font(
                    &font_view(font),
                    &SDK_HOST_DECOMPRESS_DEFLATE,
                    None
                )
                .is_none()
            );
        }
    }
    #[test]
    fn returns_null_for_truncated_views_even_when_the_backing_buffer_contains_the_tail() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(100.0)]),
            ..font_options()
        }));
        let original = font_view(font);
        let truncated = create_array_buffer_view(
            &original.buffer,
            0,
            original.byte_length - 8,
            ArrayBufferViewKind::Uint8Array,
        )
        .unwrap();
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &truncated,
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_none()
        );
    }
    #[test]
    fn retains_the_original_sliced_byte_allocation_and_metrics_object_and_is_an_entity() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            glyphs: Some(vec![square_synthetic_glyph(100.0)]),
            ..font_options()
        }));
        let directory = read_sfnt_table_directory(&font).unwrap();
        let coordinate = directory.tables.get("glyf").unwrap().offset + 18;
        let mut backing = vec![91, 92, 93];
        backing.extend_from_slice(&font);
        backing.push(94);
        let owner = font_view(backing.into_boxed_slice());
        let input = create_array_buffer_view(
            &owner.buffer,
            3,
            font.len(),
            ArrayBufferViewKind::Uint8Array,
        )
        .unwrap();
        let mut source = create_glyph_outline_source_from_open_type_font(
            &input,
            &SDK_HOST_DECOMPRESS_DEFLATE,
            None,
        )
        .unwrap();
        set_entity_uid(
            Arc::get_mut(&mut source).unwrap(),
            "font-source".to_string(),
        );
        assert_eq!(
            get_entity_uid(Arc::get_mut(&mut source).unwrap()),
            "font-source"
        );
        let metrics = (source.get_glyph_outline_metrics)();
        assert!(Arc::ptr_eq(&metrics, &(source.get_glyph_outline_metrics)()));
        let mut before = create_path(flight_path::PathWinding::NonZero);
        assert!((source.get_glyph_outline)(&mut before, 0));
        get_array_buffer_storage(&owner.buffer).write().unwrap()
            [3 + coordinate..3 + coordinate + 2]
            .copy_from_slice(&10u16.to_be_bytes());
        drop(input);
        let mut after = create_path(flight_path::PathWinding::NonZero);
        assert!((source.get_glyph_outline)(&mut after, 0));
        assert_eq!(before.data[0], 0.0);
        assert_eq!(after.data[0], 10.0);
        let backend =
            allocate_glyph_rasterizer_backend_from_glyph_outline_source(Arc::clone(&source));
        assert!(Arc::ptr_eq(
            &source,
            &backend.provider.downcast::<GlyphOutlineSource>().unwrap()
        ));
    }
    #[test]
    fn keeps_woff2_unsupported_at_the_factory_while_lowlevel_decoding_remains_available() {
        let font = create_synthetic_font(None);
        let wrapped = encode_synthetic_woff2(&font, None);
        let identity: flight_compression::Decompressor =
            Arc::new(|bytes, _, _| Some(bytes.to_vec().into_boxed_slice()));
        assert!(read_woff2_font(&wrapped, Some(&identity), None).is_some());
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(wrapped.clone()),
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_none()
        );
        assert_eq!(
            explain_open_type_font(&wrapped, &SDK_HOST_DECOMPRESS_DEFLATE).reason,
            OpenTypeFontExplanationReason::UnsupportedContainer
        );
    }
}

mod explain_open_type_font {
    use super::*;
    #[test]
    fn accepts_a_font_the_producer_accepts() {
        let font = create_synthetic_font(None);
        let explanation = explain_open_type_font(&font, &SDK_HOST_DECOMPRESS_DEFLATE);
        assert!(explanation.accepted);
        assert_eq!(explanation.reason, OpenTypeFontExplanationReason::Ok);
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(font),
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_some()
        );
    }
    #[test]
    fn each_rejection_reason_agrees_with_the_producer_on_the_same_bytes() {
        let cases = [
            (
                OpenTypeFontExplanationReason::TooShort,
                vec![0, 1, 0, 0].into_boxed_slice(),
            ),
            (
                OpenTypeFontExplanationReason::Unrecognized,
                vec![0; 20].into_boxed_slice(),
            ),
            (
                OpenTypeFontExplanationReason::UnsupportedContainer,
                woff2_bytes(),
            ),
            (
                OpenTypeFontExplanationReason::MissingRequiredTable,
                create_synthetic_font(Some(&SyntheticFontOptions {
                    omit_table: Some("cmap".to_string()),
                    ..font_options()
                })),
            ),
            (
                OpenTypeFontExplanationReason::UnsupportedOutlines,
                cff2_only_font(),
            ),
            (
                OpenTypeFontExplanationReason::MalformedTable,
                malformed_units_font(),
            ),
        ];
        for (reason, bytes) in cases {
            let explanation = explain_open_type_font(&bytes, &SDK_HOST_DECOMPRESS_DEFLATE);
            assert_eq!(explanation.reason, reason);
            assert!(!explanation.accepted);
            assert!(
                create_glyph_outline_source_from_open_type_font(
                    &font_view(bytes),
                    &SDK_HOST_DECOMPRESS_DEFLATE,
                    None
                )
                .is_none()
            );
        }
    }
    #[test]
    fn accepts_with_ok_and_the_producer_returns_a_source() {
        let font = create_synthetic_font(None);
        assert_eq!(
            explain_open_type_font(&font, &SDK_HOST_DECOMPRESS_DEFLATE).reason,
            OpenTypeFontExplanationReason::Ok
        );
        assert!(explain_open_type_font(&font, &SDK_HOST_DECOMPRESS_DEFLATE).accepted);
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(font),
                &SDK_HOST_DECOMPRESS_DEFLATE,
                None
            )
            .is_some()
        );
    }
    #[test]
    fn reports_the_recognized_container_on_success() {
        assert_eq!(
            explain_open_type_font(&create_synthetic_font(None), &SDK_HOST_DECOMPRESS_DEFLATE)
                .format,
            "truetype"
        );
    }
    #[test]
    fn accepts_readable_cff_fonts() {
        let explanation = explain_open_type_font(
            &create_synthetic_font(Some(&SyntheticFontOptions {
                flavor: Some(SyntheticFontFlavor::OpenType),
                ..font_options()
            })),
            &SDK_HOST_DECOMPRESS_DEFLATE,
        );
        assert_eq!(explanation.reason, OpenTypeFontExplanationReason::Ok);
        assert!(explanation.accepted);
    }
    #[test]
    fn names_each_missing_required_table() {
        for table in ["cmap", "hmtx", "loca"] {
            let font = create_synthetic_font(Some(&SyntheticFontOptions {
                omit_table: Some(table.to_string()),
                ..font_options()
            }));
            let explanation = explain_open_type_font(&font, &SDK_HOST_DECOMPRESS_DEFLATE);
            assert_eq!(explanation.table, table);
            assert_eq!(
                explanation.reason,
                OpenTypeFontExplanationReason::MissingRequiredTable
            );
        }
    }
    #[test]
    fn names_missing_glyf_when_no_charstring_table_can_replace_it() {
        let explanation = explain_open_type_font(
            &create_synthetic_font(Some(&SyntheticFontOptions {
                omit_table: Some("glyf".to_string()),
                ..font_options()
            })),
            &SDK_HOST_DECOMPRESS_DEFLATE,
        );
        assert_eq!(
            explanation.reason,
            OpenTypeFontExplanationReason::MissingRequiredTable
        );
        assert_eq!(explanation.table, "glyf");
    }
    #[test]
    fn distinguishes_unrecognized_bytes_from_unsupported_containers() {
        assert_eq!(
            explain_open_type_font(&[0; 20], &SDK_HOST_DECOMPRESS_DEFLATE).reason,
            OpenTypeFontExplanationReason::Unrecognized
        );
        let explanation = explain_open_type_font(&woff2_bytes(), &SDK_HOST_DECOMPRESS_DEFLATE);
        assert_eq!(
            explanation.reason,
            OpenTypeFontExplanationReason::UnsupportedContainer
        );
        assert_eq!(explanation.format, "woff2");
    }
    #[test]
    fn reports_too_short_below_the_header_size() {
        assert_eq!(
            explain_open_type_font(&[0, 1, 0, 0], &SDK_HOST_DECOMPRESS_DEFLATE).reason,
            OpenTypeFontExplanationReason::TooShort
        );
    }
    #[test]
    fn compares_declared_tables_with_readable_tables_after_truncation() {
        let font = create_synthetic_font(None);
        let whole = explain_open_type_font(&font, &SDK_HOST_DECOMPRESS_DEFLATE);
        assert_eq!(whole.table_count, whole.readable_table_count);
        let truncated =
            explain_open_type_font(&font[..font.len() - 8], &SDK_HOST_DECOMPRESS_DEFLATE);
        assert!(truncated.readable_table_count < truncated.table_count);
    }
}

mod get_open_type_font_explanation_reason_string {
    use super::*;
    #[test]
    fn returns_the_complete_seven_reason_string_table() {
        for (value, text) in [
            (
                OpenTypeFontExplanationReason::MalformedTable,
                "malformed-table",
            ),
            (
                OpenTypeFontExplanationReason::MissingRequiredTable,
                "missing-required-table",
            ),
            (OpenTypeFontExplanationReason::Ok, "ok"),
            (OpenTypeFontExplanationReason::TooShort, "too-short"),
            (OpenTypeFontExplanationReason::Unrecognized, "unrecognized"),
            (
                OpenTypeFontExplanationReason::UnsupportedContainer,
                "unsupported-container",
            ),
            (
                OpenTypeFontExplanationReason::UnsupportedOutlines,
                "unsupported-outlines",
            ),
        ] {
            assert_eq!(get_open_type_font_explanation_reason_string(value), text);
        }
    }
}

mod initialize_glyph_outline_source_from_open_type_font {
    use super::*;
    #[test]
    fn initializes_all_callbacks_and_retains_original_metrics_arrays_map_and_bytes() {
        let bytes = font_view(create_synthetic_font(Some(&SyntheticFontOptions {
            glyphs: Some(vec![square_synthetic_glyph(10.0)]),
            ..font_options()
        })));
        let raw = {
            let storage = get_array_buffer_storage(&bytes.buffer);
            let data = storage.read().unwrap();
            data.to_vec()
        };
        let directory = read_sfnt_table_directory(&raw).unwrap();
        let advances = Arc::new(RwLock::new(
            read_open_type_advances(&raw, &directory, 1).unwrap(),
        ));
        let ranges = Arc::new(RwLock::new(
            read_open_type_glyph_ranges(&raw, &directory, 1, 1).unwrap(),
        ));
        let codepoints = Arc::new(RwLock::new(
            read_open_type_codepoint_map(&raw, &directory).unwrap(),
        ));
        let metrics = Arc::new(read_open_type_metrics(&raw, &directory).unwrap());
        let mut tables = OpenTypeFontTables {
            advances: Arc::clone(&advances),
            bytes,
            cff: None,
            codepoints: Arc::clone(&codepoints),
            directory: Arc::new(directory),
            glyph_count: 1,
            metrics: Arc::clone(&metrics),
            ranges: Some(Arc::clone(&ranges)),
        };
        let mut out: GlyphOutlineSource = allocate_entity();
        set_entity_uid(&mut out, "initialized".to_string());
        initialize_glyph_outline_source_from_open_type_font(&mut out, &tables);
        assert_eq!(get_entity_uid(&mut out), "initialized");
        assert!(Arc::ptr_eq(&metrics, &(out.get_glyph_outline_metrics)()));
        assert_eq!((out.get_glyph_outline_advance)(0), 500.0);
        advances.write().unwrap()[0] = 777;
        assert_eq!((out.get_glyph_outline_advance)(0), 777.0);
        assert_eq!((out.get_glyph_outline_advance)(-1), 0.0);
        assert_eq!((out.get_glyph_outline_advance)(99), 0.0);
        codepoints.write().unwrap().insert(65, 0);
        assert_eq!((out.get_glyph_outline_index_for_code_point)(65), 0);
        let mut path = create_path(flight_path::PathWinding::NonZero);
        assert!((out.get_glyph_outline)(&mut path, 0));
        assert!(!path.commands.is_empty());
        ranges.write().unwrap()[1] = 0;
        assert!((out.get_glyph_outline)(&mut path, 0));
        assert!(path.commands.is_empty());
        tables.bytes.kind = ArrayBufferViewKind::DataView;
        let thrown = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            initialize_glyph_outline_source_from_open_type_font(&mut out, &tables);
        }))
        .unwrap_err();
        assert_eq!(
            thrown
                .downcast::<flight_entity::FlightError>()
                .unwrap()
                .kind,
            flight_entity::FlightErrorKind::TypeError
        );
        assert_eq!((out.get_glyph_outline_advance)(0), 777.0);
    }
}

mod parse_open_type_font_explanation_reason {
    use super::*;
    #[test]
    fn parses_only_the_exact_seven_reason_spellings() {
        for (value, text) in [
            (
                OpenTypeFontExplanationReason::MalformedTable,
                "malformed-table",
            ),
            (
                OpenTypeFontExplanationReason::MissingRequiredTable,
                "missing-required-table",
            ),
            (OpenTypeFontExplanationReason::Ok, "ok"),
            (OpenTypeFontExplanationReason::TooShort, "too-short"),
            (OpenTypeFontExplanationReason::Unrecognized, "unrecognized"),
            (
                OpenTypeFontExplanationReason::UnsupportedContainer,
                "unsupported-container",
            ),
            (
                OpenTypeFontExplanationReason::UnsupportedOutlines,
                "unsupported-outlines",
            ),
        ] {
            assert_eq!(parse_open_type_font_explanation_reason(text), Some(value));
        }
        for invalid in ["", "OK", "missing_required_table", "unsupported"] {
            assert_eq!(parse_open_type_font_explanation_reason(invalid), None);
        }
    }
}
