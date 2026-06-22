//! Minimal self-contained JSON reader and writer for the spritesheet-format
//! parsers. Atlas descriptors are small tool-exported documents, so a
//! dependency-free reader keeps this crate light while covering the subset the
//! Aseprite and Texture Packer formats use (objects, arrays, numbers, strings,
//! booleans, null).
//!
//! Objects preserve insertion order so serialized output is deterministic;
//! nothing in this module is exported from the crate.

/// A parsed JSON value.
#[derive(Clone, Debug, PartialEq)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(f64),
    Text(String),
    Array(Vec<JsonValue>),
    /// Insertion-ordered key/value pairs. A `Vec` rather than a map keeps
    /// serialized output stable and avoids pulling in an ordered-map type.
    Object(Vec<(String, JsonValue)>),
}

// The accessor set is a small, coherent JSON-value API; some members are used
// only from format-specific code paths or tests.
#[allow(dead_code)]
impl JsonValue {
    /// Returns the array when this value is a JSON array, else `None`.
    pub fn as_array(&self) -> Option<&[JsonValue]> {
        match self {
            JsonValue::Array(a) => Some(a),
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

    /// Returns the number when this value is a JSON number, else `None`.
    pub fn as_number(&self) -> Option<f64> {
        match self {
            JsonValue::Number(n) => Some(*n),
            _ => None,
        }
    }

    /// Returns the object entries when this value is a JSON object, else `None`.
    pub fn as_object(&self) -> Option<&[(String, JsonValue)]> {
        match self {
            JsonValue::Object(entries) => Some(entries),
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

    /// Returns the value for `key` when this value is a JSON object, else
    /// `None`.
    pub fn get(&self, key: &str) -> Option<&JsonValue> {
        match self {
            JsonValue::Object(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// True when this value is a JSON array.
    pub fn is_array(&self) -> bool {
        matches!(self, JsonValue::Array(_))
    }

    /// Renders this value as a pretty-printed JSON string using two-space
    /// indentation. The output re-parses identically through [`parse_json`].
    pub fn to_json_string(&self) -> String {
        let mut out = String::new();
        write_json_value(&mut out, self, 0);
        out
    }
}

/// Parse a JSON string into a [`JsonValue`]. Returns a human-readable error
/// message on malformed input.
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
        let mut entries: Vec<(String, JsonValue)> = Vec::new();
        self.skip_whitespace();
        if self.peek() == Some('}') {
            self.pos += 1;
            return Ok(JsonValue::Object(entries));
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
            entries.push((key, value));
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
        Ok(JsonValue::Object(entries))
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

/// Format an `f64` as JSON: integers stay integer-shaped, fractions print with
/// the shortest round-trippable decimal representation.
pub fn format_json_number(value: f64) -> String {
    if value.is_finite() && value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        let mut s = format!("{value}");
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

fn write_indent(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push_str("  ");
    }
}

fn write_json_value(out: &mut String, value: &JsonValue, depth: usize) {
    match value {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        JsonValue::Number(n) => out.push_str(&format_json_number(*n)),
        JsonValue::Text(s) => {
            out.push('"');
            out.push_str(&escape_json_string(s));
            out.push('"');
        }
        JsonValue::Array(items) => {
            if items.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push('\n');
                write_indent(out, depth + 1);
                write_json_value(out, item, depth + 1);
            }
            out.push('\n');
            write_indent(out, depth);
            out.push(']');
        }
        JsonValue::Object(entries) => {
            if entries.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push('{');
            for (i, (key, val)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push('\n');
                write_indent(out, depth + 1);
                out.push('"');
                out.push_str(&escape_json_string(key));
                out.push_str("\": ");
                write_json_value(out, val, depth + 1);
            }
            out.push('\n');
            write_indent(out, depth);
            out.push('}');
        }
    }
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
    fn parse_json_object_preserves_insertion_order() {
        let v = parse_json("{\"b\": 1, \"a\": 2}").unwrap();
        let entries = v.as_object().unwrap();
        assert_eq!(entries[0].0, "b");
        assert_eq!(entries[1].0, "a");
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
    fn to_json_string_round_trips() {
        let original = parse_json(
            "{\"frames\": [{\"x\": 0, \"y\": 2, \"on\": true, \"name\": \"a\\\"b\"}], \"n\": null}",
        )
        .unwrap();
        let text = original.to_json_string();
        let reparsed = parse_json(&text).unwrap();
        assert_eq!(original, reparsed);
    }
}
