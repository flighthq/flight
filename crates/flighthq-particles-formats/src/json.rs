//! Minimal self-contained JSON reader and writer for the particle-format
//! parsers. Particle assets are small hand-edited or tool-exported documents,
//! so a dependency-free reader keeps this crate light while covering the subset
//! the formats use (objects, arrays, numbers, strings, booleans, null).
//!
//! Only the value model and accessors needed by the Spine and Unity parsers
//! live here; nothing in this module is exported from the crate.

use std::collections::BTreeMap;

/// A parsed JSON value.
#[derive(Clone, Debug, PartialEq)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(f64),
    Text(String),
    Array(Vec<JsonValue>),
    // BTreeMap keeps a deterministic key order so serialized output (which uses
    // explicit field writers, not this map) is never relied upon for ordering;
    // the map exists only for lookups during parsing.
    Object(BTreeMap<String, JsonValue>),
}

impl JsonValue {
    /// Returns the number when this value is a JSON number, else `None`.
    pub fn as_number(&self) -> Option<f64> {
        match self {
            JsonValue::Number(n) => Some(*n),
            _ => None,
        }
    }

    /// Returns the boolean when this value is a JSON bool, else `None`.
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            JsonValue::Bool(b) => Some(*b),
            _ => None,
        }
    }

    /// Returns the string when this value is a JSON string, else `None`.
    pub fn as_text(&self) -> Option<&str> {
        match self {
            JsonValue::Text(s) => Some(s),
            _ => None,
        }
    }

    /// Returns the array when this value is a JSON array, else `None`.
    pub fn as_array(&self) -> Option<&[JsonValue]> {
        match self {
            JsonValue::Array(a) => Some(a),
            _ => None,
        }
    }

    /// Returns the value for `key` when this value is a JSON object, else
    /// `None`.
    pub fn get(&self, key: &str) -> Option<&JsonValue> {
        match self {
            JsonValue::Object(map) => map.get(key),
            _ => None,
        }
    }

    /// True when this value is a JSON object.
    pub fn is_object(&self) -> bool {
        matches!(self, JsonValue::Object(_))
    }
}

/// Parse a JSON string into a [`JsonValue`]. Returns a human-readable error
/// message on malformed input (mirroring the format-tagged messages the TS
/// reference produces).
pub fn parse_json(input: &str) -> Result<JsonValue, String> {
    let chars: Vec<char> = input.chars().collect();
    let mut parser = JsonParser {
        chars: &chars,
        pos: 0,
    };
    parser.skip_whitespace();
    let value = parser.parse_value()?;
    parser.skip_whitespace();
    if parser.pos != parser.chars.len() {
        return Err(format!(
            "unexpected trailing characters at position {}",
            parser.pos
        ));
    }
    Ok(value)
}

struct JsonParser<'a> {
    chars: &'a [char],
    pos: usize,
}

impl JsonParser<'_> {
    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn skip_whitespace(&mut self) {
        while let Some(c) = self.peek() {
            if c == ' ' || c == '\t' || c == '\n' || c == '\r' {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn parse_value(&mut self) -> Result<JsonValue, String> {
        match self.peek() {
            Some('{') => self.parse_object(),
            Some('[') => self.parse_array(),
            Some('"') => Ok(JsonValue::Text(self.parse_string()?)),
            Some('t') | Some('f') => self.parse_bool(),
            Some('n') => self.parse_null(),
            Some(c) if c == '-' || c.is_ascii_digit() => self.parse_number(),
            Some(c) => Err(format!(
                "unexpected character '{c}' at position {}",
                self.pos
            )),
            None => Err("unexpected end of input".to_string()),
        }
    }

    fn parse_object(&mut self) -> Result<JsonValue, String> {
        self.pos += 1; // consume '{'
        let mut map = BTreeMap::new();
        self.skip_whitespace();
        if self.peek() == Some('}') {
            self.pos += 1;
            return Ok(JsonValue::Object(map));
        }
        loop {
            self.skip_whitespace();
            if self.peek() != Some('"') {
                return Err(format!("expected object key at position {}", self.pos));
            }
            let key = self.parse_string()?;
            self.skip_whitespace();
            if self.peek() != Some(':') {
                return Err(format!("expected ':' at position {}", self.pos));
            }
            self.pos += 1;
            self.skip_whitespace();
            let value = self.parse_value()?;
            map.insert(key, value);
            self.skip_whitespace();
            match self.peek() {
                Some(',') => {
                    self.pos += 1;
                }
                Some('}') => {
                    self.pos += 1;
                    break;
                }
                _ => return Err(format!("expected ',' or '}}' at position {}", self.pos)),
            }
        }
        Ok(JsonValue::Object(map))
    }

    fn parse_array(&mut self) -> Result<JsonValue, String> {
        self.pos += 1; // consume '['
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.peek() == Some(']') {
            self.pos += 1;
            return Ok(JsonValue::Array(items));
        }
        loop {
            self.skip_whitespace();
            items.push(self.parse_value()?);
            self.skip_whitespace();
            match self.peek() {
                Some(',') => {
                    self.pos += 1;
                }
                Some(']') => {
                    self.pos += 1;
                    break;
                }
                _ => return Err(format!("expected ',' or ']' at position {}", self.pos)),
            }
        }
        Ok(JsonValue::Array(items))
    }

    fn parse_string(&mut self) -> Result<String, String> {
        self.pos += 1; // consume opening quote
        let mut out = String::new();
        loop {
            match self.peek() {
                None => return Err("unterminated string".to_string()),
                Some('"') => {
                    self.pos += 1;
                    break;
                }
                Some('\\') => {
                    self.pos += 1;
                    match self.peek() {
                        Some('"') => out.push('"'),
                        Some('\\') => out.push('\\'),
                        Some('/') => out.push('/'),
                        Some('b') => out.push('\u{0008}'),
                        Some('f') => out.push('\u{000C}'),
                        Some('n') => out.push('\n'),
                        Some('r') => out.push('\r'),
                        Some('t') => out.push('\t'),
                        Some('u') => {
                            let code = self.parse_unicode_escape()?;
                            // Advance over the four hex digits handled below in
                            // parse_unicode_escape (it leaves pos on the last
                            // digit); push the resulting char.
                            if let Some(c) = char::from_u32(code) {
                                out.push(c);
                            }
                        }
                        Some(c) => return Err(format!("invalid escape '\\{c}'")),
                        None => return Err("unterminated escape".to_string()),
                    }
                    self.pos += 1;
                }
                Some(c) => {
                    out.push(c);
                    self.pos += 1;
                }
            }
        }
        Ok(out)
    }

    fn parse_unicode_escape(&mut self) -> Result<u32, String> {
        // pos currently points at 'u'; read the four following hex digits.
        let mut value: u32 = 0;
        for _ in 0..4 {
            self.pos += 1;
            match self.peek() {
                Some(c) if c.is_ascii_hexdigit() => {
                    value = value * 16 + c.to_digit(16).unwrap();
                }
                _ => return Err("invalid unicode escape".to_string()),
            }
        }
        Ok(value)
    }

    fn parse_bool(&mut self) -> Result<JsonValue, String> {
        if self.matches_literal("true") {
            Ok(JsonValue::Bool(true))
        } else if self.matches_literal("false") {
            Ok(JsonValue::Bool(false))
        } else {
            Err(format!("invalid literal at position {}", self.pos))
        }
    }

    fn parse_null(&mut self) -> Result<JsonValue, String> {
        if self.matches_literal("null") {
            Ok(JsonValue::Null)
        } else {
            Err(format!("invalid literal at position {}", self.pos))
        }
    }

    fn matches_literal(&mut self, literal: &str) -> bool {
        let lit: Vec<char> = literal.chars().collect();
        if self.pos + lit.len() > self.chars.len() {
            return false;
        }
        if self.chars[self.pos..self.pos + lit.len()] == lit[..] {
            self.pos += lit.len();
            true
        } else {
            false
        }
    }

    fn parse_number(&mut self) -> Result<JsonValue, String> {
        let start = self.pos;
        if self.peek() == Some('-') {
            self.pos += 1;
        }
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-' {
                self.pos += 1;
            } else {
                break;
            }
        }
        let text: String = self.chars[start..self.pos].iter().collect();
        text.parse::<f64>()
            .map(JsonValue::Number)
            .map_err(|_| format!("invalid number '{text}'"))
    }
}

/// Incrementally builds a pretty-printed JSON object string using two-space
/// indentation, matching `JSON.stringify(value, null, 2)` closely enough for
/// the parsers to round-trip their own output.
pub struct JsonObjectWriter {
    out: String,
    indent: usize,
    has_entry: bool,
}

impl JsonObjectWriter {
    /// Begin a new top-level object.
    pub fn new() -> Self {
        let mut w = JsonObjectWriter {
            out: String::new(),
            indent: 0,
            has_entry: false,
        };
        w.out.push('{');
        w.indent = 1;
        w
    }

    fn begin_key(&mut self, key: &str) {
        if self.has_entry {
            self.out.push(',');
        }
        self.has_entry = true;
        self.out.push('\n');
        self.push_indent();
        self.out.push('"');
        self.out.push_str(&escape_json_string(key));
        self.out.push_str("\": ");
    }

    fn push_indent(&mut self) {
        for _ in 0..self.indent {
            self.out.push_str("  ");
        }
    }

    /// Write a string-valued field.
    pub fn field_text(&mut self, key: &str, value: &str) {
        self.begin_key(key);
        self.out.push('"');
        self.out.push_str(&escape_json_string(value));
        self.out.push('"');
    }

    /// Write a numeric field. Integer-valued numbers are written without a
    /// decimal point so they re-parse identically.
    pub fn field_number(&mut self, key: &str, value: f32) {
        self.begin_key(key);
        self.out.push_str(&format_json_number(value));
    }

    /// Write a boolean field.
    pub fn field_bool(&mut self, key: &str, value: bool) {
        self.begin_key(key);
        self.out.push_str(if value { "true" } else { "false" });
    }

    /// Write a field whose value is pre-rendered raw JSON (already indented by
    /// the caller-side helpers below).
    pub fn field_raw(&mut self, key: &str, raw: &str) {
        self.begin_key(key);
        self.out.push_str(raw);
    }

    /// Finish the object and return the full JSON string.
    pub fn finish(mut self) -> String {
        self.indent -= 1;
        if self.has_entry {
            self.out.push('\n');
            self.push_indent();
        }
        self.out.push('}');
        self.out
    }
}

impl Default for JsonObjectWriter {
    fn default() -> Self {
        Self::new()
    }
}

/// Format an `f32` as JSON: integers stay integer-shaped, fractions print with
/// the shortest round-trippable decimal representation.
pub fn format_json_number(value: f32) -> String {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        let mut s = format!("{value}");
        // Rust prints e.g. "0.1" already; nothing to fix for the common cases.
        if s == "-0" {
            s = "0".to_string();
        }
        s
    }
}

/// Escape a string for embedding in JSON.
pub fn escape_json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000C}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_json_string_escapes_specials() {
        assert_eq!(escape_json_string("a\"b\\c"), "a\\\"b\\\\c");
    }

    #[test]
    fn format_json_number_keeps_integers_integer() {
        assert_eq!(format_json_number(5.0), "5");
        assert_eq!(format_json_number(-3.0), "-3");
        assert_eq!(format_json_number(2.5), "2.5");
    }

    #[test]
    fn parse_json_object_round_trips_basic_types() {
        let v =
            parse_json("{\"a\": 1, \"b\": true, \"c\": \"x\", \"d\": null, \"e\": [1,2]}").unwrap();
        assert_eq!(v.get("a").and_then(JsonValue::as_number), Some(1.0));
        assert_eq!(v.get("b").and_then(JsonValue::as_bool), Some(true));
        assert_eq!(v.get("c").and_then(JsonValue::as_text), Some("x"));
        assert_eq!(v.get("d"), Some(&JsonValue::Null));
        assert_eq!(
            v.get("e").and_then(JsonValue::as_array).map(|a| a.len()),
            Some(2)
        );
    }

    #[test]
    fn parse_json_rejects_trailing_garbage() {
        assert!(parse_json("{} extra").is_err());
        assert!(parse_json("{not valid").is_err());
    }

    #[test]
    fn parse_json_non_object_roots() {
        assert_eq!(parse_json("null").unwrap(), JsonValue::Null);
        assert_eq!(
            parse_json("\"a string\"").unwrap(),
            JsonValue::Text("a string".to_string())
        );
        assert!(matches!(
            parse_json("[1,2,3]").unwrap(),
            JsonValue::Array(_)
        ));
        assert_eq!(parse_json("42").unwrap(), JsonValue::Number(42.0));
    }

    #[test]
    fn parse_json_handles_escapes() {
        let v = parse_json("{\"k\": \"a\\\"b\\n\"}").unwrap();
        assert_eq!(v.get("k").and_then(JsonValue::as_text), Some("a\"b\n"));
    }

    #[test]
    fn json_object_writer_emits_parseable_output() {
        let mut w = JsonObjectWriter::new();
        w.field_text("name", "x");
        w.field_number("count", 3.0);
        w.field_bool("on", true);
        let s = w.finish();
        let parsed = parse_json(&s).unwrap();
        assert_eq!(parsed.get("name").and_then(JsonValue::as_text), Some("x"));
        assert_eq!(
            parsed.get("count").and_then(JsonValue::as_number),
            Some(3.0)
        );
        assert_eq!(parsed.get("on").and_then(JsonValue::as_bool), Some(true));
    }
}
