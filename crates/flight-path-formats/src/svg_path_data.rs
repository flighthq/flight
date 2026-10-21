use flight_path::{
    Path, PathSegment, append_path_close, append_path_cubic_curve_to,
    append_path_elliptical_arc_to, append_path_line_to, append_path_move_to,
    append_path_quadratic_curve_to, create_path, for_each_path_segment,
};

use crate::types::*;

/// The scanner over the input's UTF-16 code units, so positions are the source's string indices.
struct SvgPathDataReader {
    units: Vec<u16>,
    pos: usize,
}

/// Parses an SVG path `d` string into the end of an existing `path`, appending its contours via the
/// flight-path builders. Supports the full SVG path grammar: absolute (uppercase) and relative
/// (lowercase) `M L H V C S Q T A Z`, implicit repeated commands, and the smooth-curve shorthands
/// `S`/`T` (reflecting the previous cubic/quadratic control point). Returns `false` on structurally
/// malformed input (a leading command that is not moveto, an unknown command letter, or a
/// missing/short coordinate run); the input is parsed into a scratch path first, so a failed parse
/// leaves `path` unchanged. Returns `true` when the whole string parses. An empty or
/// whitespace-only string is well-formed and appends nothing.
///
/// Elliptic arcs (`A`/`a`) are appended through `append_path_elliptical_arc_to`, which approximates
/// them as cubic bezier segments, so a later `for_each_path_segment` walk (and
/// `format_svg_path_data`) sees cubics, not an arc verb. The geometry round-trips; the arc command
/// does not.
pub fn append_svg_path_data(path: &mut Path, d: &str) -> bool {
    let mut scratch = create_path(None);
    if parse_svg_path_data_into(&mut scratch, d).is_some() {
        return false;
    }
    path.commands.extend_from_slice(&scratch.commands);
    path.data.extend_from_slice(&scratch.data);
    return true;
}

/// Explains why an SVG path `d` string cannot be parsed: `None` for well-formed input, or the input
/// position (UTF-16 code-unit index) and a stable reason for malformed input.
pub fn explain_svg_path_data(d: &str) -> Option<SvgPathDataExplanation> {
    return parse_svg_path_data_into(&mut create_path(None), d);
}

fn explanation(position: usize, reason: &str) -> Option<SvgPathDataExplanation> {
    return Some(SvgPathDataExplanation {
        position,
        reason: reason.to_string(),
    });
}

// flight-lint: allow(f64) path coordinates and the rounding factor are f64 (Path.data, TS number)
fn format_svg_number(value: f64, precision: Option<f64>) -> String {
    let Some(precision) = precision else {
        return get_js_number_string(value);
    };
    let factor = 10.0_f64.powf(precision);
    // String() of the rounded number drops trailing zeros and normalizes -0 to "0".
    return get_js_number_string(round_js(value * factor) / factor);
}

/// Serializes a `Path` to an SVG path `d` string, emitting absolute commands. Each `PathSegment`
/// maps to its SVG verb: `MoveTo`→`M`, `LineTo`→`L`, `QuadraticCurveTo`→`Q`, `CubicCurveTo`→`C`,
/// `Close`→`Z`. Arcs are not a distinct segment kind (the path stores them as cubics), so no `A`
/// command is produced.
///
/// `options.precision`, when given, rounds every coordinate to that many decimal places and drops
/// trailing zeros; the default emits full-precision numbers (also trailing-zero-free). Numbers are
/// spelled as JavaScript's `String(number)` spells them.
pub fn format_svg_path_data(path: &Path, options: Option<&SvgPathDataFormatOptions>) -> String {
    let precision = options.and_then(|options| options.precision);
    let mut parts: Vec<String> = Vec::new();
    for_each_path_segment(path, &mut |segment: PathSegment| match segment {
        PathSegment::MoveTo { x, y } => {
            parts.push(format!(
                "M{} {}",
                format_svg_number(x, precision),
                format_svg_number(y, precision)
            ));
        }
        PathSegment::LineTo { x, y } => {
            parts.push(format!(
                "L{} {}",
                format_svg_number(x, precision),
                format_svg_number(y, precision)
            ));
        }
        PathSegment::QuadraticCurveTo {
            control_x,
            control_y,
            x,
            y,
        } => {
            parts.push(format!(
                "Q{} {} {} {}",
                format_svg_number(control_x, precision),
                format_svg_number(control_y, precision),
                format_svg_number(x, precision),
                format_svg_number(y, precision)
            ));
        }
        PathSegment::CubicCurveTo {
            control_x1,
            control_y1,
            control_x2,
            control_y2,
            x,
            y,
        } => {
            parts.push(format!(
                "C{} {} {} {} {} {}",
                format_svg_number(control_x1, precision),
                format_svg_number(control_y1, precision),
                format_svg_number(control_x2, precision),
                format_svg_number(control_y2, precision),
                format_svg_number(x, precision),
                format_svg_number(y, precision)
            ));
        }
        PathSegment::Close => parts.push("Z".to_string()),
    });
    return parts.join("");
}

// JavaScript `Number.prototype.toString()` (radix 10, ECMAScript Number::toString): the shortest
// round-trip digits, laid out in fixed notation for decimal exponents in (-6, 21] and exponent
// notation (`1e+21`, `1e-7`) otherwise; -0 is "0".
// flight-lint: allow(f64) JS numbers are f64
fn get_js_number_string(value: f64) -> String {
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
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i64;
    let n = exponent.parse::<i64>().unwrap() + 1;
    let body = if k <= n && n <= 21 {
        format!("{}{}", digits, "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), digits)
    } else {
        let e = n - 1;
        let exponent_sign = if e < 0 { "-" } else { "+" };
        if k == 1 {
            format!("{}e{}{}", digits, exponent_sign, e.abs())
        } else {
            format!(
                "{}.{}e{}{}",
                &digits[..1],
                &digits[1..],
                exponent_sign,
                e.abs()
            )
        }
    };
    return format!("{}{}", sign, body);
}

fn is_ascii_letter(unit: u16) -> bool {
    return (65..=90).contains(&unit) || (97..=122).contains(&unit);
}

fn is_digit(reader: &SvgPathDataReader) -> bool {
    return reader.pos < reader.units.len()
        && reader.units[reader.pos] >= u16::from(b'0')
        && reader.units[reader.pos] <= u16::from(b'9');
}

fn is_svg_command_letter(unit: u16) -> bool {
    return "MmLlHhVvCcSsQqTtAaZz"
        .encode_utf16()
        .any(|letter| letter == unit);
}

fn is_unit(reader: &SvgPathDataReader, a: u8, b: u8) -> bool {
    return reader.pos < reader.units.len()
        && (reader.units[reader.pos] == u16::from(a) || reader.units[reader.pos] == u16::from(b));
}

/// Parses an SVG path `d` string into a freshly allocated `Path`, or `None` on structurally
/// malformed input (see `append_svg_path_data` for the malformed cases). An empty or
/// whitespace-only string yields an empty path, not `None`.
pub fn parse_svg_path_data(d: &str) -> Option<Path> {
    let mut path = create_path(None);
    if parse_svg_path_data_into(&mut path, d).is_some() {
        return None;
    }
    return Some(path);
}

// flight-lint: allow(f64) path coordinates are f64 (Path.data, TS number)
fn parse_svg_path_data_into(path: &mut Path, d: &str) -> Option<SvgPathDataExplanation> {
    let mut reader = SvgPathDataReader {
        units: d.encode_utf16().collect(),
        pos: 0,
    };
    let length = reader.units.len();

    // Current point, subpath start (for Z), and the last emitted control points in absolute space.
    // `last_control2` feeds `S` reflection (valid only after C/S); `last_quad_control` feeds `T`
    // reflection (valid only after Q/T). `last_kind` records the previous group's canonical letter
    // (0 = none yet) so a shorthand can decide whether reflection applies.
    let mut current_x = 0.0;
    let mut current_y = 0.0;
    let mut start_x = 0.0;
    let mut start_y = 0.0;
    let mut last_control2_x = 0.0;
    let mut last_control2_y = 0.0;
    let mut last_quad_control_x = 0.0;
    let mut last_quad_control_y = 0.0;
    let mut last_kind: u8 = 0;

    loop {
        skip_separators(&mut reader);
        if reader.pos >= length {
            break;
        }

        let command_letter = reader.units[reader.pos];
        if !is_svg_command_letter(command_letter) {
            return explanation(reader.pos, "expected-command");
        }
        reader.pos += 1;

        // Path data must open with a moveto.
        if last_kind == 0 && command_letter != u16::from(b'M') && command_letter != u16::from(b'm')
        {
            return explanation(reader.pos - 1, "expected-moveto");
        }

        if command_letter == u16::from(b'Z') || command_letter == u16::from(b'z') {
            append_path_close(path);
            current_x = start_x;
            current_y = start_y;
            last_kind = b'Z';
            continue;
        }

        // Execute one or more operand groups. After the first `M`/`m` group, implicit repeats are
        // lineto groups (SVG spec), so the active letter shifts from M→L (or m→l).
        let mut active = command_letter as u8;
        let mut first = true;
        loop {
            if !first {
                skip_separators(&mut reader);
                if reader.pos >= length {
                    break;
                }
                // Any letter ends the current operand run. The outer command reader then
                // distinguishes a supported command from an unknown one and can report the latter at
                // its actual position.
                if is_ascii_letter(reader.units[reader.pos]) {
                    break;
                }
            }

            let relative = active >= b'a';
            let upper = active.to_ascii_uppercase();

            // Every operand read runs in order without short-circuiting, as in the source: a failed
            // read leaves the position at its start, and later reads continue from there.
            if upper == b'M' {
                let nx = read_number(&mut reader);
                let ny = read_number(&mut reader);
                let (Some(nx), Some(ny)) = (nx, ny) else {
                    return explanation(reader.pos, "expected-coordinate-pair");
                };
                current_x = if relative { current_x + nx } else { nx };
                current_y = if relative { current_y + ny } else { ny };
                start_x = current_x;
                start_y = current_y;
                append_path_move_to(path, current_x, current_y);
                last_kind = b'M';
            } else if upper == b'L' {
                let nx = read_number(&mut reader);
                let ny = read_number(&mut reader);
                let (Some(nx), Some(ny)) = (nx, ny) else {
                    return explanation(reader.pos, "expected-coordinate-pair");
                };
                current_x = if relative { current_x + nx } else { nx };
                current_y = if relative { current_y + ny } else { ny };
                append_path_line_to(path, current_x, current_y);
                last_kind = b'L';
            } else if upper == b'H' {
                let Some(nx) = read_number(&mut reader) else {
                    return explanation(reader.pos, "expected-coordinate");
                };
                current_x = if relative { current_x + nx } else { nx };
                append_path_line_to(path, current_x, current_y);
                last_kind = b'L';
            } else if upper == b'V' {
                let Some(ny) = read_number(&mut reader) else {
                    return explanation(reader.pos, "expected-coordinate");
                };
                current_y = if relative { current_y + ny } else { ny };
                append_path_line_to(path, current_x, current_y);
                last_kind = b'L';
            } else if upper == b'C' {
                let x1 = read_number(&mut reader);
                let y1 = read_number(&mut reader);
                let x2 = read_number(&mut reader);
                let y2 = read_number(&mut reader);
                let x = read_number(&mut reader);
                let y = read_number(&mut reader);
                let (Some(x1), Some(y1), Some(x2), Some(y2), Some(x), Some(y)) =
                    (x1, y1, x2, y2, x, y)
                else {
                    return explanation(reader.pos, "expected-cubic-coordinates");
                };
                let c1x = if relative { current_x + x1 } else { x1 };
                let c1y = if relative { current_y + y1 } else { y1 };
                let c2x = if relative { current_x + x2 } else { x2 };
                let c2y = if relative { current_y + y2 } else { y2 };
                let ax = if relative { current_x + x } else { x };
                let ay = if relative { current_y + y } else { y };
                append_path_cubic_curve_to(path, c1x, c1y, c2x, c2y, ax, ay);
                last_control2_x = c2x;
                last_control2_y = c2y;
                current_x = ax;
                current_y = ay;
                last_kind = b'C';
            } else if upper == b'S' {
                let x2 = read_number(&mut reader);
                let y2 = read_number(&mut reader);
                let x = read_number(&mut reader);
                let y = read_number(&mut reader);
                let (Some(x2), Some(y2), Some(x), Some(y)) = (x2, y2, x, y) else {
                    return explanation(reader.pos, "expected-smooth-cubic-coordinates");
                };
                let reflect = last_kind == b'C' || last_kind == b'S';
                let c1x = if reflect {
                    2.0 * current_x - last_control2_x
                } else {
                    current_x
                };
                let c1y = if reflect {
                    2.0 * current_y - last_control2_y
                } else {
                    current_y
                };
                let c2x = if relative { current_x + x2 } else { x2 };
                let c2y = if relative { current_y + y2 } else { y2 };
                let ax = if relative { current_x + x } else { x };
                let ay = if relative { current_y + y } else { y };
                append_path_cubic_curve_to(path, c1x, c1y, c2x, c2y, ax, ay);
                last_control2_x = c2x;
                last_control2_y = c2y;
                current_x = ax;
                current_y = ay;
                last_kind = b'S';
            } else if upper == b'Q' {
                let x1 = read_number(&mut reader);
                let y1 = read_number(&mut reader);
                let x = read_number(&mut reader);
                let y = read_number(&mut reader);
                let (Some(x1), Some(y1), Some(x), Some(y)) = (x1, y1, x, y) else {
                    return explanation(reader.pos, "expected-quadratic-coordinates");
                };
                let cx = if relative { current_x + x1 } else { x1 };
                let cy = if relative { current_y + y1 } else { y1 };
                let ax = if relative { current_x + x } else { x };
                let ay = if relative { current_y + y } else { y };
                append_path_quadratic_curve_to(path, cx, cy, ax, ay);
                last_quad_control_x = cx;
                last_quad_control_y = cy;
                current_x = ax;
                current_y = ay;
                last_kind = b'Q';
            } else if upper == b'T' {
                let x = read_number(&mut reader);
                let y = read_number(&mut reader);
                let (Some(x), Some(y)) = (x, y) else {
                    return explanation(reader.pos, "expected-coordinate-pair");
                };
                let reflect = last_kind == b'Q' || last_kind == b'T';
                let cx = if reflect {
                    2.0 * current_x - last_quad_control_x
                } else {
                    current_x
                };
                let cy = if reflect {
                    2.0 * current_y - last_quad_control_y
                } else {
                    current_y
                };
                let ax = if relative { current_x + x } else { x };
                let ay = if relative { current_y + y } else { y };
                append_path_quadratic_curve_to(path, cx, cy, ax, ay);
                last_quad_control_x = cx;
                last_quad_control_y = cy;
                current_x = ax;
                current_y = ay;
                last_kind = b'T';
            } else if upper == b'A' {
                let rx = read_number(&mut reader);
                let ry = read_number(&mut reader);
                let rotation_degrees = read_number(&mut reader);
                let large_arc = read_flag(&mut reader);
                let sweep = read_flag(&mut reader);
                let x = read_number(&mut reader);
                let y = read_number(&mut reader);
                let (
                    Some(rx),
                    Some(ry),
                    Some(rotation_degrees),
                    Some(large_arc),
                    Some(sweep),
                    Some(x),
                    Some(y),
                ) = (rx, ry, rotation_degrees, large_arc, sweep, x, y)
                else {
                    return explanation(reader.pos, "expected-arc-parameters");
                };
                let ax = if relative { current_x + x } else { x };
                let ay = if relative { current_y + y } else { y };
                // append_path_elliptical_arc_to discovers its start through the path's last stored
                // point. CLOSE stores no coordinates, so anchor the SVG pen at the subpath origin
                // before asking it to build cubics.
                if last_kind == b'Z' {
                    append_path_move_to(path, current_x, current_y);
                }
                append_path_elliptical_arc_to(
                    path,
                    rx,
                    ry,
                    (rotation_degrees * std::f64::consts::PI) / 180.0,
                    large_arc,
                    sweep,
                    ax,
                    ay,
                );
                current_x = ax;
                current_y = ay;
                last_kind = b'A';
            } else {
                return explanation(reader.pos - 1, "unsupported-command");
            }

            first = false;
            if active == b'M' {
                active = b'L';
            } else if active == b'm' {
                active = b'l';
            }
        }
    }

    return None;
}

// An arc flag is a single '0' or '1' character, which may be packed against neighbours with no
// separator (`0110` = four flags), so it is read one char at a time rather than as a number.
fn read_flag(reader: &mut SvgPathDataReader) -> Option<bool> {
    skip_separators(reader);
    if is_unit(reader, b'0', b'0') {
        reader.pos += 1;
        return Some(false);
    }
    if is_unit(reader, b'1', b'1') {
        reader.pos += 1;
        return Some(true);
    }
    return None;
}

// flight-lint: allow(f64) path coordinates are f64 (Path.data, TS number)
fn read_number(reader: &mut SvgPathDataReader) -> Option<f64> {
    skip_separators(reader);
    let start = reader.pos;
    if is_unit(reader, b'+', b'-') {
        reader.pos += 1;
    }
    let mut saw_digit = false;
    while is_digit(reader) {
        reader.pos += 1;
        saw_digit = true;
    }
    if is_unit(reader, b'.', b'.') {
        reader.pos += 1;
        while is_digit(reader) {
            reader.pos += 1;
            saw_digit = true;
        }
    }
    if !saw_digit {
        reader.pos = start;
        return None;
    }
    if is_unit(reader, b'e', b'E') {
        let exp_start = reader.pos;
        reader.pos += 1;
        if is_unit(reader, b'+', b'-') {
            reader.pos += 1;
        }
        let mut exp_digit = false;
        while is_digit(reader) {
            reader.pos += 1;
            exp_digit = true;
        }
        if !exp_digit {
            reader.pos = exp_start;
        }
    }
    // The scanned token is ASCII by construction; Rust's correctly rounded f64 parse agrees with
    // `Number.parseFloat` on every token this grammar admits (an overflow parses to infinity).
    let token = String::from_utf16_lossy(&reader.units[start..reader.pos]);
    let value = token.parse::<f64>().ok()?;
    return if value.is_finite() { Some(value) } else { None };
}

// JavaScript `Math.round`: the nearest integer, ties toward +infinity.
// flight-lint: allow(f64) JS numbers are f64
fn round_js(value: f64) -> f64 {
    if !value.is_finite() {
        return value;
    }
    let floor = value.floor();
    let rounded = if value - floor >= 0.5 {
        floor + 1.0
    } else {
        floor
    };
    // Math.round keeps the sign of a negative value that rounds to zero (-0).
    return if rounded == 0.0 && value < 0.0 {
        -0.0
    } else {
        rounded
    };
}

fn skip_separators(reader: &mut SvgPathDataReader) {
    while reader.pos < reader.units.len() {
        // space, tab, LF, CR, FF, or comma
        match reader.units[reader.pos] {
            32 | 9 | 10 | 13 | 12 | 44 => reader.pos += 1,
            _ => break,
        }
    }
}
