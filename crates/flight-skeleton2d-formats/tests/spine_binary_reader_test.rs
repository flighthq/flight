use flight_skeleton2d_formats::contract::*;

mod create_spine_binary_reader {
    use super::*;
    #[test]
    fn starts_at_zero_over_the_borrowed_bytes() {
        let reader = create_spine_binary_reader(&[1, 2]);
        assert_eq!(reader.offset, 0);
        assert_eq!(reader.view, [1, 2]);
    }
}

mod has_spine_binary_bytes {
    use super::*;
    #[test]
    fn validates_without_advancing() {
        let reader = create_spine_binary_reader(&[1, 2]);
        assert!(has_spine_binary_bytes(&reader, 2));
        assert!(!has_spine_binary_bytes(&reader, 3));
        assert_eq!(reader.offset, 0);
    }
}

mod is_spine_binary_reader_overrun {
    use super::*;
    #[test]
    fn distinguishes_exact_end_from_sticky_overrun() {
        let mut reader = create_spine_binary_reader(&[1]);
        skip_spine_binary_bytes(&mut reader, 1);
        assert!(!is_spine_binary_reader_overrun(&reader));
        read_spine_binary_byte(&mut reader);
        assert!(is_spine_binary_reader_overrun(&reader));
    }
}

mod read_spine_binary_boolean {
    use super::*;
    #[test]
    fn treats_only_zero_as_false() {
        let mut reader = create_spine_binary_reader(&[0, 2]);
        assert!(!read_spine_binary_boolean(&mut reader));
        assert!(read_spine_binary_boolean(&mut reader));
    }
}

mod read_spine_binary_byte {
    use super::*;
    #[test]
    fn returns_zero_and_marks_overrun_at_eof() {
        let mut reader = create_spine_binary_reader(&[7]);
        assert_eq!(read_spine_binary_byte(&mut reader), 7);
        assert_eq!(read_spine_binary_byte(&mut reader), 0);
        assert!(is_spine_binary_reader_overrun(&reader));
    }
}

mod read_spine_binary_float {
    use super::*;
    #[test]
    fn reads_big_endian_ieee754() {
        let bytes = 1.5_f32.to_be_bytes();
        let mut reader = create_spine_binary_reader(&bytes);
        assert_eq!(read_spine_binary_float(&mut reader), 1.5);
    }
}

mod read_spine_binary_int {
    use super::*;
    #[test]
    fn reads_big_endian_signed_values() {
        let bytes = (-7_i32).to_be_bytes();
        let mut reader = create_spine_binary_reader(&bytes);
        assert_eq!(read_spine_binary_int(&mut reader), -7);
    }
}

mod read_spine_binary_signed_varint {
    use super::*;
    #[test]
    fn decodes_zigzag_values() {
        let mut reader = create_spine_binary_reader(&[1, 2]);
        assert_eq!(read_spine_binary_signed_varint(&mut reader), -1);
        assert_eq!(read_spine_binary_signed_varint(&mut reader), 1);
    }
}

mod read_spine_binary_string {
    use super::*;
    #[test]
    fn distinguishes_null_empty_and_utf8() {
        let mut reader = create_spine_binary_reader(&[0, 1, 4, b'a', b'b', b'c']);
        assert_eq!(read_spine_binary_string(&mut reader), None);
        assert_eq!(read_spine_binary_string(&mut reader), Some(String::new()));
        assert_eq!(
            read_spine_binary_string(&mut reader).as_deref(),
            Some("abc")
        );
    }
}

mod read_spine_binary_unsigned_short {
    use super::*;
    #[test]
    fn reads_big_endian_values() {
        let mut reader = create_spine_binary_reader(&[0x12, 0x34]);
        assert_eq!(read_spine_binary_unsigned_short(&mut reader), 0x1234);
    }
}

mod read_spine_binary_varint {
    use super::*;
    #[test]
    fn decodes_five_byte_base128_values() {
        let mut reader = create_spine_binary_reader(&[0xac, 0x02]);
        assert_eq!(read_spine_binary_varint(&mut reader), 300);
    }
}

mod skip_spine_binary_bytes {
    use super::*;
    #[test]
    fn advances_or_sets_the_sticky_overrun_sentinel() {
        let mut reader = create_spine_binary_reader(&[1, 2]);
        skip_spine_binary_bytes(&mut reader, 1);
        assert_eq!(reader.offset, 1);
        skip_spine_binary_bytes(&mut reader, 2);
        assert_eq!(reader.offset, 3);
    }
}
