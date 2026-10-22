use crate::support::{SwfBitWriter, create_rectangle_record, reader};
use flight_swf::contract::*;

mod merge_swf_rectangles {
    use super::*;

    #[test]
    fn keeps_the_outer_box_when_one_contains_the_other() {
        let outer = SwfTagRectangle {
            height: 10.0,
            width: 10.0,
            x: -5.0,
            y: -5.0,
        };
        assert_eq!(
            merge_swf_rectangles(
                &outer,
                &SwfTagRectangle {
                    height: 1.0,
                    width: 1.0,
                    x: 0.0,
                    y: 0.0
                }
            ),
            outer
        );
    }

    #[test]
    fn produces_the_union_of_two_disjoint_boxes() {
        assert_eq!(
            merge_swf_rectangles(
                &SwfTagRectangle {
                    height: 2.0,
                    width: 2.0,
                    x: 0.0,
                    y: 0.0
                },
                &SwfTagRectangle {
                    height: 2.0,
                    width: 2.0,
                    x: 10.0,
                    y: 20.0
                }
            ),
            SwfTagRectangle {
                height: 22.0,
                width: 12.0,
                x: 0.0,
                y: 0.0
            }
        );
    }

    #[test]
    fn unions_across_the_origin() {
        assert_eq!(
            merge_swf_rectangles(
                &SwfTagRectangle {
                    height: 4.0,
                    width: 4.0,
                    x: -4.0,
                    y: -4.0
                },
                &SwfTagRectangle {
                    height: 4.0,
                    width: 4.0,
                    x: 0.0,
                    y: 0.0
                }
            ),
            SwfTagRectangle {
                height: 8.0,
                width: 8.0,
                x: -4.0,
                y: -4.0
            }
        );
    }
}

mod read_big_endian_uint16 {
    use super::*;

    #[test]
    fn reads_from_the_given_offset() {
        assert_eq!(read_big_endian_uint16(&[0, 0, 0xff, 0x01], 2), 0xff01);
    }

    #[test]
    fn reads_the_high_byte_first_unlike_the_container() {
        assert_eq!(read_big_endian_uint16(&[0x12, 0x34], 0), 0x1234);
    }
}

mod read_big_endian_uint32 {
    use super::*;

    #[test]
    fn reads_four_bytes_high_to_low() {
        assert_eq!(
            read_big_endian_uint32(&[0x12, 0x34, 0x56, 0x78], 0),
            0x12345678
        );
    }

    #[test]
    fn stays_positive_above_the_signed_boundary() {
        assert_eq!(
            read_big_endian_uint32(&[0xff, 0xff, 0xff, 0xff], 0),
            4_294_967_295
        );
    }
}

mod read_swf_matrix {
    use super::*;

    #[test]
    fn reads_rotation_terms_into_b_and_c() {
        let mut writer = SwfBitWriter::new();
        writer.write_unsigned(0, 1);
        writer.write_unsigned(1, 1);
        writer.write_unsigned(18, 5);
        writer.write_signed(0x10000, 18);
        writer.write_signed(-0x10000, 18);
        writer.write_unsigned(0, 5);
        let matrix = read_swf_matrix(&mut reader(writer.to_bytes()));
        assert_eq!(
            (matrix.a, matrix.b, matrix.c, matrix.d),
            (1.0, 1.0, -1.0, 1.0)
        );
    }

    #[test]
    fn reads_scale_as_fixed_point_and_translation_in_twips() {
        let mut writer = SwfBitWriter::new();
        writer.write_unsigned(1, 1);
        writer.write_unsigned(20, 5);
        writer.write_signed(2 * 0x10000, 20);
        writer.write_signed(3 * 0x10000, 20);
        writer.write_unsigned(0, 1);
        writer.write_unsigned(12, 5);
        writer.write_signed(40, 12);
        writer.write_signed(-60, 12);
        assert_eq!(
            read_swf_matrix(&mut reader(writer.to_bytes())),
            SwfTagMatrix {
                a: 2.0,
                b: 0.0,
                c: 0.0,
                d: 3.0,
                tx: 2.0,
                ty: -3.0
            }
        );
    }

    #[test]
    fn returns_identity_when_no_components_are_declared() {
        let mut writer = SwfBitWriter::new();
        writer.write_unsigned(0, 1);
        writer.write_unsigned(0, 1);
        writer.write_unsigned(0, 5);
        assert_eq!(
            read_swf_matrix(&mut reader(writer.to_bytes())),
            IDENTITY_MATRIX
        );
    }
}

mod read_swf_rectangle {
    use super::*;

    #[test]
    fn clamps_an_inverted_extent_to_empty_rather_than_refusing_it() {
        assert_eq!(
            read_swf_rectangle(&mut reader(create_rectangle_record(2000, 0, 1000, 0))),
            Some(SwfTagRectangle {
                height: 0.0,
                width: 0.0,
                x: 100.0,
                y: 50.0
            })
        );
    }

    #[test]
    fn converts_twips_to_pixels() {
        assert_eq!(
            read_swf_rectangle(&mut reader(create_rectangle_record(0, 2000, 0, 1000))),
            Some(SwfTagRectangle {
                height: 50.0,
                width: 100.0,
                x: 0.0,
                y: 0.0
            })
        );
    }

    #[test]
    fn returns_the_sentinel_when_the_record_runs_past_the_reader_end() {
        let bytes = create_rectangle_record(0, 2000, 0, 1000);
        assert_eq!(read_swf_rectangle(&mut reader(bytes[..1].to_vec())), None);
    }
}

mod resolve_swf_dimension_bounds {
    use super::*;

    #[test]
    fn returns_a_box_at_the_origin_for_a_declared_size() {
        assert_eq!(
            resolve_swf_dimension_bounds(8.0, 4.0),
            Some(SwfTagRectangle {
                height: 4.0,
                width: 8.0,
                x: 0.0,
                y: 0.0
            })
        );
    }

    #[test]
    fn returns_the_sentinel_when_either_dimension_is_zero() {
        assert_eq!(resolve_swf_dimension_bounds(0.0, 4.0), None);
        assert_eq!(resolve_swf_dimension_bounds(8.0, 0.0), None);
    }
}

mod transform_swf_rectangle {
    use super::*;

    #[test]
    fn keeps_a_mirrored_box_positive_in_extent() {
        let mut matrix = IDENTITY_MATRIX;
        matrix.a = -1.0;
        assert_eq!(
            transform_swf_rectangle(
                &SwfTagRectangle {
                    height: 2.0,
                    width: 4.0,
                    x: 0.0,
                    y: 0.0
                },
                &matrix
            ),
            SwfTagRectangle {
                height: 2.0,
                width: 4.0,
                x: -4.0,
                y: 0.0
            }
        );
    }

    #[test]
    fn returns_the_axis_aligned_extent_of_a_rotated_box() {
        let matrix = SwfTagMatrix {
            a: 0.0,
            b: 1.0,
            c: -1.0,
            d: 0.0,
            tx: 0.0,
            ty: 0.0,
        };
        assert_eq!(
            transform_swf_rectangle(
                &SwfTagRectangle {
                    height: 2.0,
                    width: 4.0,
                    x: 0.0,
                    y: 0.0
                },
                &matrix
            ),
            SwfTagRectangle {
                height: 4.0,
                width: 2.0,
                x: -2.0,
                y: 0.0
            }
        );
    }

    #[test]
    fn translates_a_box() {
        let mut matrix = IDENTITY_MATRIX;
        matrix.tx = 10.0;
        matrix.ty = 20.0;
        assert_eq!(
            transform_swf_rectangle(
                &SwfTagRectangle {
                    height: 2.0,
                    width: 4.0,
                    x: 1.0,
                    y: 1.0
                },
                &matrix
            ),
            SwfTagRectangle {
                height: 2.0,
                width: 4.0,
                x: 11.0,
                y: 21.0
            }
        );
    }
}
