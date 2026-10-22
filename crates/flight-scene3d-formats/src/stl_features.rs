use flight_encoding::decode_utf8;
use flight_entity::Uint8Array;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StlFeatures {
    pub triangle_count: usize,
    pub variant: StlVariant,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StlVariant {
    Ascii,
    Binary,
}

pub const BINARY_STL_COUNT_OFFSET: usize = 80;
pub const BINARY_STL_HEADER_SIZE: usize = 84;
pub const BINARY_STL_TRIANGLE_SIZE: usize = 50;
pub const STL_MESH_FEATURE: &str = "Mesh";

// flight-lint: allow(f64) STL finite-token predicate must accept every finite JS Number before Float32Array output, including 1e300; private adapter only
fn are_finite_numbers(tokens: &[&str], start: usize, count: usize) -> bool {
    for index in start..start + count {
        if !tokens
            .get(index)
            .is_some_and(|token| parse_stl_number(token).is_finite())
        {
            return false;
        }
    }
    return true;
}

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned output; boolean retains the source nullable-result success distinction
pub fn collect_stl_features(out: &mut StlFeatures, bytes: &Uint8Array) -> bool {
    if let Some(triangle_count) = read_binary_stl_triangle_count(bytes) {
        out.triangle_count = triangle_count;
        out.variant = StlVariant::Binary;
        return true;
    }
    let head = decode_utf8(bytes, Some(0), Some(bytes.len().min(64)));
    let head = head.trim_start_matches(is_stl_whitespace);
    if !head
        .get(..5)
        .is_some_and(|head| head.eq_ignore_ascii_case("solid"))
    {
        return false;
    }
    let text = decode_utf8(bytes, None, None);
    let Some(triangle_count) = count_ascii_stl_facets(&text) else {
        return false;
    };
    out.triangle_count = triangle_count;
    out.variant = StlVariant::Ascii;
    return true;
}

pub fn count_ascii_stl_facets(text: &str) -> Option<usize> {
    let trimmed = text.trim_matches(is_stl_whitespace);
    if trimmed.is_empty() {
        return None;
    }
    let first_break = trimmed.find(['\r', '\n']);
    let header = first_break
        .map_or(trimmed, |index| &trimmed[..index])
        .trim_matches(is_stl_whitespace);
    if !header
        .split(is_stl_whitespace)
        .next()
        .is_some_and(|word| word.eq_ignore_ascii_case("solid"))
    {
        return None;
    }
    let body = first_break
        .map_or("", |index| &trimmed[index..])
        .trim_matches(is_stl_whitespace);
    let tokens: Vec<&str> = body
        .split(is_stl_whitespace)
        .filter(|word| !word.is_empty())
        .collect();
    let mut index = 0;
    let mut facets = 0;
    while index < tokens.len() {
        let token = tokens[index];
        if token.eq_ignore_ascii_case("endsolid") {
            break;
        }
        let keyword = |index: usize, word: &str| {
            tokens
                .get(index)
                .is_some_and(|token| token.eq_ignore_ascii_case(word))
        };
        if !token.eq_ignore_ascii_case("facet")
            || !keyword(index + 1, "normal")
            || !are_finite_numbers(&tokens, index + 2, 3)
            || !keyword(index + 5, "outer")
            || !keyword(index + 6, "loop")
        {
            return None;
        }
        let mut cursor = index + 7;
        for _ in 0..3 {
            if !keyword(cursor, "vertex") || !are_finite_numbers(&tokens, cursor + 1, 3) {
                return None;
            }
            cursor += 4;
        }
        if !keyword(cursor, "endloop") || !keyword(cursor + 1, "endfacet") {
            return None;
        }
        facets += 1;
        index = cursor + 2;
    }
    return if facets == 0 { None } else { Some(facets) };
}

// flight-lint: allow(conform-extra) D9 exact string conversion for source StlVariant union
pub fn get_stl_variant_string(value: StlVariant) -> &'static str {
    return match value {
        StlVariant::Ascii => "Ascii",
        StlVariant::Binary => "Binary",
    };
}

pub(crate) fn is_stl_whitespace(value: char) -> bool {
    return matches!(
        value,
        '\t' | '\n' | '\u{000b}' | '\u{000c}' | '\r' | ' ' | '\u{00a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    );
}

// flight-lint: allow(f64) private JS Number adapter for STL source finite checking and pre-Float32Array coordinate arithmetic; no public precision change
pub(crate) fn parse_stl_number(text: &str) -> f64 {
    let text = text.trim_matches(is_stl_whitespace);
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0b", 2),
        ("0B", 2),
        ("0o", 8),
        ("0O", 8),
    ] {
        if let Some(digits) = text.strip_prefix(prefix) {
            if digits.is_empty() {
                return f64::NAN;
            }
            let mut result = 0.0;
            for digit in digits.chars() {
                let Some(digit) = digit.to_digit(radix) else {
                    return f64::NAN;
                };
                result = result * radix as f64 + digit as f64;
            }
            return result;
        }
    }
    if text.is_empty() {
        return 0.0;
    }
    if matches!(text, "Infinity" | "+Infinity") {
        return f64::INFINITY;
    }
    if text == "-Infinity" {
        return f64::NEG_INFINITY;
    }
    let bytes = text.as_bytes();
    let mut index = usize::from(matches!(bytes.first(), Some(b'+') | Some(b'-')));
    let mut digits = 0;
    while bytes.get(index).is_some_and(u8::is_ascii_digit) {
        index += 1;
        digits += 1;
    }
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
            digits += 1;
        }
    }
    if digits == 0 {
        return f64::NAN;
    }
    if matches!(bytes.get(index), Some(b'e') | Some(b'E')) {
        index += 1;
        if matches!(bytes.get(index), Some(b'+') | Some(b'-')) {
            index += 1;
        }
        let start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        if index == start {
            return f64::NAN;
        }
    }
    if index != bytes.len() {
        return f64::NAN;
    }
    return text.parse().unwrap_or(f64::NAN);
}

// flight-lint: allow(conform-extra) D9 exact string conversion for source StlVariant union
pub fn parse_stl_variant(value: &str) -> Option<StlVariant> {
    return match value {
        "Ascii" => Some(StlVariant::Ascii),
        "Binary" => Some(StlVariant::Binary),
        _ => None,
    };
}

pub fn read_binary_stl_triangle_count(bytes: &Uint8Array) -> Option<usize> {
    if bytes.len() < BINARY_STL_HEADER_SIZE {
        return None;
    }
    let count = u32::from_le_bytes(
        bytes[BINARY_STL_COUNT_OFFSET..BINARY_STL_HEADER_SIZE]
            .try_into()
            .unwrap(),
    ) as usize;
    if count == 0 {
        return None;
    }
    let expected =
        (BINARY_STL_HEADER_SIZE as u64) + (count as u64) * (BINARY_STL_TRIANGLE_SIZE as u64);
    return if bytes.len() as u64 == expected {
        Some(count)
    } else {
        None
    };
}
