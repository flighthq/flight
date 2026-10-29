//! flight-compiler: target-native
//! Exact JS-regex building blocks for the source's UA patterns, written out instead of using a Rust
//! regex engine because the observable semantics differ:
//! - JS `/i` without the `u` flag folds case only where both sides are ASCII (a non-ASCII character
//!   never matches an ASCII pattern letter), whereas Rust regex folds Unicode (the Kelvin sign
//!   U+212A would match `k`);
//! - JS `\s` is WhiteSpace + LineTerminator (it includes U+FEFF and excludes U+0085), which differs
//!   from Rust's `char::is_whitespace`;
//! - JS `.` stops at line terminators (no `s` flag).
//!
//! Text is handled as UTF-16 code units, matching JavaScript string indexing. Every pattern and
//! capture class is ASCII, so a match cannot consume either half of a surrogate pair.

fn ascii_lower(value: u16) -> u16 {
    if (0x0041..=0x005A).contains(&value) {
        return value + 0x0020;
    }
    return value;
}

fn ascii_slice_to_string(text: &[u16], start: usize, end: usize) -> String {
    let mut out = String::new();
    for i in start..end {
        let value = match text[i] {
            0x002E => ".",
            0x0030 => "0",
            0x0031 => "1",
            0x0032 => "2",
            0x0033 => "3",
            0x0034 => "4",
            0x0035 => "5",
            0x0036 => "6",
            0x0037 => "7",
            0x0038 => "8",
            0x0039 => "9",
            0x005F => "_",
            _ => "",
        };
        out = format!("{out}{value}");
    }
    return out;
}

/// JS `/prefix(class+)/i.exec(text)?.[1]`: the first occurrence of `prefix` followed by at least
/// one `class` char, capturing that greedy run.
pub(crate) fn capture_after(
    text: &[u16],
    prefix: &str,
    predicate: fn(u16) -> bool,
) -> Option<String> {
    let prefix_len = utf16_len(prefix);
    for at in positions(text, prefix) {
        let start = at + prefix_len;
        let len = run_len(text, start, predicate);
        if len > 0 {
            return Some(ascii_slice_to_string(text, start, start + len));
        }
    }
    return None;
}

/// JS `/prefix\s+(class+)/i`: `prefix`, at least one JS whitespace, then at least one `class` char.
pub(crate) fn capture_after_whitespace(
    text: &[u16],
    prefix: &str,
    predicate: fn(u16) -> bool,
) -> Option<String> {
    let prefix_len = utf16_len(prefix);
    for at in positions(text, prefix) {
        let ws = run_len(text, at + prefix_len, is_js_whitespace);
        if ws == 0 {
            continue;
        }
        let start = at + prefix_len + ws;
        let len = run_len(text, start, predicate);
        if len > 0 {
            return Some(ascii_slice_to_string(text, start, start + len));
        }
    }
    return None;
}

/// The UA as JavaScript UTF-16 code units, for position-based matching.
pub(crate) fn chars_of(text: &str) -> Vec<u16> {
    return text.encode_utf16().collect();
}

/// JS `/needle/i.test(text)`.
pub(crate) fn contains(text: &[u16], needle: &str) -> bool {
    return find_from(text, 0, needle).is_some();
}

/// JS `/a|b|.../i.test(text)`.
pub(crate) fn contains_any(text: &[u16], needles: &[&str]) -> bool {
    return needles.iter().any(|needle| contains(text, needle));
}

/// JS `/first.*second/i.test(text)`: `second` follows some `first` on the same line.
pub(crate) fn contains_then_on_line(text: &[u16], first: &str, second: &str) -> bool {
    let first_len = utf16_len(first);
    return positions(text, first).into_iter().any(|at| {
        let mut k = at + first_len;
        loop {
            if matches_at(text, k, second) {
                return true;
            }
            if k >= text.len() || is_js_line_terminator(text[k]) {
                return false;
            }
            k += 1;
        }
    });
}

/// The first position at or after `from` where `needle` matches.
pub(crate) fn find_from(text: &[u16], from: usize, needle: &str) -> Option<usize> {
    let len = utf16_len(needle);
    if len > text.len() {
        return None;
    }
    return (from..=text.len() - len).find(|&i| matches_at(text, i, needle));
}

pub(crate) fn is_ascii_digit(c: u16) -> bool {
    return (0x0030..=0x0039).contains(&c);
}

/// `[\d.]`
pub(crate) fn is_digit_or_dot(c: u16) -> bool {
    return is_ascii_digit(c) || c == 0x002E;
}

/// `[\d_]`
pub(crate) fn is_digit_or_underscore(c: u16) -> bool {
    return is_ascii_digit(c) || c == 0x005F;
}

/// `[\d_.]`
pub(crate) fn is_digit_underscore_or_dot(c: u16) -> bool {
    return is_ascii_digit(c) || c == 0x005F || c == 0x002E;
}

/// JS LineTerminator: the characters `.` does not match.
pub(crate) fn is_js_line_terminator(c: u16) -> bool {
    return c == 0x000A || c == 0x000D || c == 0x2028 || c == 0x2029;
}

/// JS `\s`: WhiteSpace (TAB, VT, FF, U+FEFF and the Zs category) plus LineTerminator.
pub(crate) fn is_js_whitespace(c: u16) -> bool {
    return c == 0x0009
        || c == 0x000B
        || c == 0x000C
        || c == 0x0020
        || c == 0x00A0
        || c == 0x1680
        || (0x2000..=0x200A).contains(&c)
        || c == 0x202F
        || c == 0x205F
        || c == 0x3000
        || c == 0xFEFF
        || is_js_line_terminator(c);
}

pub(crate) fn is_not_js_whitespace(c: u16) -> bool {
    return !is_js_whitespace(c);
}

/// True when `needle` (ASCII, lowercase) matches `text` at `at` under JS non-unicode `/i` folding.
pub(crate) fn matches_at(text: &[u16], at: usize, needle: &str) -> bool {
    let mut i = at;
    for p in needle.encode_utf16() {
        if i >= text.len() || ascii_lower(text[i]) != p {
            return false;
        }
        i += 1;
    }
    return true;
}

/// Every position where `needle` matches, in order (the regex's leftmost start positions).
pub(crate) fn positions(text: &[u16], needle: &str) -> Vec<usize> {
    let mut out = vec![0];
    out.clear();
    let mut from = 0;
    loop {
        let found = find_from(text, from, needle);
        match found {
            Some(at) => {
                out.push(at);
                from = at + 1;
            }
            None => break,
        }
    }
    return out;
}

/// Count of consecutive chars from `at` satisfying `class`.
pub(crate) fn run_len(text: &[u16], at: usize, predicate: fn(u16) -> bool) -> usize {
    let start = at.min(text.len());
    let mut end = start;
    while end < text.len() && predicate(text[end]) {
        end += 1;
    }
    return end - start;
}

/// Replaces ASCII underscores with dots in a capture made only of digits, underscores, and dots.
pub(crate) fn underscores_to_dots(value: &str) -> String {
    let mut units: Vec<u16> = value.encode_utf16().collect();
    for i in 0..units.len() {
        if units[i] == 0x005F {
            units[i] = 0x002E;
        }
    }
    return ascii_slice_to_string(&units, 0, units.len());
}

fn utf16_len(value: &str) -> usize {
    let units: Vec<u16> = value.encode_utf16().collect();
    return units.len();
}
