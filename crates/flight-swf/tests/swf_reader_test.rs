use crate::support::{bytes_ref, reader};
use flight_swf::contract::*;

mod align_swf_reader_to_byte {
    use super::*;

    #[test]
    fn aligns_to_the_next_byte_before_a_byte_oriented_read() {
        let mut reader = reader(vec![0b10000000, 0x42]);
        assert_eq!(reader.read_unsigned_bits(1), 1.0);
        assert_eq!(reader.read_uint8(), 0x42);
    }
}

mod create_swf_reader {
    use super::*;

    #[test]
    fn initializes_the_requested_bounded_window() {
        let reader = SwfReader::new(bytes_ref(vec![1, 2, 3]), 1, 3);
        assert_eq!(reader.pos, 1);
        assert_eq!(reader.end, 3);
        assert_eq!(reader.bit_position, 0);
        assert!(reader.valid);
    }
}

mod read_swf_encoded_uint32 {
    use super::*;

    #[test]
    fn reads_multi_byte_encoded_unsigned_integers() {
        let mut reader = reader(vec![0x7f, 0xc8, 0x01]);
        assert_eq!(reader.read_encoded_uint32(), 127);
        assert_eq!(reader.read_encoded_uint32(), 200);
    }

    #[test]
    fn retains_all_five_groups_instead_of_truncating_to_thirty_two_bits() {
        let mut reader = reader(vec![0xff, 0xff, 0xff, 0xff, 0x7f]);
        assert_eq!(reader.read_encoded_uint32(), 34_359_738_367);
    }
}

mod read_swf_fixed8 {
    use super::*;

    #[test]
    fn reads_a_signed_fixed_value() {
        let mut reader = reader(vec![0x80, 0xff]);
        assert_eq!(reader.read_fixed8(), -0.5);
    }
}

mod read_swf_signed_bits {
    use super::*;

    #[test]
    fn reads_and_signs_a_big_endian_bit_field() {
        let mut reader = reader(vec![0b10110100]);
        assert_eq!(reader.read_unsigned_bits(3), 0b101 as f64);
        assert_eq!(reader.read_signed_bits(5), -12.0);
    }

    #[test]
    fn treats_a_zero_width_field_as_zero_without_consuming_input() {
        let mut reader = reader(vec![0xff]);
        assert_eq!(reader.read_signed_bits(0), 0.0);
        assert_eq!(reader.read_uint8(), 0xff);
    }
}

mod read_swf_string {
    use super::*;

    #[test]
    fn reads_a_null_terminated_string_and_fails_when_it_never_terminates() {
        let bytes = vec![0x68, 0x69, 0x00, 0x6e, 0x6f];
        let mut reader = SwfReader::new(bytes_ref(bytes.clone()), 0, bytes.len());
        assert_eq!(reader.read_string(), "hi");
        assert_eq!(reader.read_string(), "");
        assert!(!reader.valid);
    }

    #[test]
    fn strips_a_leading_utf8_byte_order_mark_like_text_decoder() {
        let mut reader = reader(vec![0xef, 0xbb, 0xbf, b'A', 0]);
        assert_eq!(reader.read_string(), "A");
    }
}

mod read_swf_uint16 {
    use super::*;

    #[test]
    fn reads_a_little_endian_integer() {
        let mut reader = reader(vec![0x02, 0x03]);
        assert_eq!(reader.read_uint16(), 0x0302);
    }
}

mod read_swf_uint32 {
    use super::*;

    #[test]
    fn composes_a_partial_value_and_marks_an_overrun() {
        let mut reader = reader(vec![0x04, 0x05, 0x06]);
        reader.read_uint32();
        assert!(!reader.valid);
    }
}

mod read_swf_uint8 {
    use super::*;

    #[test]
    fn returns_zero_after_the_reader_end() {
        let mut reader = reader(vec![1]);
        assert_eq!(reader.read_uint8(), 1);
        assert_eq!(reader.read_uint8(), 0);
        assert!(!reader.valid);
    }
}

mod read_swf_unsigned_bits {
    use super::*;

    #[test]
    fn reads_across_byte_boundaries() {
        let mut reader = reader(vec![0b10110100, 0b11110000]);
        assert_eq!(reader.read_unsigned_bits(8), 0b10110100 as f64);
        assert_eq!(reader.read_unsigned_bits(8), 0b11110000 as f64);
        assert!(reader.valid);
    }

    #[test]
    fn reads_the_full_byte_sized_bit_count() {
        let mut bytes = vec![0; 32];
        bytes[0] = 0x80;
        let mut reader = reader(bytes);
        assert_eq!(reader.read_signed_bits(255), -2.0_f64.powi(254));
        assert_eq!(reader.pos, 31);
        assert_eq!(reader.bit_position, 7);
        assert!(reader.valid);
    }
}
