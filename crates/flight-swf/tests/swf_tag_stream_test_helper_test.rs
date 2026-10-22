use std::sync::{Arc, RwLock};

use flight_swf::contract::*;

mod count_swf_signed_bits {
    use super::*;

    #[test]
    fn returns_the_smallest_signed_width_and_caps_at_thirty_two() {
        assert_eq!(count_swf_signed_bits(&[0]), 1);
        assert_eq!(count_swf_signed_bits(&[-1, 0]), 1);
        assert_eq!(count_swf_signed_bits(&[-2, 1]), 2);
        assert_eq!(count_swf_signed_bits(&[i32::MIN, i32::MAX]), 32);
    }
}

mod create_swf_bit_writer {
    use super::*;

    #[test]
    fn exposes_an_empty_writer_through_the_contract() {
        let mut writer: SwfBitWriter = create_swf_bit_writer();
        assert!(swf_bit_writer_to_bytes(&writer).is_empty());
        swf_bit_writer_write_unsigned(&mut writer, 0b101, 3);
        assert_eq!(&*swf_bit_writer_to_bytes(&writer), &[0b1010_0000]);
    }
}

mod create_swf_file_bytes {
    use super::*;

    #[test]
    fn writes_an_uncompressed_version_nine_container_with_the_exact_length() {
        let end = create_swf_tag_record(0, None);
        let file = create_swf_file_bytes(&[end]);
        assert_eq!(&file[..4], &[0x46, 0x57, 0x53, 9]);
        assert_eq!(
            u32::from_le_bytes(file[4..8].try_into().unwrap()),
            file.len() as u32
        );
        assert_eq!(&file[file.len() - 2..], &[0, 0]);
    }
}

mod create_swf_matrix_record {
    use super::*;

    #[test]
    fn encodes_scales_rotations_and_twip_translation_for_the_reader() {
        let bytes = create_swf_matrix_record(1.5, 0.25, -0.125, 0.5, 200, -40);
        let source = Arc::new(RwLock::new(bytes));
        let end = source.read().unwrap().len();
        let mut reader = SwfReader::new(source, 0, end);
        let matrix = read_swf_matrix(&mut reader);
        assert_eq!(matrix.a, 1.5);
        assert_eq!(matrix.b, 0.25);
        assert_eq!(matrix.c, -0.125);
        assert_eq!(matrix.d, 0.5);
        assert_eq!(matrix.tx, 10.0);
        assert_eq!(matrix.ty, -2.0);
    }
}

mod create_swf_rectangle_record {
    use super::*;

    #[test]
    fn encodes_signed_twip_bounds_for_the_reader() {
        let bytes = create_swf_rectangle_record(-200, 2000, -100, 1000);
        let source = Arc::new(RwLock::new(bytes));
        let end = source.read().unwrap().len();
        let mut reader = SwfReader::new(source, 0, end);
        assert_eq!(
            read_swf_rectangle(&mut reader),
            Some(SwfTagRectangle {
                height: 55.0,
                width: 110.0,
                x: -10.0,
                y: -5.0,
            })
        );
    }
}

mod create_swf_tag_record {
    use super::*;

    #[test]
    fn selects_the_short_and_extended_header_forms() {
        assert_eq!(
            &*create_swf_tag_record(9, Some(&[1, 2, 3])),
            &[0x43, 0x02, 1, 2, 3]
        );
        let body = vec![7; 63];
        let tag = create_swf_tag_record(9, Some(&body));
        assert_eq!(&tag[..6], &[0x7f, 0x02, 63, 0, 0, 0]);
        assert_eq!(&tag[6..], body.as_slice());
    }
}

mod create_swf_test_parse_state {
    use super::*;

    #[test]
    fn defaults_to_the_full_handler_preset_and_accepts_a_custom_dispatch() {
        let state = create_swf_test_parse_state(None);
        assert_eq!(state.handlers.len(), SWF_ALL_TAG_HANDLERS.len());
        for handler in SWF_ALL_TAG_HANDLERS.iter() {
            for code in &handler.tags {
                assert!(state.dispatch.contains_key(code));
            }
        }

        let custom = expand_swf_tag_handler_dispatch(&[SWF_VIDEO_HANDLER.clone()]);
        let state = create_swf_test_parse_state(Some(custom));
        assert_eq!(state.dispatch.len(), 1);
        assert!(state.dispatch.contains_key(&60));
        assert!(state.handlers.is_empty());
    }
}

mod join_swf_bytes {
    use super::*;

    #[test]
    fn concatenates_each_part_in_order() {
        assert_eq!(
            &*join_swf_bytes(&[
                vec![1, 2].into_boxed_slice(),
                Vec::new().into_boxed_slice(),
                vec![3].into_boxed_slice(),
            ]),
            &[1, 2, 3]
        );
    }
}

mod swf_bit_writer_to_bytes {
    use super::*;

    #[test]
    fn returns_a_snapshot_of_the_current_packed_bytes() {
        let mut writer = create_swf_bit_writer();
        swf_bit_writer_write_unsigned(&mut writer, 0xaa, 8);
        let bytes = swf_bit_writer_to_bytes(&writer);
        swf_bit_writer_write_unsigned(&mut writer, 0x55, 8);
        assert_eq!(&*bytes, &[0xaa]);
        assert_eq!(&*swf_bit_writer_to_bytes(&writer), &[0xaa, 0x55]);
    }
}

mod swf_bit_writer_write_signed {
    use super::*;

    #[test]
    fn packs_a_negative_value_at_the_requested_width() {
        let mut writer = create_swf_bit_writer();
        swf_bit_writer_write_signed(&mut writer, -2, 3);
        assert_eq!(&*swf_bit_writer_to_bytes(&writer), &[0b1100_0000]);
    }
}

mod swf_bit_writer_write_unsigned {
    use super::*;

    #[test]
    fn packs_the_requested_high_to_low_bits() {
        let mut writer = create_swf_bit_writer();
        swf_bit_writer_write_unsigned(&mut writer, 0b101, 3);
        assert_eq!(&*swf_bit_writer_to_bytes(&writer), &[0b1010_0000]);
    }
}

mod swf_uint16_bytes {
    use super::*;

    #[test]
    fn writes_the_low_byte_first() {
        assert_eq!(&*swf_uint16_bytes(0x1234), &[0x34, 0x12]);
    }
}

mod swf_uint32_bytes {
    use super::*;

    #[test]
    fn writes_four_bytes_low_to_high() {
        assert_eq!(&*swf_uint32_bytes(0x1234_5678), &[0x78, 0x56, 0x34, 0x12]);
    }
}
