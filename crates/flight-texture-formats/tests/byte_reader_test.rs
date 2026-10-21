use flight_texture_formats::*;

mod create_byte_reader {
    use super::*;

    #[test]
    fn starts_at_the_given_offset() {
        let mut reader = create_byte_reader(&[1, 2, 3, 4], Some(2));
        assert_eq!(reader.offset, 2);
        assert_eq!(read_byte_reader_u8(&mut reader), 3);
    }

    #[test]
    fn views_a_subslice_at_its_own_start() {
        let backing = [9, 9, 0x01, 0x00];
        let mut reader = create_byte_reader(&backing[2..], None);
        assert_eq!(read_byte_reader_u16(&mut reader), 1);
    }
}

mod has_byte_reader_bytes {
    use super::*;

    #[test]
    fn reports_whether_count_bytes_remain_from_the_current_offset() {
        let reader = create_byte_reader(&[0; 8], Some(4));
        assert!(has_byte_reader_bytes(&reader, 4));
        assert!(!has_byte_reader_bytes(&reader, 5));
        assert!(has_byte_reader_bytes(&reader, 0));
        assert!(!has_byte_reader_bytes(&reader, usize::MAX));
    }
}

mod read_byte_reader_u16 {
    use super::*;

    #[test]
    fn reads_little_endian_and_advances_two() {
        let mut reader = create_byte_reader(&[0x34, 0x12], None);
        assert_eq!(read_byte_reader_u16(&mut reader), 0x1234);
        assert_eq!(reader.offset, 2);
    }
}

mod read_byte_reader_u24 {
    use super::*;

    #[test]
    fn reads_a_three_byte_little_endian_value_and_advances_three() {
        let mut reader = create_byte_reader(&[0x56, 0x34, 0x12], None);
        assert_eq!(read_byte_reader_u24(&mut reader), 0x123456);
        assert_eq!(reader.offset, 3);
    }

    #[test]
    fn reads_the_full_unsigned_range() {
        let mut reader = create_byte_reader(&[0xff, 0xff, 0xff], None);
        assert_eq!(read_byte_reader_u24(&mut reader), 0xff_ffff);
    }
}

mod read_byte_reader_u24_big_endian {
    use super::*;

    #[test]
    fn reads_a_three_byte_big_endian_value_and_advances_three() {
        let mut reader = create_byte_reader(&[0x12, 0x34, 0x56], None);
        assert_eq!(read_byte_reader_u24_big_endian(&mut reader), 0x123456);
        assert_eq!(reader.offset, 3);
    }

    #[test]
    fn reads_the_full_unsigned_range() {
        let mut reader = create_byte_reader(&[0xff, 0xff, 0xff], None);
        assert_eq!(read_byte_reader_u24_big_endian(&mut reader), 0xff_ffff);
    }
}

mod read_byte_reader_u32 {
    use super::*;

    #[test]
    fn reads_little_endian_and_advances_four() {
        let mut reader = create_byte_reader(&[0x78, 0x56, 0x34, 0x12], None);
        assert_eq!(read_byte_reader_u32(&mut reader), 0x1234_5678);
        assert_eq!(reader.offset, 4);
    }
}

mod read_byte_reader_u32_big_endian {
    use super::*;

    #[test]
    fn reads_big_endian_and_advances_four() {
        let mut reader = create_byte_reader(&[0x12, 0x34, 0x56, 0x78], None);
        assert_eq!(read_byte_reader_u32_big_endian(&mut reader), 0x1234_5678);
        assert_eq!(reader.offset, 4);
    }

    #[test]
    fn reads_the_full_unsigned_range() {
        let mut reader = create_byte_reader(&[0xff, 0xff, 0xff, 0xff], None);
        assert_eq!(read_byte_reader_u32_big_endian(&mut reader), u32::MAX);
    }
}

mod read_byte_reader_u64 {
    use super::*;

    #[test]
    fn reads_little_endian_exactly_and_advances_eight() {
        let bytes = (2u64 * 0x1_0000_0000 + 0x1000).to_le_bytes();
        let mut reader = create_byte_reader(&bytes, None);
        assert_eq!(
            read_byte_reader_u64(&mut reader),
            2 * 0x1_0000_0000 + 0x1000
        );
        assert_eq!(reader.offset, 8);
    }
}

mod read_byte_reader_u8 {
    use super::*;

    #[test]
    fn reads_one_byte_and_advances_one() {
        let mut reader = create_byte_reader(&[0xab], None);
        assert_eq!(read_byte_reader_u8(&mut reader), 0xab);
        assert_eq!(reader.offset, 1);
    }
}

mod skip_byte_reader {
    use super::*;

    #[test]
    fn advances_the_offset_without_reading() {
        let mut reader = create_byte_reader(&[0; 8], None);
        skip_byte_reader(&mut reader, 3);
        assert_eq!(reader.offset, 3);
    }
}
