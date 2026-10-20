use flight_encoding::*;

mod decode_utf8 {
    use super::*;

    #[test]
    fn decodes_empty_and_ascii_input() {
        assert_eq!(decode_utf8(&[], 0, 0), "");
        assert_eq!(
            decode_utf8(&[0, 72, 101, 108, 108, 111, 0x7F], 0, 7),
            "\0Hello\x7F"
        );
    }

    #[test]
    fn decodes_two_three_and_four_byte_sequences() {
        assert_eq!(
            decode_utf8(
                &[0xC2, 0xA2, 0xE2, 0x82, 0xAC, 0xF0, 0x9F, 0x98, 0x80],
                0,
                9
            ),
            "\u{00A2}\u{20AC}\u{1F600}"
        );
    }

    #[test]
    fn replaces_malformed_and_incomplete_sequences_without_consuming_the_next_valid_byte() {
        assert_eq!(
            decode_utf8(&[0x80, 0xC0, 0xAF], 0, 3),
            "\u{FFFD}\u{FFFD}\u{FFFD}"
        );
        assert_eq!(
            decode_utf8(&[0xE2, 0x28, 0xA1], 0, 3),
            "\u{FFFD}(\u{FFFD}"
        );
        assert_eq!(
            decode_utf8(&[0xED, 0xA0, 0x80], 0, 3),
            "\u{FFFD}\u{FFFD}\u{FFFD}"
        );
        assert_eq!(decode_utf8(&[0xE2, 0x82], 0, 2), "\u{FFFD}");
    }

    #[test]
    fn honors_offset_and_length_windows_without_reading_adjacent_bytes() {
        let bytes: &[u8] = &[0xFF, 72, 0xC3, 0xA9, 0xFF];
        assert_eq!(decode_utf8(bytes, 1, 3), "H\u{00E9}");
        assert_eq!(decode_utf8(bytes, 1, 0), "");
        assert_eq!(decode_utf8(bytes, 5, 0), "");
        assert_eq!(decode_utf8(&[0xE2, 0x82, 0xAC], 0, 2), "\u{FFFD}");
    }

    #[test]
    #[should_panic]
    fn rejects_windows_outside_the_byte_array() {
        let bytes: &[u8] = &[65];
        decode_utf8(bytes, 0, 2);
    }
}

mod encode_utf8 {
    use super::*;

    #[test]
    fn encodes_empty_and_ascii_input() {
        let empty: Vec<u8> = vec![];
        assert_eq!(encode_utf8(""), empty);
        assert_eq!(
            encode_utf8("\0Hello\x7F"),
            vec![0, 72, 101, 108, 108, 111, 0x7F]
        );
    }

    #[test]
    fn encodes_two_three_and_four_byte_sequences() {
        assert_eq!(
            encode_utf8("\u{00A2}\u{20AC}\u{1F600}"),
            vec![0xC2, 0xA2, 0xE2, 0x82, 0xAC, 0xF0, 0x9F, 0x98, 0x80]
        );
    }

    #[test]
    fn encodes_replacement_character() {
        assert_eq!(encode_utf8("\u{FFFD}"), vec![0xEF, 0xBF, 0xBD]);
    }
}
