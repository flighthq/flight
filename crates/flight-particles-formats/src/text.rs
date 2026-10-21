//! JavaScript text/number compatibility helpers shared by the format parsers.

/// Formats a number the way `JSON.stringify`/`String(value)` would for the values particle
/// formats carry: integers without a decimal point, and `-0` as `0`.
pub(crate) fn format_js_number(value: f32) -> String {
    if value.is_nan() {
        return String::from("NaN");
    }
    if value.is_infinite() {
        return String::from(if value > 0.0 { "Infinity" } else { "-Infinity" });
    }
    if value == 0.0 {
        return String::from("0");
    }
    if value.fract() == 0.0 && value.abs() < 1e21 {
        return format!("{}", value as i128);
    }
    return format!("{}", value);
}

/// Parses a leading JavaScript `parseFloat` prefix: optional whitespace/sign, digits with an
/// optional fraction, then an optional exponent. Returns `None` when no numeric prefix exists.
pub(crate) fn parse_js_float(text: &str) -> Option<f32> {
    let trimmed = text.trim_start();
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    let mut negative = false;
    if index < bytes.len() && (bytes[index] == b'+' || bytes[index] == b'-') {
        negative = bytes[index] == b'-';
        index += 1;
    }
    let signed = index > 0;
    let digits_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    let mut has_digits = index > digits_start;
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        let fraction_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        has_digits = has_digits || index > fraction_start;
    }
    if has_digits && index < bytes.len() && (bytes[index] == b'e' || bytes[index] == b'E') {
        let mut exponent_index = index + 1;
        if exponent_index < bytes.len()
            && (bytes[exponent_index] == b'+' || bytes[exponent_index] == b'-')
        {
            exponent_index += 1;
        }
        let exponent_start = exponent_index;
        while exponent_index < bytes.len() && bytes[exponent_index].is_ascii_digit() {
            exponent_index += 1;
        }
        if exponent_index > exponent_start {
            index = exponent_index;
        }
    }
    if !has_digits {
        let rest = &trimmed[if signed { 1 } else { 0 }..];
        if rest.starts_with("Infinity") {
            return Some(if negative {
                f32::NEG_INFINITY
            } else {
                f32::INFINITY
            });
        }
        return None;
    }
    return trimmed[..index].parse::<f32>().ok();
}

/// Parses a JavaScript base-10 `parseInt` prefix as a finite integer.
pub(crate) fn parse_js_int(text: &str) -> Option<i64> {
    let trimmed = text.trim_start();
    let bytes = trimmed.as_bytes();
    let mut index = 0;
    if index < bytes.len() && (bytes[index] == b'+' || bytes[index] == b'-') {
        index += 1;
    }
    let digits_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index == digits_start {
        return None;
    }
    return trimmed[..index].parse::<i64>().ok();
}
