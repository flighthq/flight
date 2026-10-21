//! Exact JS-regex building blocks for the source's UA patterns, written out instead of using a Rust
//! regex engine because the observable semantics differ:
//! - JS `/i` without the `u` flag folds case only where both sides are ASCII (a non-ASCII character
//!   never matches an ASCII pattern letter), whereas Rust regex folds Unicode (the Kelvin sign
//!   U+212A would match `k`);
//! - JS `\s` is WhiteSpace + LineTerminator (it includes U+FEFF and excludes U+0085), which differs
//!   from Rust's `char::is_whitespace`;
//! - JS `.` stops at line terminators (no `s` flag).
//!
//! Text is handled as chars. Every pattern is ASCII, so no match can split a surrogate pair, and
//! captured slices are the same text JS would return.

/// JS `/prefix(class+)/i.exec(text)?.[1]`: the first occurrence of `prefix` followed by at least
/// one `class` char, capturing that greedy run.
pub(crate) fn capture_after(
    text: &[char],
    prefix: &str,
    class: impl Fn(char) -> bool,
) -> Option<String> {
    let prefix_len = prefix.chars().count();
    for at in positions(text, prefix) {
        let start = at + prefix_len;
        let len = run_len(text, start, &class);
        if len > 0 {
            return Some(text[start..start + len].iter().collect());
        }
    }
    return None;
}

/// JS `/prefix\s+(class+)/i`: `prefix`, at least one JS whitespace, then at least one `class` char.
pub(crate) fn capture_after_whitespace(
    text: &[char],
    prefix: &str,
    class: impl Fn(char) -> bool,
) -> Option<String> {
    let prefix_len = prefix.chars().count();
    for at in positions(text, prefix) {
        let ws = run_len(text, at + prefix_len, is_js_whitespace);
        if ws == 0 {
            continue;
        }
        let start = at + prefix_len + ws;
        let len = run_len(text, start, &class);
        if len > 0 {
            return Some(text[start..start + len].iter().collect());
        }
    }
    return None;
}

/// The UA as chars, for position-based matching.
pub(crate) fn chars_of(text: &str) -> Vec<char> {
    return text.chars().collect();
}

/// JS `/needle/i.test(text)`.
pub(crate) fn contains(text: &[char], needle: &str) -> bool {
    return find_from(text, 0, needle).is_some();
}

/// JS `/a|b|.../i.test(text)`.
pub(crate) fn contains_any(text: &[char], needles: &[&str]) -> bool {
    return needles.iter().any(|needle| contains(text, needle));
}

/// JS `/first.*second/i.test(text)`: `second` follows some `first` on the same line.
pub(crate) fn contains_then_on_line(text: &[char], first: &str, second: &str) -> bool {
    let first_len = first.chars().count();
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
pub(crate) fn find_from(text: &[char], from: usize, needle: &str) -> Option<usize> {
    let len = needle.chars().count();
    if len > text.len() {
        return None;
    }
    return (from..=text.len() - len).find(|&i| matches_at(text, i, needle));
}

/// `[\d.]`
pub(crate) fn is_digit_or_dot(c: char) -> bool {
    return c.is_ascii_digit() || c == '.';
}

/// `[\d_]`
pub(crate) fn is_digit_or_underscore(c: char) -> bool {
    return c.is_ascii_digit() || c == '_';
}

/// `[\d_.]`
pub(crate) fn is_digit_underscore_or_dot(c: char) -> bool {
    return c.is_ascii_digit() || c == '_' || c == '.';
}

/// JS LineTerminator: the characters `.` does not match.
pub(crate) fn is_js_line_terminator(c: char) -> bool {
    return matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}');
}

/// JS `\s`: WhiteSpace (TAB, VT, FF, U+FEFF and the Zs category) plus LineTerminator.
pub(crate) fn is_js_whitespace(c: char) -> bool {
    return matches!(
        c,
        '\t' | '\u{000B}' | '\u{000C}' | ' ' | '\u{00A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}'
    ) || is_js_line_terminator(c);
}

/// True when `needle` (ASCII, lowercase) matches `text` at `at` under JS non-unicode `/i` folding.
pub(crate) fn matches_at(text: &[char], at: usize, needle: &str) -> bool {
    let mut i = at;
    for p in needle.chars() {
        if i >= text.len() || !text[i].is_ascii() || text[i].to_ascii_lowercase() != p {
            return false;
        }
        i += 1;
    }
    return true;
}

/// Every position where `needle` matches, in order (the regex's leftmost start positions).
pub(crate) fn positions(text: &[char], needle: &str) -> Vec<usize> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(at) = find_from(text, from, needle) {
        out.push(at);
        from = at + 1;
    }
    return out;
}

/// Count of consecutive chars from `at` satisfying `class`.
pub(crate) fn run_len(text: &[char], at: usize, class: impl Fn(char) -> bool) -> usize {
    return text[at.min(text.len())..]
        .iter()
        .take_while(|&&c| class(c))
        .count();
}
