use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    equals_array_buffer, get_array_buffer_storage,
};
use flight_font_formats::*;
use std::collections::HashMap;

fn composite(flags: &[u16]) -> Vec<u8> {
    let mut out = Vec::new();
    for flag in flags {
        out.extend_from_slice(&flag.to_be_bytes());
        out.extend_from_slice(&[0, 0]);
        let arguments = if flag & 1 != 0 { 4 } else { 2 };
        let transform = if flag & 8 != 0 {
            2
        } else if flag & 0x40 != 0 {
            4
        } else if flag & 0x80 != 0 {
            8
        } else {
            0
        };
        out.resize(out.len() + arguments + transform, 0);
    }
    return out;
}

fn byte_view(bytes: Vec<u8>) -> ArrayBufferView {
    let length = bytes.len();
    let buffer = create_array_buffer_from_bytes(bytes.into_boxed_slice());
    return create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array).unwrap();
}
fn view_bytes(view: &ArrayBufferView) -> Vec<u8> {
    let storage = get_array_buffer_storage(&view.buffer);
    let bytes = storage.read().unwrap();
    return bytes[view.byte_offset..view.byte_offset + view.byte_length].to_vec();
}
fn fill_view(view: &ArrayBufferView, value: u8) {
    let storage = get_array_buffer_storage(&view.buffer);
    storage.write().unwrap()[view.byte_offset..view.byte_offset + view.byte_length].fill(value);
}
fn transformed_glyf(sizes: &[usize; 7], glyph_count: u16, index_format: u16) -> ArrayBufferView {
    let mut out = vec![0; 36];
    out[4..6].copy_from_slice(&glyph_count.to_be_bytes());
    out[6..8].copy_from_slice(&index_format.to_be_bytes());
    for (index, size) in sizes.iter().enumerate() {
        out[8 + index * 4..12 + index * 4].copy_from_slice(&(*size as u32).to_be_bytes());
        out.resize(out.len() + size, (index + 1) as u8);
    }
    return byte_view(out);
}
fn transformed_parts(parts: &[Vec<u8>; 7], glyph_count: u16, index_format: u16) -> ArrayBufferView {
    let sizes = [
        parts[0].len(),
        parts[1].len(),
        parts[2].len(),
        parts[3].len(),
        parts[4].len(),
        parts[5].len(),
        parts[6].len(),
    ];
    let view = transformed_glyf(&sizes, glyph_count, index_format);
    let storage = get_array_buffer_storage(&view.buffer);
    let mut bytes = storage.write().unwrap();
    let mut at = 36;
    for part in parts {
        bytes[at..at + part.len()].copy_from_slice(part);
        at += part.len();
    }
    drop(bytes);
    return view;
}

mod create_woff2_transform_reverser {
    use super::*;
    #[test]
    fn deliberately_refuses_hmtx_transforms() {
        assert!(
            create_woff2_transform_reverser()("hmtx", &byte_view(vec![0; 4]), &HashMap::new())
                .is_none()
        );
    }
    #[test]
    fn answers_loca_before_glyf() {
        let transformed = transformed_glyf(&[6, 0, 0, 0, 0, 0, 0], 3, 1);
        let streams = read_woff2_glyf_streams(&transformed).unwrap();
        fill_view(&streams.n_contour_stream, 0);
        let mut tables = HashMap::new();
        tables.insert("glyf".to_string(), transformed);
        assert!(create_woff2_transform_reverser()("loca", &byte_view(vec![]), &tables).is_some());
    }
    #[test]
    fn returns_null_for_loca_without_glyf() {
        assert!(
            create_woff2_transform_reverser()("loca", &byte_view(vec![]), &HashMap::new())
                .is_none()
        );
    }
    #[test]
    fn caches_the_same_two_mutable_byte_allocations_and_keeps_instances_independent() {
        let transformed = transformed_parts(
            &[vec![0, 0], vec![], vec![], vec![], vec![], vec![], vec![]],
            1,
            1,
        );
        let mut tables = HashMap::new();
        tables.insert("glyf".to_string(), transformed.clone());
        let first = create_woff2_transform_reverser();
        let second = create_woff2_transform_reverser();
        let loca = first("loca", &byte_view(vec![]), &tables).unwrap();
        let same = first("loca", &byte_view(vec![]), &tables).unwrap();
        assert!(equals_array_buffer(&loca.buffer, &same.buffer));
        fill_view(&loca, 9);
        assert_eq!(
            view_bytes(&first("loca", &byte_view(vec![]), &tables).unwrap()),
            vec![9; 8]
        );
        let independent = second("loca", &byte_view(vec![]), &tables).unwrap();
        assert!(!equals_array_buffer(&loca.buffer, &independent.buffer));
        assert_eq!(view_bytes(&independent), vec![0; 8]);
        let glyf = first("glyf", &transformed, &tables).unwrap();
        assert_eq!(glyf.byte_length, 0);
        assert!(!equals_array_buffer(&glyf.buffer, &loca.buffer));
    }
}

mod decode_woff2_triplet {
    use super::*;
    const BYTES: [u8; 4] = [0x12, 0x34, 0x56, 0x78];
    #[test]
    fn moves_on_one_axis_in_the_single_axis_blocks() {
        assert_eq!(
            decode_woff2_triplet(0, &BYTES, 0),
            Some(Woff2Triplet {
                dx: 0.0,
                dy: -18.0,
                used: 1
            })
        );
        assert_eq!(
            decode_woff2_triplet(10, &BYTES, 0),
            Some(Woff2Triplet {
                dx: -18.0,
                dy: 0.0,
                used: 1
            })
        );
    }
    #[test]
    fn steps_single_axis_bases_every_two_codes() {
        assert_eq!(decode_woff2_triplet(2, &BYTES, 0).unwrap().dy, -274.0);
        assert_eq!(decode_woff2_triplet(9, &BYTES, 0).unwrap().dy, 1042.0);
    }
    #[test]
    fn reads_x_sign_from_bit_zero_and_y_sign_from_bit_one() {
        for (code, dx, dy) in [
            (20, -2.0, -3.0),
            (21, 2.0, -3.0),
            (22, -2.0, 3.0),
            (23, 2.0, 3.0),
        ] {
            assert_eq!(
                decode_woff2_triplet(code, &BYTES, 0),
                Some(Woff2Triplet { dx, dy, used: 1 })
            );
        }
    }
    #[test]
    fn uses_four_bit_bases_one_seventeen_thirty_three_and_forty_nine() {
        for (code, expected) in [(23, 2.0), (39, 18.0), (55, 34.0), (71, 50.0)] {
            assert_eq!(decode_woff2_triplet(code, &BYTES, 0).unwrap().dx, expected);
        }
    }
    #[test]
    fn takes_two_bytes_and_uses_the_three_eight_bit_bases() {
        assert_eq!(
            decode_woff2_triplet(87, &BYTES, 0),
            Some(Woff2Triplet {
                dx: 19.0,
                dy: 53.0,
                used: 2
            })
        );
        assert_eq!(decode_woff2_triplet(99, &BYTES, 0).unwrap().dx, 275.0);
        assert_eq!(decode_woff2_triplet(111, &BYTES, 0).unwrap().dx, 531.0);
    }
    #[test]
    fn adds_no_base_to_twelve_or_sixteen_bit_deltas() {
        assert_eq!(
            decode_woff2_triplet(123, &BYTES, 0),
            Some(Woff2Triplet {
                dx: 0x123 as f32,
                dy: 0x456 as f32,
                used: 3
            })
        );
        assert_eq!(
            decode_woff2_triplet(127, &BYTES, 0),
            Some(Woff2Triplet {
                dx: 0x1234 as f32,
                dy: 0x5678 as f32,
                used: 4
            })
        );
    }
    #[test]
    fn returns_null_when_the_stream_ends_mid_point() {
        assert!(decode_woff2_triplet(127, &BYTES, 1).is_none());
        assert!(decode_woff2_triplet(0, &BYTES, 4).is_none());
    }
}

mod get_woff2_bbox_bitmap_byte_length {
    use super::*;
    #[test]
    fn pads_the_bitmap_to_a_thirty_two_bit_boundary() {
        assert_eq!(get_woff2_bbox_bitmap_byte_length(1754), 220);
        assert_eq!(get_woff2_bbox_bitmap_byte_length(1741), 220);
        assert_eq!(get_woff2_bbox_bitmap_byte_length(1), 4);
        assert_eq!(get_woff2_bbox_bitmap_byte_length(32), 4);
        assert_eq!(get_woff2_bbox_bitmap_byte_length(33), 8);
    }
    #[test]
    fn is_zero_for_no_glyphs() {
        assert_eq!(get_woff2_bbox_bitmap_byte_length(0), 0);
    }
}

mod has_woff2_glyph_bbox {
    use super::*;
    #[test]
    fn reads_glyph_zero_as_the_high_bit() {
        assert!(has_woff2_glyph_bbox(&[0x80], 0));
        assert!(!has_woff2_glyph_bbox(&[1], 0));
        assert!(has_woff2_glyph_bbox(&[1], 7));
    }
    #[test]
    fn walks_later_bytes_by_glyph_index() {
        let bitmap = [0, 0x40, 0, 2];
        assert!(has_woff2_glyph_bbox(&bitmap, 9));
        assert!(has_woff2_glyph_bbox(&bitmap, 30));
        assert!(!has_woff2_glyph_bbox(&bitmap, 8));
    }
    #[test]
    fn reports_absent_past_the_end() {
        assert!(!has_woff2_glyph_bbox(&[255], 64));
        assert!(!has_woff2_glyph_bbox(&[255], -1));
    }
}

mod is_woff2_point_on_curve {
    use super::*;
    #[test]
    fn reads_the_high_bit_as_off_curve() {
        assert!(is_woff2_point_on_curve(0));
        assert!(!is_woff2_point_on_curve(0x80));
    }
    #[test]
    fn ignores_the_triplet_code_in_low_bits() {
        assert!(is_woff2_point_on_curve(0x7f));
        assert!(!is_woff2_point_on_curve(0xff));
        assert!(is_woff2_point_on_curve(0x2a));
        assert!(!is_woff2_point_on_curve(0xaa));
    }
}

mod measure_woff2_composite_glyph {
    use super::*;
    #[test]
    fn sizes_components_from_the_argument_width() {
        assert_eq!(
            measure_woff2_composite_glyph(&composite(&[0]), 0),
            Some(Woff2CompositeGlyphMeasure {
                byte_length: 6,
                has_instructions: false
            })
        );
        assert_eq!(
            measure_woff2_composite_glyph(&composite(&[1]), 0)
                .unwrap()
                .byte_length,
            8
        );
    }
    #[test]
    fn sizes_each_transform_form() {
        for (flags, length) in [(8, 8), (0x40, 10), (0x80, 14)] {
            assert_eq!(
                measure_woff2_composite_glyph(&composite(&[flags]), 0)
                    .unwrap()
                    .byte_length,
                length
            );
        }
    }
    #[test]
    fn treats_transform_flags_as_exclusive_in_the_source_priority_order() {
        assert_eq!(
            measure_woff2_composite_glyph(&composite(&[8 | 0x40 | 0x80]), 0)
                .unwrap()
                .byte_length,
            8
        );
    }
    #[test]
    fn walks_all_components_while_more_is_set() {
        assert_eq!(
            measure_woff2_composite_glyph(&composite(&[0x20, 0]), 0)
                .unwrap()
                .byte_length,
            12
        );
    }
    #[test]
    fn reports_instructions_requested_by_a_later_component() {
        assert_eq!(
            measure_woff2_composite_glyph(&composite(&[0x20, 0x100]), 0),
            Some(Woff2CompositeGlyphMeasure {
                byte_length: 12,
                has_instructions: true
            })
        );
    }
    #[test]
    fn measures_from_the_given_offset() {
        assert_eq!(
            measure_woff2_composite_glyph(&composite(&[0x80, 0]), 14),
            Some(Woff2CompositeGlyphMeasure {
                byte_length: 6,
                has_instructions: false
            })
        );
    }
    #[test]
    fn returns_null_for_incomplete_component_records() {
        assert!(measure_woff2_composite_glyph(&composite(&[0x20]), 0).is_none());
        assert!(measure_woff2_composite_glyph(&composite(&[0])[..5], 0).is_none());
    }
}

mod read_woff2_glyf_streams {
    use super::*;
    #[test]
    fn carves_all_seven_streams_in_the_declared_order() {
        let transformed = transformed_glyf(&[6, 1, 2, 3, 4, 5, 7], 3, 0);
        let streams = read_woff2_glyf_streams(&transformed).unwrap();
        for (view, length, fill) in [
            (&streams.n_contour_stream, 6, 1),
            (&streams.n_points_stream, 1, 2),
            (&streams.flag_stream, 2, 3),
            (&streams.glyph_stream, 3, 4),
            (&streams.composite_stream, 4, 5),
            (&streams.bbox_stream, 5, 6),
            (&streams.instruction_stream, 7, 7),
        ] {
            assert_eq!(view.byte_length, length);
            assert_eq!(view_bytes(view), vec![fill; length]);
        }
    }
    #[test]
    fn carries_glyph_count_and_loca_width() {
        let transformed = transformed_glyf(&[2, 1, 1, 1, 1, 1, 1], 41, 1);
        let streams = read_woff2_glyf_streams(&transformed).unwrap();
        assert_eq!(streams.glyph_count, 41);
        assert_eq!(streams.index_format, 1);
    }
    #[test]
    fn returns_null_when_declared_streams_run_short() {
        let transformed = transformed_glyf(&[4, 1, 1, 1, 1, 1, 1], 3, 0);
        let short =
            create_array_buffer_view(&transformed.buffer, 0, 40, ArrayBufferViewKind::Uint8Array)
                .unwrap();
        assert!(read_woff2_glyf_streams(&short).is_none());
    }
    #[test]
    fn returns_null_for_unclaimed_trailing_bytes() {
        let transformed = transformed_glyf(&[4, 1, 1, 1, 1, 1, 1], 3, 0);
        let mut bytes = view_bytes(&transformed);
        bytes.extend_from_slice(&[0, 0, 0]);
        assert!(read_woff2_glyf_streams(&byte_view(bytes)).is_none());
    }
    #[test]
    fn returns_null_for_an_incomplete_header() {
        assert!(read_woff2_glyf_streams(&byte_view(vec![0; 20])).is_none());
    }
    #[test]
    fn retains_shared_backing_offsets_mutation_and_lifetime_after_the_input_handle_drops() {
        let inner = transformed_glyf(&[2, 1, 1, 1, 1, 1, 1], 1, 0);
        let mut bytes = vec![99, 98, 97];
        bytes.extend(view_bytes(&inner));
        bytes.push(96);
        let storage = byte_view(bytes);
        let input = create_array_buffer_view(
            &storage.buffer,
            3,
            inner.byte_length,
            ArrayBufferViewKind::Uint8Array,
        )
        .unwrap();
        let streams = read_woff2_glyf_streams(&input).unwrap();
        assert!(equals_array_buffer(
            &input.buffer,
            &streams.n_contour_stream.buffer
        ));
        assert_eq!(streams.n_contour_stream.byte_offset, 39);
        fill_view(&streams.n_contour_stream, 8);
        drop(input);
        assert_eq!(&view_bytes(&storage)[39..41], &[8, 8]);
        assert_eq!(view_bytes(&streams.n_contour_stream), vec![8, 8]);
    }
}

mod read_woff2_short {
    use super::*;
    #[test]
    fn reads_a_plain_byte_and_advances_the_cursor() {
        let mut cursor = Woff2Cursor { at: 0 };
        assert_eq!(read_woff2_short(&[200], &mut cursor, 1), 200);
        assert_eq!(cursor.at, 1);
    }
    #[test]
    fn reads_the_two_byte_word_escape() {
        let mut cursor = Woff2Cursor { at: 0 };
        assert_eq!(read_woff2_short(&[253, 0x12, 0x34], &mut cursor, 3), 0x1234);
        assert_eq!(cursor.at, 3);
    }
    #[test]
    fn applies_distinct_offsets_for_the_one_byte_escapes() {
        assert_eq!(
            read_woff2_short(&[255, 10], &mut Woff2Cursor { at: 0 }, 2),
            263
        );
        assert_eq!(
            read_woff2_short(&[254, 10], &mut Woff2Cursor { at: 0 }, 2),
            516
        );
    }
    #[test]
    fn returns_negative_one_for_truncated_escapes() {
        let mut cursor = Woff2Cursor { at: 0 };
        assert_eq!(read_woff2_short(&[253, 0x12], &mut cursor, 2), -1);
        assert_eq!(cursor.at, 1);
        assert_eq!(read_woff2_short(&[255], &mut Woff2Cursor { at: 0 }, 1), -1);
        assert_eq!(read_woff2_short(&[], &mut Woff2Cursor { at: 0 }, 0), -1);
    }
}

mod reverse_woff2_glyf_transform {
    use super::*;
    #[test]
    fn returns_null_instead_of_partial_tables_when_a_stream_runs_short() {
        let transformed = transformed_glyf(&[2, 1, 1, 1, 0, 0, 0], 3, 0);
        let streams = read_woff2_glyf_streams(&transformed).unwrap();
        assert!(reverse_woff2_glyf_transform(&streams).is_none());
    }
    #[test]
    fn emits_zero_length_blank_glyph_records_and_equal_loca_offsets() {
        let transformed = transformed_glyf(&[6, 0, 0, 0, 0, 0, 0], 3, 0);
        let streams = read_woff2_glyf_streams(&transformed).unwrap();
        fill_view(&streams.n_contour_stream, 0);
        let out = reverse_woff2_glyf_transform(&streams).unwrap();
        assert_eq!(out.glyf.byte_length, 0);
        assert_eq!(view_bytes(&out.loca), vec![0; 8]);
    }
    #[test]
    fn reconstructs_simple_coordinates_flags_instructions_bounds_and_even_padding() {
        let transformed = transformed_parts(
            &[
                vec![0, 1],
                vec![3],
                vec![23, 10, 1],
                vec![0, 9, 9, 1],
                vec![],
                vec![0; 4],
                vec![0xb0],
            ],
            1,
            0,
        );
        let result =
            reverse_woff2_glyf_transform(&read_woff2_glyf_streams(&transformed).unwrap()).unwrap();
        let glyf = view_bytes(&result.glyf);
        assert_eq!(glyf.len() % 2, 0);
        assert_eq!(&glyf[..10], &[0, 1, 255, 248, 0, 1, 0, 1, 0, 10]);
        assert_eq!(&glyf[12..15], &[0, 1, 0xb0]);
        let loca = view_bytes(&result.loca);
        assert_eq!(
            u16::from_be_bytes(loca[2..4].try_into().unwrap()) as usize * 2,
            glyf.len()
        );
    }
    #[test]
    fn consumes_composite_instruction_lengths_before_the_next_simple_glyph() {
        let components = composite(&[0x100]);
        let transformed = transformed_parts(
            &[
                vec![255, 255, 0, 1],
                vec![1],
                vec![23],
                vec![1, 0, 0],
                components,
                vec![0x80, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 10],
                vec![0xb0],
            ],
            2,
            1,
        );
        let result =
            reverse_woff2_glyf_transform(&read_woff2_glyf_streams(&transformed).unwrap()).unwrap();
        let glyf = view_bytes(&result.glyf);
        assert_eq!(&glyf[..2], &[255, 255]);
        assert_eq!(&glyf[16..19], &[0, 1, 0xb0]);
        let loca = view_bytes(&result.loca);
        let second = u32::from_be_bytes(loca[4..8].try_into().unwrap()) as usize;
        assert_eq!(&glyf[second..second + 2], &[0, 1]);
    }
    #[test]
    fn refuses_composites_without_explicit_bounds_and_truncated_instructions() {
        let transformed = transformed_parts(
            &[
                vec![255, 255],
                vec![],
                vec![],
                vec![],
                composite(&[0]),
                vec![0; 4],
                vec![],
            ],
            1,
            1,
        );
        assert!(
            reverse_woff2_glyf_transform(&read_woff2_glyf_streams(&transformed).unwrap()).is_none()
        );
        let malformed = transformed_parts(
            &[
                vec![0, 1],
                vec![1],
                vec![23],
                vec![0, 2],
                vec![],
                vec![0; 4],
                vec![0],
            ],
            1,
            1,
        );
        assert!(
            reverse_woff2_glyf_transform(&read_woff2_glyf_streams(&malformed).unwrap()).is_none()
        );
    }
}
