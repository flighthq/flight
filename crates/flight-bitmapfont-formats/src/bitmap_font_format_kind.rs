use flight_encoding::decode_utf8;
use flight_entity::Uint8Array;

use crate::bitmap_font_json::is_bitmap_font_json_object;
use crate::types::*;

const DETECT_WINDOW_BYTES: usize = 4096;

fn has_bitmap_font_text_block(head: &str) -> bool {
    for raw_line in head.split(['\r', '\n']) {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        let tag_end = line.find(char::is_whitespace).unwrap_or(line.len());
        return matches!(
            &line[..tag_end],
            "info" | "common" | "page" | "char" | "chars"
        );
    }
    return false;
}

pub fn read_bitmap_font_format_kind(bytes: &Uint8Array) -> Option<BitmapFontFormatKind> {
    if bytes.len() >= 4 && bytes[0..4] == [66, 77, 70, 3] {
        return Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY.to_string());
    }
    let head = decode_utf8(bytes, Some(0), Some(bytes.len().min(DETECT_WINDOW_BYTES)));
    let trimmed = head.trim_start();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('<') {
        return (read_xml_root_element_name(trimmed).as_deref() == Some("font"))
            .then(|| BITMAP_FONT_FORMAT_KIND_BM_FONT_XML.to_string());
    }
    if trimmed.starts_with('{') {
        let text = decode_utf8(bytes, None, None);
        return is_bitmap_font_json_object(&text)
            .then(|| BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON.to_string());
    }
    return has_bitmap_font_text_block(trimmed)
        .then(|| BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string());
}

fn read_xml_root_element_name(trimmed: &str) -> Option<String> {
    let mut index = 0;
    while index < trimmed.len() {
        let remaining = &trimmed[index..];
        if !remaining.starts_with('<') {
            index += remaining.find('<')?;
            continue;
        }
        if remaining.starts_with("<?") || remaining.starts_with("<!") {
            if remaining.starts_with("<!--") {
                index += remaining.find("-->")? + 3;
            } else {
                index += remaining.find('>')? + 1;
            }
            continue;
        }
        let name = remaining.strip_prefix('<')?;
        let mut chars = name.char_indices();
        let (_, first) = chars.next()?;
        if !(first.is_ascii_alphabetic() || first == '_') {
            return None;
        }
        let mut end = first.len_utf8();
        for (at, character) in chars {
            if character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | ':' | '-') {
                end = at + character.len_utf8();
            } else {
                break;
            }
        }
        return Some(name[..end].to_string());
    }
    return None;
}
