use std::fmt;
use std::sync::{Arc, RwLock};

use flight_entity::{Record, Ref, set_record_value, throw_error, throw_syntax_error};
use regress::{Flags, Match, Regex};

/// The UTF-16 half-open range of a regular-expression match or capture.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RegExpMatchRange {
    pub end: usize,
    pub start: usize,
}

/// The `d`-flag ranges parallel to `RegExpExecResult.matches`, including named groups.
#[derive(Clone, Debug)]
pub struct RegExpExecIndices {
    pub groups: Option<Record<Option<RegExpMatchRange>>>,
    pub matches: Vec<Option<RegExpMatchRange>>,
}

/// The portable shape of a JavaScript `RegExpExecArray`. `matches[0]` is the complete match and
/// later slots are captures; an unmatched capture is `None` rather than an empty string.
#[derive(Clone, Debug)]
pub struct RegExpExecResult {
    pub groups: Option<Record<Option<String>>>,
    pub index: usize,
    pub indices: Option<RegExpExecIndices>,
    pub input: String,
    pub matches: Vec<Option<String>>,
}

/// A JavaScript regular expression. The engine is deliberately private IR implementation detail;
/// TypeScript emission maps this value and the three public functions to the platform `RegExp`.
pub struct RegExp {
    pub flags: String,
    pub last_index: usize,
    pub source: String,
    engine: Regex,
}

struct ParsedFlags {
    canonical: String,
    engine: Flags,
}

/// Constructs the canonical shared regular expression, matching `new RegExp(source, flags)`.
// flight-lint: allow(conform-extra) Principal c6ed1ad2 approved Rust intrinsic mapping for the JavaScript RegExp constructor
pub fn create_reg_exp(source: &str, flags: &str) -> Ref<RegExp> {
    let parsed = parse_flags(flags);
    let engine = match Regex::with_flags(source, parsed.engine) {
        Ok(engine) => engine,
        Err(error) => throw_syntax_error(&format!(
            "Invalid regular expression /{source}/{flags}: {error}"
        )),
    };
    return Arc::new(RwLock::new(RegExp {
        flags: parsed.canonical,
        last_index: 0,
        source: escape_reg_exp_source(source),
        engine,
    }));
}

fn build_exec_result(
    input: &str,
    input_utf16: &[u16],
    matched: &Match,
    has_indices: bool,
) -> RegExpExecResult {
    let matches = matched
        .groups()
        .map(|range| decode_utf16_match(input_utf16, range.as_ref()))
        .collect();
    let match_ranges: Vec<Option<RegExpMatchRange>> = matched
        .groups()
        .map(|range| {
            range.map(|range| RegExpMatchRange {
                end: range.end,
                start: range.start,
            })
        })
        .collect();
    let mut groups = Record::default();
    let mut group_ranges = Record::default();
    let mut has_named_groups = false;
    for (name, range) in matched.named_groups() {
        has_named_groups = true;
        set_record_value(
            &mut groups,
            name.to_string(),
            decode_utf16_match(input_utf16, range.as_ref()),
        );
        set_record_value(
            &mut group_ranges,
            name.to_string(),
            range.map(|range| RegExpMatchRange {
                end: range.end,
                start: range.start,
            }),
        );
    }
    return RegExpExecResult {
        groups: has_named_groups.then_some(groups),
        index: matched.start(),
        indices: has_indices.then_some(RegExpExecIndices {
            groups: has_named_groups.then_some(group_ranges),
            matches: match_ranges,
        }),
        input: input.to_string(),
        matches,
    };
}

fn decode_utf16_match(input: &[u16], range: Option<&std::ops::Range<usize>>) -> Option<String> {
    let range = range?;
    return match String::from_utf16(&input[range.clone()]) {
        Ok(value) => Some(value),
        Err(_) => throw_error(
            "flight-regexp: a non-Unicode match or capture split a UTF-16 surrogate pair that Rust String cannot represent",
        ),
    };
}

fn escape_reg_exp_source(source: &str) -> String {
    if source.is_empty() {
        return "(?:)".to_string();
    }
    let mut escaped = String::with_capacity(source.len());
    let mut in_class = false;
    let mut after_backslash = false;
    for character in source.chars() {
        if after_backslash {
            match character {
                '\n' => escaped.push('n'),
                '\r' => escaped.push('r'),
                '\u{2028}' => escaped.push_str("u2028"),
                '\u{2029}' => escaped.push_str("u2029"),
                _ => escaped.push(character),
            }
            after_backslash = false;
            continue;
        }
        match character {
            '\\' => {
                escaped.push(character);
                after_backslash = true;
            }
            '[' => {
                escaped.push(character);
                in_class = true;
            }
            ']' => {
                escaped.push(character);
                in_class = false;
            }
            '/' if !in_class => escaped.push_str("\\/"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\u{2028}' => escaped.push_str("\\u2028"),
            '\u{2029}' => escaped.push_str("\\u2029"),
            _ => escaped.push(character),
        }
    }
    return escaped;
}

/// Executes the expression and returns the actual match, captures, named groups and UTF-16 index.
/// Global and sticky expressions read and update `last_index` on the original shared value.
/// A non-Unicode result whose match or capture splits an astral scalar throws an explicit error,
/// because the D15 Rust text domain cannot represent an isolated UTF-16 surrogate without loss.
// flight-lint: allow(conform-extra) Principal c6ed1ad2 approved Rust intrinsic mapping for RegExp.exec
pub fn exec_reg_exp(reg_exp: &Ref<RegExp>, input: &str) -> Option<RegExpExecResult> {
    let input_utf16: Vec<u16> = input.encode_utf16().collect();
    let mut reg_exp = reg_exp.write().unwrap();
    let has_indices = reg_exp.flags.contains('d');
    let matched = match_reg_exp(&mut reg_exp, &input_utf16)?;
    drop(reg_exp);
    return Some(build_exec_result(
        input,
        &input_utf16,
        &matched,
        has_indices,
    ));
}

fn match_reg_exp(reg_exp: &mut RegExp, input_utf16: &[u16]) -> Option<Match> {
    let stateful = reg_exp.flags.contains('g') || reg_exp.flags.contains('y');
    let sticky = reg_exp.flags.contains('y');
    let unicode = reg_exp.flags.contains('u') || reg_exp.flags.contains('v');
    let requested_start = if stateful { reg_exp.last_index } else { 0 };
    if requested_start > input_utf16.len() {
        if stateful {
            reg_exp.last_index = 0;
        }
        return None;
    }
    let engine_start = normalize_unicode_start(input_utf16, requested_start, unicode);
    let matched = if unicode {
        reg_exp
            .engine
            .find_from_utf16(input_utf16, engine_start)
            .next()
    } else {
        reg_exp
            .engine
            .find_from_ucs2(input_utf16, engine_start)
            .next()
    };
    let Some(matched) = matched.filter(|matched| !sticky || matched.start() == engine_start) else {
        if stateful {
            reg_exp.last_index = 0;
        }
        return None;
    };
    if stateful {
        reg_exp.last_index = matched.end();
    }
    return Some(matched);
}

fn normalize_unicode_start(input: &[u16], start: usize, unicode: bool) -> usize {
    if !unicode || start == 0 || start >= input.len() {
        return start;
    }
    if (0xdc00..=0xdfff).contains(&input[start]) && (0xd800..=0xdbff).contains(&input[start - 1]) {
        return start - 1;
    }
    return start;
}

fn parse_flags(flags: &str) -> ParsedFlags {
    let mut d = false;
    let mut g = false;
    let mut i = false;
    let mut m = false;
    let mut s = false;
    let mut u = false;
    let mut v = false;
    let mut y = false;
    for flag in flags.chars() {
        let duplicate = match flag {
            'd' => std::mem::replace(&mut d, true),
            'g' => std::mem::replace(&mut g, true),
            'i' => std::mem::replace(&mut i, true),
            'm' => std::mem::replace(&mut m, true),
            's' => std::mem::replace(&mut s, true),
            'u' => std::mem::replace(&mut u, true),
            'v' => std::mem::replace(&mut v, true),
            'y' => std::mem::replace(&mut y, true),
            _ => throw_syntax_error(&format!("Invalid regular expression flag: {flag}")),
        };
        if duplicate {
            throw_syntax_error(&format!("Duplicate regular expression flag: {flag}"));
        }
    }
    if u && v {
        throw_syntax_error("Regular expression flags u and v cannot be used together");
    }
    let mut canonical = String::new();
    for (enabled, flag) in [
        (d, 'd'),
        (g, 'g'),
        (i, 'i'),
        (m, 'm'),
        (s, 's'),
        (u, 'u'),
        (v, 'v'),
        (y, 'y'),
    ] {
        if enabled {
            canonical.push(flag);
        }
    }
    return ParsedFlags {
        canonical,
        engine: Flags {
            dot_all: s,
            icase: i,
            multiline: m,
            no_opt: false,
            unicode: u || v,
            unicode_sets: v,
        },
    };
}

/// Tests for a match using the same stateful operation as JavaScript `RegExp.prototype.test`.
// flight-lint: allow(conform-extra) Principal c6ed1ad2 approved Rust intrinsic mapping for RegExp.test
pub fn test_reg_exp(reg_exp: &Ref<RegExp>, input: &str) -> bool {
    let input_utf16: Vec<u16> = input.encode_utf16().collect();
    let mut reg_exp = reg_exp.write().unwrap();
    return match_reg_exp(&mut reg_exp, &input_utf16).is_some();
}

impl fmt::Debug for RegExp {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("RegExp")
            .field("source", &self.source)
            .field("flags", &self.flags)
            .field("last_index", &self.last_index)
            .finish_non_exhaustive();
    }
}
