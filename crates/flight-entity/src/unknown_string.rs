use crate::{FlightError, Unknown, get_flight_error_kind_string};

/// Projects the canonical Unknown representations through JavaScript `String(value)` semantics.
/// This deliberately models only the ruled built-in cases. Custom user object stringification is
/// not modeled; every other object returns the ordinary `"[object Object]"` fallback without
/// consulting Rust `Debug`, `Display`, or reflection.
// flight-lint: allow(f64) concrete JS-number payloads require the audited double-precision formatter
// flight-lint: allow(conform-extra) Principal batch10 approved portable String(unknown) projection helper, not a Flight entity source export
pub fn unknown_to_js_string(value: &Unknown) -> String {
    let Some(value) = value else {
        return "null".to_string();
    };
    if let Some(error) = value.downcast_ref::<FlightError>() {
        let name = get_flight_error_kind_string(error.kind);
        if name.is_empty() {
            return error.message.clone();
        }
        if error.message.is_empty() {
            return name.to_string();
        }
        return format!("{}: {}", name, error.message);
    }
    if let Some(text) = value.downcast_ref::<String>() {
        return text.clone();
    }
    if let Some(text) = value.downcast_ref::<&'static str>() {
        return (*text).to_string();
    }
    if let Some(number) = value.downcast_ref::<f64>() {
        return write_js_number(*number);
    }
    if let Some(number) = value.downcast_ref::<f32>() {
        return write_js_number(f64::from(*number));
    }
    if let Some(number) = value.downcast_ref::<i8>() {
        return write_js_number(f64::from(*number));
    }
    if let Some(number) = value.downcast_ref::<i16>() {
        return write_js_number(f64::from(*number));
    }
    if let Some(number) = value.downcast_ref::<i32>() {
        return write_js_number(f64::from(*number));
    }
    if let Some(number) = value.downcast_ref::<i64>() {
        return write_js_number(*number as f64);
    }
    if let Some(number) = value.downcast_ref::<isize>() {
        return write_js_number(*number as f64);
    }
    if let Some(number) = value.downcast_ref::<u8>() {
        return write_js_number(f64::from(*number));
    }
    if let Some(number) = value.downcast_ref::<u16>() {
        return write_js_number(f64::from(*number));
    }
    if let Some(number) = value.downcast_ref::<u32>() {
        return write_js_number(f64::from(*number));
    }
    if let Some(number) = value.downcast_ref::<u64>() {
        return write_js_number(*number as f64);
    }
    if let Some(number) = value.downcast_ref::<usize>() {
        return write_js_number(*number as f64);
    }
    if let Some(value) = value.downcast_ref::<bool>() {
        return value.to_string();
    }
    return "[object Object]".to_string();
}

// JavaScript `Number.prototype.toString()` (radix 10, ECMAScript Number::toString): the shortest
// round-trip digits, laid out in fixed notation for decimal exponents in (-6, 21] and exponent
// notation (`1e+21`, `1e-7`) otherwise; -0 is "0". This is the same audited formatter used by
// flight-path-formats for SVG numeric serialization.
// flight-lint: allow(f64) JS numbers and Unknown numeric payloads use double precision
fn write_js_number(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_string();
    }
    if value == 0.0 {
        return "0".to_string();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    let sign = if value < 0.0 { "-" } else { "" };
    let scientific = format!("{:e}", value.abs());
    let (mantissa, exponent) = scientific.split_once('e').unwrap();
    let digits: String = mantissa
        .chars()
        .filter(|character| *character != '.')
        .collect();
    let digit_count = digits.len() as i64;
    let decimal_position = exponent.parse::<i64>().unwrap() + 1;
    let body = if digit_count <= decimal_position && decimal_position <= 21 {
        format!(
            "{}{}",
            digits,
            "0".repeat((decimal_position - digit_count) as usize)
        )
    } else if 0 < decimal_position && decimal_position <= 21 {
        format!(
            "{}.{}",
            &digits[..decimal_position as usize],
            &digits[decimal_position as usize..]
        )
    } else if -6 < decimal_position && decimal_position <= 0 {
        format!("0.{}{}", "0".repeat((-decimal_position) as usize), digits)
    } else {
        let exponent = decimal_position - 1;
        let exponent_sign = if exponent < 0 { "-" } else { "+" };
        if digit_count == 1 {
            format!("{}e{}{}", digits, exponent_sign, exponent.abs())
        } else {
            format!(
                "{}.{}e{}{}",
                &digits[..1],
                &digits[1..],
                exponent_sign,
                exponent.abs()
            )
        }
    };
    return format!("{}{}", sign, body);
}
