use flight_buffer::*;

mod create_byte_reader {
    use super::*;

    #[test]
    fn starts_at_the_given_offset() {
        let bytes: [u8; 4] = [1_u8, 2, 3, 4];
        let mut reader = create_byte_reader(&bytes, Some(2));
        assert_eq!(reader.offset, 2);
        assert_eq!(read_byte_reader_u8(&mut reader), 3);
    }

    #[test]
    fn views_a_subslice_at_its_own_start() {
        let backing: [u8; 4] = [9_u8, 9, 0x01, 0x00];
        let mut reader = create_byte_reader(&backing[2..], None);
        assert_eq!(read_byte_reader_u16(&mut reader), 1);
    }
}

mod has_byte_reader_bytes {
    use super::*;

    #[test]
    fn reports_whether_count_bytes_remain_from_the_current_offset() {
        let bytes = [0_u8; 8];
        let reader = create_byte_reader(&bytes, Some(4));
        assert!(has_byte_reader_bytes(&reader, 4));
        assert!(!has_byte_reader_bytes(&reader, 5));
        assert!(has_byte_reader_bytes(&reader, 0));
    }

    /// flight-compiler: rust-only — JavaScript numbers do not overflow at usize::MAX.
    #[test]
    fn rejects_a_count_that_would_overflow_native_pointer_arithmetic() {
        let bytes = [0_u8; 8];
        let reader = create_byte_reader(&bytes, Some(4));
        assert!(!has_byte_reader_bytes(&reader, usize::MAX));
    }
}

mod read_byte_reader_u16 {
    use super::*;

    #[test]
    fn reads_little_endian_and_advances_two() {
        let bytes: [u8; 2] = [0x34_u8, 0x12];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u16(&mut reader), 0x1234);
        assert_eq!(reader.offset, 2);
    }
}

mod read_byte_reader_u24 {
    use super::*;

    #[test]
    fn reads_a_three_byte_little_endian_value_and_advances_three() {
        let bytes: [u8; 3] = [0x56_u8, 0x34, 0x12];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u24(&mut reader), 0x123456);
        assert_eq!(reader.offset, 3);
    }

    #[test]
    fn reads_the_full_unsigned_range() {
        let bytes: [u8; 3] = [0xff_u8, 0xff, 0xff];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u24(&mut reader), 0xff_ffff);
    }
}

mod read_byte_reader_u24_big_endian {
    use super::*;

    #[test]
    fn reads_a_three_byte_big_endian_value_and_advances_three() {
        let bytes: [u8; 3] = [0x12_u8, 0x34, 0x56];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u24_big_endian(&mut reader), 0x123456);
        assert_eq!(reader.offset, 3);
    }

    #[test]
    fn reads_the_full_unsigned_range() {
        let bytes: [u8; 3] = [0xff_u8, 0xff, 0xff];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u24_big_endian(&mut reader), 0xff_ffff);
    }
}

mod read_byte_reader_u32 {
    use super::*;

    #[test]
    fn reads_little_endian_and_advances_four() {
        let bytes: [u8; 4] = [0x78_u8, 0x56, 0x34, 0x12];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u32(&mut reader), 0x1234_5678);
        assert_eq!(reader.offset, 4);
    }
}

mod read_byte_reader_u32_big_endian {
    use super::*;

    #[test]
    fn reads_big_endian_and_advances_four() {
        let bytes: [u8; 4] = [0x12_u8, 0x34, 0x56, 0x78];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u32_big_endian(&mut reader), 0x1234_5678);
        assert_eq!(reader.offset, 4);
    }

    #[test]
    fn reads_the_full_unsigned_range() {
        let bytes: [u8; 4] = [0xff_u8, 0xff, 0xff, 0xff];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u32_big_endian(&mut reader), u32::MAX);
    }
}

mod read_byte_reader_u64 {
    use super::*;

    #[test]
    fn reads_little_endian_exactly_and_advances_eight() {
        let bytes: [u8; 8] = [0_u8, 0x10, 0, 0, 2, 0, 0, 0];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(
            read_byte_reader_u64(&mut reader),
            2 * 0x1_0000_0000 + 0x1000
        );
        assert_eq!(reader.offset, 8);
    }

    #[test]
    fn reads_the_low_word_as_unsigned_when_combining_the_result() {
        let bytes: [u8; 8] = [0xff_u8, 0xff, 0xff, 0xff, 2, 0, 0, 0];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u64(&mut reader), 3 * 0x1_0000_0000 - 1);
    }
}

mod read_byte_reader_u8 {
    use super::*;

    #[test]
    fn reads_one_byte_and_advances_one() {
        let bytes: [u8; 1] = [0xab_u8];
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(read_byte_reader_u8(&mut reader), 0xab);
        assert_eq!(reader.offset, 1);
    }
}

mod skip_byte_reader {
    use super::*;

    #[test]
    fn advances_the_offset_without_reading() {
        let bytes = [0_u8; 8];
        let mut reader = create_byte_reader(&bytes, None);
        skip_byte_reader(&mut reader, 3);
        assert_eq!(reader.offset, 3);
    }
}
