pub(crate) fn is_md5_whitespace(value: char) -> bool {
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

// flight-lint: allow(f64) Principal7f1f0994 private MD5 parseFloat prefix and Number.isFinite adapter; only final canonical records narrow to f32
pub(crate) fn parse_md5_float(token: &str) -> Option<f64> {
    let token = token.trim_start_matches(is_md5_whitespace);
    let bytes = token.as_bytes();
    let mut index = usize::from(matches!(bytes.first(), Some(b'+' | b'-')));
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
        return None;
    }
    if matches!(bytes.get(index), Some(b'e' | b'E')) {
        let exponent = index;
        index += 1;
        if matches!(bytes.get(index), Some(b'+' | b'-')) {
            index += 1;
        }
        let first_digit = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        if index == first_digit {
            index = exponent;
        }
    }
    let value = token[..index].parse::<f64>().ok()?;
    return value.is_finite().then_some(value);
}

// flight-lint: allow(f64) Principal7f1f0994 private MD5 decimal parseInt prefix/finite validation before canonical integer projection; source ignores trailing token characters
pub(crate) fn parse_md5_integer(token: &str) -> Option<f64> {
    let token = token.trim_start_matches(is_md5_whitespace);
    let bytes = token.as_bytes();
    let mut index = usize::from(matches!(bytes.first(), Some(b'+' | b'-')));
    let first_digit = index;
    while bytes.get(index).is_some_and(u8::is_ascii_digit) {
        index += 1;
    }
    if index == first_digit {
        return None;
    }
    let value = token[..index].parse::<f64>().ok()?;
    return value.is_finite().then_some(value);
}
