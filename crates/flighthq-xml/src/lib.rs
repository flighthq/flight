//! flighthq-xml
//!
//! Pull-style XML parser sufficient for atlas and plist file formats.
//! Not a general-purpose XML parser, but handles namespaced/extra attributes and elements,
//! both double-quoted and single-quoted attribute values, XML entity escapes
//! (&amp; &lt; &gt; &quot; &apos; plus numeric references), XML comments,
//! CDATA sections, the XML declaration, and DOCTYPE.

use std::collections::HashMap;

/// A parsed XML element with attributes, children, and text content.
#[derive(Debug, Clone, PartialEq)]
pub struct XmlElement {
    pub name: String,
    pub attributes: HashMap<String, String>,
    pub children: Vec<XmlElement>,
    pub text: String,
}

/// Parse all attributes from an element's attribute string.
/// Supports double-quoted and single-quoted values and XML entity escapes.
pub fn parse_xml_attributes(attrs: &str) -> HashMap<String, String> {
    let mut result = HashMap::new();
    let bytes = attrs.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        // Skip whitespace
        while i < len && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= len {
            break;
        }

        // Read attribute name ([\w:.-]+)
        let name_start = i;
        while i < len && is_attr_name_char(bytes[i]) {
            i += 1;
        }
        if i == name_start {
            i += 1;
            continue;
        }
        let name = &attrs[name_start..i];

        // Skip whitespace and '='
        while i < len && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= len || bytes[i] != b'=' {
            continue;
        }
        i += 1; // consume '='
        while i < len && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= len {
            break;
        }

        // Read value in quotes
        let quote = bytes[i];
        if quote != b'"' && quote != b'\'' {
            continue;
        }
        i += 1; // consume opening quote
        let value_start = i;
        while i < len && bytes[i] != quote {
            i += 1;
        }
        let value = decode_xml_entities(&attrs[value_start..i]);
        if i < len {
            i += 1; // consume closing quote
        }

        result.insert(name.to_string(), value);
    }

    result
}

/// Parse a simple XML document into a tree of `XmlElement` objects.
/// Returns the root element, or `None` when the input contains no recognizable element.
/// Does not validate DTD, namespaces, or processing instructions.
pub fn parse_xml_document(xml: &str) -> Option<XmlElement> {
    let src = strip_xml_comments(xml);
    let src = strip_cdata(&src);
    let src = src.replace("\r\n", "\n").replace('\r', "\n");

    // Strip XML declaration and DOCTYPE
    let src = strip_xml_declaration(&src);
    let src = strip_doctype(&src);
    let src = src.trim();

    let mut state = ParseState { pos: 0 };
    parse_element(src, &mut state)
}

struct ParseState {
    pos: usize,
}

fn is_attr_name_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b':' || b == b'.' || b == b'-'
}

fn decode_xml_entities(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if bytes[i] == b'&' {
            let amp_start = i;
            i += 1;
            let ref_start = i;
            while i < len && bytes[i] != b';' {
                i += 1;
            }
            if i >= len {
                result.push_str(&s[amp_start..]);
                break;
            }
            let reference = &s[ref_start..i];
            i += 1; // consume ';'

            if let Some(rest) = reference.strip_prefix('#') {
                let code_point = if let Some(hex) = rest.strip_prefix('x') {
                    u32::from_str_radix(hex, 16).ok()
                } else {
                    rest.parse::<u32>().ok()
                };
                if let Some(cp) = code_point {
                    if let Some(c) = char::from_u32(cp) {
                        result.push(c);
                        continue;
                    }
                }
                result.push_str(&s[amp_start..i]);
            } else {
                match reference {
                    "amp" => result.push('&'),
                    "lt" => result.push('<'),
                    "gt" => result.push('>'),
                    "quot" => result.push('"'),
                    "apos" => result.push('\''),
                    _ => result.push_str(&s[amp_start..i]),
                }
            }
        } else {
            result.push(s[i..].chars().next().unwrap());
            i += s[i..].chars().next().unwrap().len_utf8();
        }
    }

    result
}

fn parse_element(src: &str, state: &mut ParseState) -> Option<XmlElement> {
    skip_whitespace(src, state);
    let bytes = src.as_bytes();

    if state.pos >= bytes.len() || bytes[state.pos] != b'<' {
        return None;
    }

    state.pos += 1; // consume '<'

    // Skip processing instructions
    if state.pos < bytes.len() && bytes[state.pos] == b'?' {
        if let Some(end) = src[state.pos..].find("?>") {
            state.pos += end + 2;
        } else {
            state.pos = bytes.len();
        }
        return parse_element(src, state);
    }

    // Read element name
    let name_start = state.pos;
    while state.pos < bytes.len()
        && !bytes[state.pos].is_ascii_whitespace()
        && bytes[state.pos] != b'>'
        && bytes[state.pos] != b'/'
    {
        state.pos += 1;
    }
    let name = src[name_start..state.pos].to_string();
    if name.is_empty() {
        return None;
    }

    skip_whitespace(src, state);

    // Read attributes (everything up to '>' or '/>')
    let attrs_start = state.pos;
    while state.pos < bytes.len()
        && bytes[state.pos] != b'>'
        && !(bytes[state.pos] == b'/'
            && state.pos + 1 < bytes.len()
            && bytes[state.pos + 1] == b'>')
    {
        state.pos += 1;
    }
    let attrs_str = &src[attrs_start..state.pos];

    let self_closing = state.pos < bytes.len() && bytes[state.pos] == b'/';
    state.pos += if self_closing { 2 } else { 1 }; // consume '/>' or '>'

    let attributes = parse_xml_attributes(attrs_str);
    let mut children = Vec::new();
    let mut text = String::new();

    if !self_closing {
        while state.pos < bytes.len() {
            skip_whitespace(src, state);
            if state.pos >= bytes.len() {
                break;
            }

            if bytes[state.pos] != b'<' {
                // Text node
                let text_start = state.pos;
                while state.pos < bytes.len() && bytes[state.pos] != b'<' {
                    state.pos += 1;
                }
                let raw = src[text_start..state.pos].trim();
                if !raw.is_empty() {
                    text.push_str(&decode_xml_entities(raw));
                }
                continue;
            }

            // Check for closing tag
            if state.pos + 1 < bytes.len() && bytes[state.pos + 1] == b'/' {
                while state.pos < bytes.len() && bytes[state.pos] != b'>' {
                    state.pos += 1;
                }
                if state.pos < bytes.len() {
                    state.pos += 1; // consume '>'
                }
                break;
            }

            if let Some(child) = parse_element(src, state) {
                children.push(child);
            }
        }
    }

    Some(XmlElement {
        name,
        attributes,
        children,
        text,
    })
}

fn skip_whitespace(src: &str, state: &mut ParseState) {
    let bytes = src.as_bytes();
    while state.pos < bytes.len() && bytes[state.pos].is_ascii_whitespace() {
        state.pos += 1;
    }
}

fn strip_cdata(xml: &str) -> String {
    let mut result = String::with_capacity(xml.len());
    let mut remaining = xml;
    while let Some(start) = remaining.find("<![CDATA[") {
        result.push_str(&remaining[..start]);
        remaining = &remaining[start + 9..];
        if let Some(end) = remaining.find("]]>") {
            let cdata_content = &remaining[..end];
            result.push_str(
                &cdata_content
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;"),
            );
            remaining = &remaining[end + 3..];
        } else {
            result.push_str(remaining);
            return result;
        }
    }
    result.push_str(remaining);
    result
}

fn strip_xml_comments(xml: &str) -> String {
    let mut result = String::with_capacity(xml.len());
    let mut remaining = xml;
    while let Some(start) = remaining.find("<!--") {
        result.push_str(&remaining[..start]);
        remaining = &remaining[start + 4..];
        if let Some(end) = remaining.find("-->") {
            remaining = &remaining[end + 3..];
        } else {
            return result;
        }
    }
    result.push_str(remaining);
    result
}

fn strip_xml_declaration(xml: &str) -> String {
    let mut result = String::with_capacity(xml.len());
    let mut remaining = xml;
    while let Some(start) = remaining.find("<?") {
        result.push_str(&remaining[..start]);
        remaining = &remaining[start + 2..];
        if let Some(end) = remaining.find("?>") {
            remaining = &remaining[end + 2..];
        } else {
            return result;
        }
    }
    result.push_str(remaining);
    result
}

fn strip_doctype(xml: &str) -> String {
    let mut result = String::with_capacity(xml.len());
    let mut remaining = xml;
    let needle_upper = "<!DOCTYPE";
    let needle_lower = "<!doctype";
    loop {
        let pos_upper = remaining.find(needle_upper);
        let pos_lower = remaining.find(needle_lower);
        let pos = match (pos_upper, pos_lower) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        };
        if let Some(start) = pos {
            result.push_str(&remaining[..start]);
            remaining = &remaining[start..];
            if let Some(end) = remaining.find('>') {
                remaining = &remaining[end + 1..];
            } else {
                return result;
            }
        } else {
            break;
        }
    }
    result.push_str(remaining);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_xml_attributes() {
        let attrs = parse_xml_attributes(r#"name="hello" value='world' count="42""#);
        assert_eq!(attrs.get("name").unwrap(), "hello");
        assert_eq!(attrs.get("value").unwrap(), "world");
        assert_eq!(attrs.get("count").unwrap(), "42");
    }

    #[test]
    fn test_parse_xml_attributes_with_entities() {
        let attrs = parse_xml_attributes(r#"text="&amp;&lt;&gt;&quot;&apos;""#);
        assert_eq!(attrs.get("text").unwrap(), "&<>\"'");
    }

    #[test]
    fn test_parse_xml_attributes_numeric_entities() {
        let attrs = parse_xml_attributes(r#"char="&#65;&#x42;""#);
        assert_eq!(attrs.get("char").unwrap(), "AB");
    }

    #[test]
    fn test_parse_xml_document_simple() {
        let doc = parse_xml_document("<root><child name=\"a\"/></root>").unwrap();
        assert_eq!(doc.name, "root");
        assert_eq!(doc.children.len(), 1);
        assert_eq!(doc.children[0].name, "child");
        assert_eq!(doc.children[0].attributes.get("name").unwrap(), "a");
    }

    #[test]
    fn test_parse_xml_document_text_content() {
        let doc = parse_xml_document("<msg>hello world</msg>").unwrap();
        assert_eq!(doc.name, "msg");
        assert_eq!(doc.text, "hello world");
    }

    #[test]
    fn test_parse_xml_document_with_declaration() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
            <root attr="val"><item>text</item></root>"#;
        let doc = parse_xml_document(xml).unwrap();
        assert_eq!(doc.name, "root");
        assert_eq!(doc.attributes.get("attr").unwrap(), "val");
        assert_eq!(doc.children.len(), 1);
        assert_eq!(doc.children[0].text, "text");
    }

    #[test]
    fn test_parse_xml_document_cdata() {
        let xml = "<root><![CDATA[raw <content>]]></root>";
        let doc = parse_xml_document(xml).unwrap();
        assert_eq!(doc.text, "raw <content>");
    }

    #[test]
    fn test_parse_xml_document_comments() {
        let xml = "<root><!-- comment --><child/></root>";
        let doc = parse_xml_document(xml).unwrap();
        assert_eq!(doc.children.len(), 1);
        assert_eq!(doc.children[0].name, "child");
    }

    #[test]
    fn test_parse_xml_document_self_closing() {
        let doc = parse_xml_document(r#"<img src="test.png"/>"#).unwrap();
        assert_eq!(doc.name, "img");
        assert_eq!(doc.attributes.get("src").unwrap(), "test.png");
        assert!(doc.children.is_empty());
    }

    #[test]
    fn test_parse_xml_document_empty() {
        assert!(parse_xml_document("").is_none());
        assert!(parse_xml_document("   ").is_none());
    }

    #[test]
    fn test_parse_xml_document_doctype() {
        let xml = r#"<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
            <plist><dict/></plist>"#;
        let doc = parse_xml_document(xml).unwrap();
        assert_eq!(doc.name, "plist");
    }

    #[test]
    fn test_parse_xml_document_entities_in_text() {
        let doc = parse_xml_document("<t>a &amp; b &lt; c</t>").unwrap();
        assert_eq!(doc.text, "a & b < c");
    }
}
