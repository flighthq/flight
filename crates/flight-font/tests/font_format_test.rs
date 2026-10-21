use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    get_array_buffer_storage,
};
use flight_font::contract::*;

mod detect_font_format {
    use super::*;

    fn detect(bytes: &[u8]) -> Option<&'static str> {
        return detect_font_format(FontFormatData::Uint8Array(FontFormatUint8Array { bytes }));
    }

    #[test]
    fn accepts_an_array_buffer_as_well_as_a_uint8_array() {
        let buffer = create_array_buffer_from_bytes(Box::new([0x77, 0x4f, 0x46, 0x46]));
        assert_eq!(
            detect_font_format(FontFormatData::ArrayBuffer(FontFormatArrayBuffer {
                bytes: &buffer,
            })),
            Some("woff")
        );
    }

    #[test]
    fn detects_all_declared_four_byte_signatures() {
        assert_eq!(detect(&[0x00, 0x01, 0x00, 0x00]), Some("truetype"));
        assert_eq!(detect(b"OTTO"), Some("opentype"));
        assert_eq!(detect(b"wOFF"), Some("woff"));
        assert_eq!(detect(b"wOF2"), Some("woff2"));
        assert_eq!(detect(b"ttcf"), Some("collection"));
        assert_eq!(detect(b"true"), Some("truetype"));
    }

    #[test]
    fn ignores_trailing_bytes_past_the_signature() {
        assert_eq!(detect(b"OTTO with more data"), Some("opentype"));
    }

    #[test]
    fn reads_only_the_declared_uint8_array_view_window() {
        let buffer = create_array_buffer_from_bytes(Box::new([
            0xaa, 0xbb, 0xcc, 0xdd, 0x77, 0x4f, 0x46, 0x32, 0xee,
        ]));
        let view =
            create_array_buffer_view(&buffer, 4, 4, ArrayBufferViewKind::Uint8Array).unwrap();
        let storage = get_array_buffer_storage(&view.buffer);
        let storage = storage.read().unwrap();
        assert_eq!(detect(&storage[4..8]), Some("woff2"));
        assert_eq!(detect(&storage[4..7]), None);
    }

    #[test]
    fn returns_null_for_an_unrecognized_or_short_signature() {
        assert_eq!(detect(b"%PDF"), None);
        assert_eq!(detect(&[0x00, 0x01, 0x00]), None);
    }
}

mod infer_font_format_from_url {
    use super::*;

    #[test]
    fn ignores_a_query_and_matches_case_insensitively() {
        assert_eq!(
            infer_font_format_from_url("font.WOFF2?v=123"),
            Some("woff2")
        );
    }

    #[test]
    fn maps_every_declared_extension() {
        assert_eq!(infer_font_format_from_url("font.woff"), Some("woff"));
        assert_eq!(infer_font_format_from_url("font.woff2"), Some("woff2"));
        assert_eq!(infer_font_format_from_url("font.ttf"), Some("truetype"));
        assert_eq!(infer_font_format_from_url("font.otf"), Some("opentype"));
        assert_eq!(
            infer_font_format_from_url("font.eot"),
            Some("embedded-opentype")
        );
        assert_eq!(infer_font_format_from_url("font.svg"), Some("svg"));
    }

    #[test]
    fn returns_null_for_an_unknown_or_absent_extension() {
        assert_eq!(infer_font_format_from_url("font.bin"), None);
        assert_eq!(infer_font_format_from_url("font"), None);
    }
}
