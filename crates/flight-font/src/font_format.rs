use flight_buffer::get_array_buffer_storage;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn fontformatdata_detect_font_format_matches_detect_font_format() {
        let bytes = b"wOF2";
        let method =
            FontFormatData::Uint8Array(FontFormatUint8Array { bytes }).detect_font_format();
        let free = detect_font_format(FontFormatData::Uint8Array(FontFormatUint8Array { bytes }));
        assert_eq!(method, free);
    }
}

/// Detects TrueType, OpenType, WOFF, WOFF2, or a font collection from its four-byte signature.
pub fn detect_font_format(bytes: FontFormatData<'_>) -> Option<&'static str> {
    return match bytes {
        FontFormatData::ArrayBuffer(value) => {
            let storage = get_array_buffer_storage(value.bytes);
            let bytes = storage.read().unwrap();
            detect_font_format_bytes(&bytes)
        }
        FontFormatData::Uint8Array(value) => detect_font_format_bytes(value.bytes),
    };
}

fn detect_font_format_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 4 {
        return None;
    }
    return match [bytes[0], bytes[1], bytes[2], bytes[3]] {
        [0x00, 0x01, 0x00, 0x00] | [0x74, 0x72, 0x75, 0x65] => Some("truetype"),
        [0x4f, 0x54, 0x54, 0x4f] => Some("opentype"),
        [0x77, 0x4f, 0x46, 0x46] => Some("woff"),
        [0x77, 0x4f, 0x46, 0x32] => Some("woff2"),
        [0x74, 0x74, 0x63, 0x66] => Some("collection"),
        _ => None,
    };
}

/// Infers the CSS format name from the final extension before the first query delimiter.
pub fn infer_font_format_from_url(url: &str) -> Option<&'static str> {
    let path = url.split('?').next().unwrap_or("");
    let extension = path.rsplit('.').next().unwrap_or("").to_lowercase();
    return match extension.as_str() {
        "eot" => Some("embedded-opentype"),
        "otf" => Some("opentype"),
        "svg" => Some("svg"),
        "ttf" => Some("truetype"),
        "woff" => Some("woff"),
        "woff2" => Some("woff2"),
        _ => None,
    };
}

impl FontFormatData<'_> {
    pub fn detect_font_format(self) -> Option<&'static str> {
        return detect_font_format(self);
    }
}
