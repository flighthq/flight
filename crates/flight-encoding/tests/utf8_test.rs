use flight_encoding::*;

mod decode_utf8 {
    use super::*;

    #[test]
    fn decodes_empty_and_ascii_input() {
        assert_eq!(decode_utf8(&[], None, None), "");
        assert_eq!(
            decode_utf8(&[0, 72, 101, 108, 108, 111, 0x7F], None, None),
            "\0Hello\x7F"
        );
    }

    #[test]
    fn decodes_two_three_and_four_byte_sequences() {
        assert_eq!(
            decode_utf8(
                &[0xC2, 0xA2, 0xE2, 0x82, 0xAC, 0xF0, 0x9F, 0x98, 0x80],
                None,
                None,
            ),
            "\u{00A2}\u{20AC}\u{1F600}"
        );
    }

    #[test]
    fn replaces_malformed_and_incomplete_sequences_without_consuming_the_next_valid_byte() {
        assert_eq!(
            decode_utf8(&[0x80, 0xC0, 0xAF], None, None),
            "\u{FFFD}\u{FFFD}\u{FFFD}"
        );
        assert_eq!(
            decode_utf8(&[0xE2, 0x28, 0xA1], None, None),
            "\u{FFFD}(\u{FFFD}"
        );
        assert_eq!(
            decode_utf8(&[0xED, 0xA0, 0x80], None, None),
            "\u{FFFD}\u{FFFD}\u{FFFD}"
        );
        assert_eq!(decode_utf8(&[0xE2, 0x82], None, None), "\u{FFFD}");
    }

    #[test]
    fn honors_offset_and_length_windows_without_reading_adjacent_bytes() {
        let bytes: &[u8] = &[0xFF, 72, 0xC3, 0xA9, 0xFF];
        assert_eq!(decode_utf8(bytes, Some(1), Some(3)), "H\u{00E9}");
        assert_eq!(decode_utf8(bytes, Some(1), Some(0)), "");
        assert_eq!(decode_utf8(bytes, Some(5), None), "");
        assert_eq!(
            decode_utf8(&[0xE2, 0x82, 0xAC], Some(0), Some(2)),
            "\u{FFFD}"
        );
    }

    fn assert_range_error(result: std::thread::Result<String>) {
        let err = result.unwrap_err();
        let flight_err = err.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(flight_err.kind, flight_entity::FlightErrorKind::RangeError);
        assert_eq!(
            flight_err.message,
            "decodeUTF8 window is outside the byte array"
        );
    }

    #[test]
    fn rejects_windows_outside_the_byte_array() {
        assert_range_error(std::panic::catch_unwind(|| {
            decode_utf8(&[65], Some(0), Some(2))
        }));
    }

    #[test]
    fn rejects_offset_beyond_end_with_omitted_length() {
        assert_range_error(std::panic::catch_unwind(|| {
            decode_utf8(&[65], Some(5), None)
        }));
    }

    #[test]
    fn rejects_offset_beyond_end_with_explicit_length() {
        assert_range_error(std::panic::catch_unwind(|| {
            decode_utf8(&[65], Some(5), Some(1))
        }));
    }

    #[test]
    fn rejects_huge_length_that_overflows_usize() {
        assert_range_error(std::panic::catch_unwind(|| {
            decode_utf8(&[65], Some(1), Some(usize::MAX))
        }));
    }
}

mod encode_utf8 {
    use super::*;

    #[test]
    fn encodes_empty_and_ascii_input() {
        let empty: [u8; 0] = [];
        assert_eq!(*encode_utf8(""), empty);
        assert_eq!(
            *encode_utf8("\0Hello\x7F"),
            [0, 72, 101, 108, 108, 111, 0x7F]
        );
    }

    #[test]
    fn encodes_two_three_and_four_byte_sequences() {
        assert_eq!(
            *encode_utf8("\u{00A2}\u{20AC}\u{1F600}"),
            [0xC2, 0xA2, 0xE2, 0x82, 0xAC, 0xF0, 0x9F, 0x98, 0x80]
        );
    }

    #[test]
    fn encodes_the_replacement_character() {
        // D15: Rust String is valid UTF-8; the TS unpaired-surrogate input ('\ud800A\udc00')
        // is unrepresentable. This test covers U+FFFD encoding only.
        assert_eq!(*encode_utf8("\u{FFFD}"), [0xEF, 0xBF, 0xBD]);
    }
}
