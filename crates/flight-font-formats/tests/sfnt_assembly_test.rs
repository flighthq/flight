use flight_font_formats::*;

fn word(bytes: &[u8], offset: usize) -> u32 {
    return u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap());
}
fn short(bytes: &[u8], offset: usize) -> u16 {
    return u16::from_be_bytes(bytes[offset..offset + 2].try_into().unwrap());
}
fn bounds() -> SfntGlyphBounds {
    return SfntGlyphBounds {
        x_max: 9.0,
        x_min: 1.0,
        y_max: 8.0,
        y_min: 2.0,
    };
}

mod assemble_sfnt_font {
    use super::*;

    #[test]
    fn writes_directory_tags_in_sorted_order_from_reversed_input() {
        let font = assemble_sfnt_font(
            0x00010000,
            &[
                SfntFontTable {
                    data: vec![9].into_boxed_slice(),
                    tag: pack_sfnt_tag("name"),
                },
                SfntFontTable {
                    data: vec![7].into_boxed_slice(),
                    tag: pack_sfnt_tag("head"),
                },
                SfntFontTable {
                    data: vec![8].into_boxed_slice(),
                    tag: pack_sfnt_tag("cmap"),
                },
            ],
        );
        assert_eq!(short(&font, 4), 3);
        assert_eq!(
            [word(&font, 12), word(&font, 28), word(&font, 44)],
            [
                pack_sfnt_tag("cmap"),
                pack_sfnt_tag("head"),
                pack_sfnt_tag("name")
            ]
        );
    }

    #[test]
    fn starts_every_table_on_a_four_byte_boundary() {
        let font = assemble_sfnt_font(
            0x00010000,
            &[
                SfntFontTable {
                    data: vec![1].into_boxed_slice(),
                    tag: pack_sfnt_tag("aaaa"),
                },
                SfntFontTable {
                    data: vec![2, 3, 4].into_boxed_slice(),
                    tag: pack_sfnt_tag("bbbb"),
                },
                SfntFontTable {
                    data: vec![5, 6].into_boxed_slice(),
                    tag: pack_sfnt_tag("cccc"),
                },
            ],
        );
        for index in 0..3 {
            assert_eq!(word(&font, 12 + index * 16 + 8) % 4, 0);
        }
        assert_eq!(&font[61..64], &[0, 0, 0]);
    }

    #[test]
    fn preserves_each_table_at_its_declared_offset_and_length() {
        let payload = vec![11, 22, 33, 44, 55].into_boxed_slice();
        let font = assemble_sfnt_font(
            0x4f54544f,
            &[SfntFontTable {
                data: payload.clone(),
                tag: pack_sfnt_tag("CFF "),
            }],
        );
        let offset = word(&font, 20) as usize;
        let length = word(&font, 24) as usize;
        assert_eq!(length, payload.len());
        assert_eq!(&font[offset..offset + length], &*payload);
    }

    #[test]
    fn writes_real_checksums_instead_of_zeroes() {
        let payload = [0, 0, 0, 7];
        let font = assemble_sfnt_font(
            0x00010000,
            &[SfntFontTable {
                data: payload.to_vec().into_boxed_slice(),
                tag: pack_sfnt_tag("cmap"),
            }],
        );
        assert_eq!(word(&font, 16), 7);
        assert_eq!(word(&font, 16), compute_sfnt_table_checksum(&payload, None));
    }

    #[test]
    fn carries_the_supplied_flavor() {
        let font = assemble_sfnt_font(
            0x4f54544f,
            &[SfntFontTable {
                data: vec![0].into_boxed_slice(),
                tag: pack_sfnt_tag("CFF "),
            }],
        );
        assert_eq!(word(&font, 0), 0x4f54544f);
    }
}

mod compute_sfnt_table_checksum {
    use super::*;

    #[test]
    fn sums_big_endian_words() {
        assert_eq!(
            compute_sfnt_table_checksum(&[0, 0, 0, 1, 0, 0, 0, 2], None),
            3
        );
    }
    #[test]
    fn pads_partial_final_words() {
        assert_eq!(compute_sfnt_table_checksum(&[0, 0, 1], None), 0x100);
    }
    #[test]
    fn treats_head_checksum_adjustment_as_zero() {
        let mut head = [0; 16];
        head[8] = 255;
        head[9] = 255;
        assert_eq!(compute_sfnt_table_checksum(&head, Some(false)), 0xffff0000);
        assert_eq!(compute_sfnt_table_checksum(&head, Some(true)), 0);
    }
    #[test]
    fn wraps_modulo_two_to_the_thirty_two() {
        assert_eq!(
            compute_sfnt_table_checksum(&[255, 255, 255, 255, 0, 0, 0, 2], None),
            1
        );
    }
}

mod encode_sfnt_composite_glyph {
    use super::*;
    const COMPONENTS: [u8; 6] = [0, 0x20, 0, 3, 1, 2];

    #[test]
    fn marks_composites_with_a_negative_contour_count() {
        assert!(
            (short(
                &encode_sfnt_composite_glyph(&COMPONENTS, &[], &bounds(), false),
                0
            ) as i16)
                < 0
        );
    }
    #[test]
    fn copies_component_records_unchanged() {
        assert_eq!(
            &encode_sfnt_composite_glyph(&COMPONENTS, &[], &bounds(), false)[10..16],
            &COMPONENTS
        );
    }
    #[test]
    fn omits_instruction_length_when_no_component_requested_instructions() {
        assert_eq!(
            encode_sfnt_composite_glyph(&COMPONENTS, &[], &bounds(), false).len(),
            16
        );
    }
    #[test]
    fn writes_requested_instruction_length_and_bytes() {
        let out = encode_sfnt_composite_glyph(&COMPONENTS, &[0xb0], &bounds(), true);
        assert_eq!(out.len(), 19);
        assert_eq!(short(&out, 16), 1);
        assert_eq!(out[18], 0xb0);
    }
    #[test]
    fn carries_the_supplied_bounds() {
        let out = encode_sfnt_composite_glyph(&COMPONENTS, &[], &bounds(), false);
        assert_eq!(
            [
                short(&out, 2),
                short(&out, 4),
                short(&out, 6),
                short(&out, 8)
            ],
            [1, 2, 9, 8]
        );
    }
}

mod encode_sfnt_loca {
    use super::*;
    #[test]
    fn writes_one_more_offset_than_glyph_lengths() {
        assert_eq!(encode_sfnt_loca(&vec![4.0, 6.0], 1).unwrap().len(), 12);
        assert_eq!(encode_sfnt_loca(&vec![4.0, 6.0], 0).unwrap().len(), 6);
    }
    #[test]
    fn accumulates_offsets_in_glyph_order() {
        let out = encode_sfnt_loca(&vec![4.0, 6.0, 2.0], 1).unwrap();
        assert_eq!(
            [word(&out, 0), word(&out, 4), word(&out, 8), word(&out, 12)],
            [0, 4, 10, 12]
        );
    }
    #[test]
    fn halves_offsets_in_short_form() {
        let out = encode_sfnt_loca(&vec![4.0, 6.0], 0).unwrap();
        assert_eq!([short(&out, 0), short(&out, 2), short(&out, 4)], [0, 2, 5]);
    }
    #[test]
    fn gives_equal_consecutive_offsets_for_blank_glyphs() {
        let out = encode_sfnt_loca(&vec![4.0, 0.0, 4.0], 1).unwrap();
        assert_eq!(word(&out, 4), word(&out, 8));
    }
    #[test]
    fn refuses_odd_offsets_only_in_short_form() {
        assert!(encode_sfnt_loca(&vec![5.0, 4.0], 0).is_none());
        assert!(encode_sfnt_loca(&vec![5.0, 4.0], 1).is_some());
    }
    #[test]
    fn refuses_short_form_when_font_outgrows_its_reach() {
        assert!(encode_sfnt_loca(&vec![131072.0, 2.0], 0).is_none());
    }
}

mod encode_sfnt_simple_glyph {
    use super::*;
    #[test]
    fn writes_signed_contour_count_and_bounds() {
        let out = encode_sfnt_simple_glyph(
            &vec![0.0],
            &vec![5.0],
            &vec![5.0],
            &[true],
            &[],
            &SfntGlyphBounds {
                x_max: 5.0,
                x_min: -5.0,
                y_max: 5.0,
                y_min: -5.0,
            },
        );
        assert_eq!(short(&out, 0), 1);
        assert_eq!(short(&out, 2) as i16, -5);
        assert_eq!(short(&out, 4) as i16, -5);
    }
    #[test]
    fn returns_no_bytes_for_a_glyph_without_contours() {
        assert!(
            encode_sfnt_simple_glyph(&vec![], &vec![], &vec![], &[], &[], &bounds()).is_empty()
        );
    }
    #[test]
    fn spends_no_coordinate_bytes_on_points_that_do_not_move() {
        let moved = encode_sfnt_simple_glyph(
            &vec![1.0],
            &vec![0.0, 7.0],
            &vec![0.0, 0.0],
            &[true, true],
            &[],
            &bounds(),
        );
        let still = encode_sfnt_simple_glyph(
            &vec![1.0],
            &vec![0.0, 0.0],
            &vec![0.0, 0.0],
            &[true, true],
            &[],
            &bounds(),
        );
        assert_eq!(moved.len() - still.len(), 1);
    }
    #[test]
    fn collapses_runs_of_identical_flags() {
        let xs = vec![0.0; 10];
        assert_eq!(
            encode_sfnt_simple_glyph(&vec![9.0], &xs, &xs, &[true; 10], &[], &bounds()).len(),
            16
        );
    }
    #[test]
    fn carries_instructions_and_their_length() {
        let out = encode_sfnt_simple_glyph(
            &vec![0.0],
            &vec![0.0],
            &vec![0.0],
            &[true],
            &[0xb0, 1],
            &bounds(),
        );
        assert_eq!(short(&out, 12), 2);
        assert_eq!(&out[14..16], &[0xb0, 1]);
    }
    #[test]
    fn writes_deltas_beyond_a_byte_without_truncation() {
        let short = encode_sfnt_simple_glyph(
            &vec![0.0],
            &vec![255.0],
            &vec![0.0],
            &[true],
            &[],
            &bounds(),
        );
        let long = encode_sfnt_simple_glyph(
            &vec![0.0],
            &vec![256.0],
            &vec![0.0],
            &[true],
            &[],
            &bounds(),
        );
        assert_eq!(long.len() - short.len(), 1);
    }
}

mod pack_sfnt_tag {
    use super::*;
    #[test]
    fn packs_four_characters_big_endian() {
        assert_eq!(pack_sfnt_tag("glyf"), 0x676c7966);
    }
    #[test]
    fn pads_short_tags_with_spaces() {
        assert_eq!(pack_sfnt_tag("cvt"), pack_sfnt_tag("cvt "));
        assert_eq!(pack_sfnt_tag("cvt"), 0x63767420);
    }
}
