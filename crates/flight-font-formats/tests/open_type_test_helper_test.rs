use crate::support::font_options;
use flight_font_formats::*;

mod cff_operand {
    use super::*;
    #[test]
    fn offsets_the_one_byte_range_without_clamping() {
        assert_eq!(cff_operand(-107.0), 32.0);
        assert_eq!(cff_operand(107.0), 246.0);
        assert_eq!(cff_operand(1.5), 140.5);
    }
}

mod create_synthetic_font {
    use super::*;
    fn cmap_segments(entries: Vec<(f32, f32)>) -> (Vec<u16>, Vec<u16>) {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            codepoints: Some(entries),
            ..font_options()
        }));
        let directory = read_sfnt_table_directory(&font).unwrap();
        let table = directory.tables.get("cmap").unwrap().offset + 12;
        let count = u16::from_be_bytes(font[table + 6..table + 8].try_into().unwrap()) as usize / 2;
        let starts = table + 16 + count * 2;
        let deltas = starts + count * 2;
        return (
            (0..count)
                .map(|index| {
                    u16::from_be_bytes(
                        font[starts + index * 2..starts + index * 2 + 2]
                            .try_into()
                            .unwrap(),
                    )
                })
                .collect(),
            (0..count)
                .map(|index| {
                    u16::from_be_bytes(
                        font[deltas + index * 2..deltas + index * 2 + 2]
                            .try_into()
                            .unwrap(),
                    )
                })
                .collect(),
        );
    }

    #[test]
    fn numerically_sorts_all_finite_keys_and_performs_source_integer_coercions() {
        let mappings = vec![
            (66.0, 3.0),
            (1.5, 2.5),
            (-1.0, -3.0),
            (65.0, 1.0),
            (65538.0, 4.0),
        ];
        assert_eq!(
            cmap_segments(mappings),
            (
                vec![65535, 1, 65, 66, 2, 65535],
                vec![65534, 1, 65472, 65473, 2, 1]
            )
        );
    }

    #[test]
    fn finite_map_insertion_order_does_not_change_the_emitted_font() {
        let first = create_synthetic_font(Some(&SyntheticFontOptions {
            codepoints: Some(vec![(90.0, 4.0), (2.0, 7.0), (65.0, 1.0)]),
            ..font_options()
        }));
        let second = create_synthetic_font(Some(&SyntheticFontOptions {
            codepoints: Some(vec![(65.0, 1.0), (90.0, 4.0), (2.0, 7.0)]),
            ..font_options()
        }));
        assert_eq!(first, second);
    }

    #[test]
    fn duplicate_nan_and_signed_zero_keys_update_values_at_the_first_insertion_position() {
        let entries = vec![
            (3.0, 4.0),
            (f32::NAN, 1.0),
            (2.0, 7.0),
            (-0.0, 8.0),
            (f32::NAN, 9.0),
            (0.0, 10.0),
            (3.0, 11.0),
        ];
        assert_eq!(
            cmap_segments(entries),
            (vec![3, 0, 0, 2, 65535], vec![8, 0, 10, 5, 1])
        );
    }

    #[test]
    fn preserves_nonfinite_keys_and_values_with_nan_sort_ties_and_dataview_zero_coercion() {
        let entries = vec![
            (f32::INFINITY, 7.0),
            (f32::NEG_INFINITY, 8.0),
            (f32::NAN, 9.0),
            (1.0, f32::INFINITY),
            (2.0, f32::NEG_INFINITY),
            (3.0, f32::NAN),
        ];
        assert_eq!(
            cmap_segments(entries),
            (vec![0, 0, 0, 1, 2, 3, 65535], vec![0, 0, 0, 0, 0, 0, 1])
        );
    }

    #[test]
    fn emits_both_font_flavors_with_the_declared_tables_and_cff_glyph_count() {
        let quadratic = create_synthetic_font(None);
        let directory = read_sfnt_table_directory(&quadratic).unwrap();
        assert_eq!(directory.sfnt_version, 0x00010000);
        assert_eq!(directory.declared_table_count, 7);
        assert!(directory.tables.contains_key("glyf"));
        let cff = create_synthetic_font(Some(&SyntheticFontOptions {
            flavor: Some(SyntheticFontFlavor::OpenType),
            charstrings: Some(vec![
                vec![14].into_boxed_slice(),
                vec![14].into_boxed_slice(),
            ]),
            omit_table: Some("cmap".to_string()),
            units_per_em: Some(2048.0),
            ..font_options()
        }));
        let directory = read_sfnt_table_directory(&cff).unwrap();
        assert_eq!(directory.sfnt_version, 0x4f54544f);
        assert!(!directory.tables.contains_key("cmap"));
        assert!(!directory.tables.contains_key("glyf"));
        let maxp = directory.tables.get("maxp").unwrap();
        assert_eq!(&cff[maxp.offset + 4..maxp.offset + 6], &[0, 2]);
        let head = directory.tables.get("head").unwrap();
        assert_eq!(&cff[head.offset + 18..head.offset + 20], &[8, 0]);
    }
}

mod empty_synthetic_glyph {
    use super::*;
    #[test]
    fn returns_a_plain_empty_glyph_with_no_points_or_contours() {
        let glyph = empty_synthetic_glyph();
        assert!(glyph.end_points.is_empty());
        assert!(glyph.points.is_empty());
    }
}

mod encode_synthetic_cff {
    use super::*;
    #[test]
    fn emits_real_index_layout_and_table_relative_charstring_offsets() {
        let bytes = encode_synthetic_cff(&[vec![139, 139, 21, 14].into_boxed_slice()], None);
        assert_eq!(&bytes[..4], &[1, 0, 4, 1]);
        let names = read_cff_index(&bytes, 4).unwrap();
        let top = read_cff_index(&bytes, names.end_offset).unwrap();
        let dict = read_cff_dict(&bytes, top.entries[0].start, top.entries[0].end).unwrap();
        let charstrings = read_cff_index(&bytes, dict.get(&17).unwrap()[0] as usize).unwrap();
        assert_eq!(
            &bytes[charstrings.entries[0].start..charstrings.entries[0].end],
            &[139, 139, 21, 14]
        );
    }
}

mod encode_synthetic_woff {
    use super::*;
    #[test]
    fn stores_equal_lengths_truthful_checksums_and_optional_reversed_tag_order() {
        let sfnt = create_synthetic_font(None);
        let forward = encode_synthetic_woff(&sfnt, None);
        let reverse = encode_synthetic_woff(&sfnt, Some(true));
        assert_eq!(&forward[..4], b"wOFF");
        assert_eq!(forward.len(), reverse.len());
        let count = u16::from_be_bytes(forward[12..14].try_into().unwrap()) as usize;
        for index in 0..count {
            let record = 44 + index * 20;
            assert_eq!(
                &forward[record..record + 4],
                &reverse[44 + (count - 1 - index) * 20..48 + (count - 1 - index) * 20]
            );
            assert_eq!(
                &forward[record + 8..record + 12],
                &forward[record + 12..record + 16]
            );
            let offset =
                u32::from_be_bytes(forward[record + 4..record + 8].try_into().unwrap()) as usize;
            let length =
                u32::from_be_bytes(forward[record + 12..record + 16].try_into().unwrap()) as usize;
            let checksum =
                u32::from_be_bytes(forward[record + 16..record + 20].try_into().unwrap());
            assert_eq!(
                checksum,
                compute_sfnt_table_checksum(
                    &forward[offset..offset + length],
                    Some(&forward[record..record + 4] == b"head")
                )
            );
        }
    }
}

mod encode_synthetic_woff2 {
    use super::*;
    #[test]
    fn emits_explicit_unknown_tags_and_raw_uncompressed_table_stream() {
        let sfnt = assemble_sfnt_font(
            0x00010000,
            &[SfntFontTable {
                data: vec![7, 8].into_boxed_slice(),
                tag: pack_sfnt_tag("zzzz"),
            }],
        );
        let woff = encode_synthetic_woff2(&sfnt, None);
        assert_eq!(&woff[..4], b"wOF2");
        assert_eq!(&woff[48..], &[63, b'z', b'z', b'z', b'z', 2, 7, 8]);
        let transformed = encode_synthetic_woff2(&sfnt, Some(&["zzzz".to_string()]));
        assert_eq!(
            &transformed[48..],
            &[127, b'z', b'z', b'z', b'z', 2, 2, 7, 8]
        );
    }
}

mod get_synthetic_font_flavor_string {
    use super::*;
    #[test]
    fn returns_the_complete_exact_flavor_string_table() {
        assert_eq!(
            get_synthetic_font_flavor_string(SyntheticFontFlavor::OpenType),
            "opentype"
        );
        assert_eq!(
            get_synthetic_font_flavor_string(SyntheticFontFlavor::TrueType),
            "truetype"
        );
    }
}

mod parse_synthetic_font_flavor {
    use super::*;
    #[test]
    fn parses_only_exact_flavor_strings() {
        assert_eq!(
            parse_synthetic_font_flavor("opentype"),
            Some(SyntheticFontFlavor::OpenType)
        );
        assert_eq!(
            parse_synthetic_font_flavor("truetype"),
            Some(SyntheticFontFlavor::TrueType)
        );
        assert_eq!(parse_synthetic_font_flavor("OpenType"), None);
        assert_eq!(parse_synthetic_font_flavor(""), None);
    }
}

mod ring_synthetic_glyph {
    use super::*;
    #[test]
    fn preserves_relative_counter_direction_under_the_two_independent_reversal_options() {
        let ring = ring_synthetic_glyph(None, None);
        assert_eq!(ring.end_points, [3.0, 7.0]);
        let reversed = ring_synthetic_glyph(Some(true), None);
        let flipped = ring_synthetic_glyph(None, Some(true));
        assert_eq!(ring.points[..4], reversed.points[..4]);
        assert_eq!(
            ring.points[4..],
            reversed.points[4..]
                .iter()
                .copied()
                .rev()
                .collect::<Vec<_>>()
        );
        assert_eq!(
            ring.points[..4],
            flipped.points[..4]
                .iter()
                .copied()
                .rev()
                .collect::<Vec<_>>()
        );
        assert_eq!(
            ring.points[4..],
            flipped.points[4..]
                .iter()
                .copied()
                .rev()
                .collect::<Vec<_>>()
        );
    }
}

mod square_synthetic_glyph {
    use super::*;
    #[test]
    fn emits_four_ordered_on_curve_corners() {
        let glyph = square_synthetic_glyph(15.0);
        assert_eq!(glyph.end_points, [3.0]);
        assert_eq!(glyph.points.len(), 4);
        assert!(glyph.points.iter().all(|point| point.on_curve));
        assert_eq!(
            glyph.points[2],
            SyntheticGlyphPoint {
                x: 15.0,
                y: 15.0,
                on_curve: true
            }
        );
    }
}
