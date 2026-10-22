// Tree-building (DOM-style) XML parser sufficient for atlas and plist file formats.
// Not a general-purpose XML parser, but handles namespaced/extra attributes and elements,
// both double-quoted and single-quoted attribute values, XML entity escapes
// (&amp; &lt; &gt; &quot; &apos; plus numeric references), general entities declared in a
// DOCTYPE's internal subset, XML comments (<!-- -->), CDATA sections (<![CDATA[...]]>),
// the XML declaration, and DOCTYPE.

use std::collections::HashMap;
use std::sync::RwLock;

use flight_entity::Ref;

use crate::types::{XmlContent, XmlElement};

// --- Constants ---

/// An entity may nest a few levels legitimately; past that a document is recursing, not composing.
const MAX_XML_ENTITY_PASSES: usize = 8;
const MAX_XML_ENTITY_GROWTH: usize = 16;
const MAX_XML_ENTITY_BUDGET: usize = 65536;

/// Authored XML rarely nests beyond a few dozen elements. This leaves an order of magnitude of
/// margin while stopping recursion well below the engine-dependent call-stack limit.
const MAX_XML_ELEMENT_DEPTH: usize = 256;

// --- Internal types ---

struct ParseState {
    depth: usize,
    depth_exceeded: bool,
    pos: usize,
}

/// Collects general entity declarations from a DOCTYPE's internal subset.
///
/// Parameter entities (`<!ENTITY % name ...>`) and external ones (`SYSTEM` / `PUBLIC`) are
/// deliberately not collected: an external entity resolves a URL or a file path at parse time,
/// which is a document reading whatever the process can reach, so the parser has no business
/// honoring one.
fn collect_xml_entity_declarations(doctype: &str, out: &mut HashMap<String, String>) {
    let bytes = doctype.as_bytes();
    let len = bytes.len();
    let mut pos = 0;

    while pos + 8 <= len {
        if !bytes[pos..].starts_with(b"<!ENTITY") {
            pos += 1;
            continue;
        }
        pos += 8; // skip <!ENTITY

        // The name must be preceded by whitespace (\s+)
        let ws_start = pos;
        while pos < len && bytes[pos].is_ascii_whitespace() {
            pos += 1;
        }
        if pos == ws_start {
            continue;
        }

        // Read entity name ([\w:.-]+)
        let name_start = pos;
        while pos < len && is_name_char(bytes[pos]) {
            pos += 1;
        }
        if pos == name_start {
            continue;
        }
        let name = &doctype[name_start..pos];

        // Skip optional whitespace
        while pos < len && bytes[pos].is_ascii_whitespace() {
            pos += 1;
        }

        // The name must be followed directly by a quoted replacement, which is what excludes
        // both the parameter form (a `%` where the name belongs) and the external form
        // (a SYSTEM/PUBLIC keyword where the quote belongs) without testing for either.
        if pos >= len {
            break;
        }
        let quote = bytes[pos];
        if quote != b'"' && quote != b'\'' {
            continue;
        }
        pos += 1;

        // Read value until matching closing quote
        let value_start = pos;
        while pos < len && bytes[pos] != quote {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let value = &doctype[value_start..pos];
        pos += 1; // consume closing quote

        // Skip optional whitespace then expect >
        while pos < len && bytes[pos].is_ascii_whitespace() {
            pos += 1;
        }
        if pos < len && bytes[pos] == b'>' {
            out.insert(name.to_string(), value.to_string());
            pos += 1;
        }
    }
}

fn decode_xml_entities(s: &str) -> String {
    let bytes = s.as_bytes();
    let len = bytes.len();
    let mut result = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        if bytes[pos] != b'&' {
            pos += 1;
            continue;
        }

        let amp_pos = pos;
        pos += 1; // skip '&'

        if pos >= len {
            break;
        }

        if bytes[pos] == b'#' {
            // Numeric character reference: &#digits; or &#xhexdigits;
            pos += 1;
            let is_hex = pos < len && bytes[pos] == b'x';
            if is_hex {
                pos += 1;
            }

            let num_start = pos;
            if is_hex {
                while pos < len && bytes[pos].is_ascii_hexdigit() {
                    pos += 1;
                }
            } else {
                while pos < len && bytes[pos].is_ascii_digit() {
                    pos += 1;
                }
            }

            if pos > num_start && pos < len && bytes[pos] == b';' {
                let num_str = &s[num_start..pos];
                let radix = if is_hex { 16 } else { 10 };
                if let Ok(codepoint) = u32::from_str_radix(num_str, radix) {
                    if let Some(ch) = char::from_u32(codepoint) {
                        result.push_str(&s[copy_start..amp_pos]);
                        result.push(ch);
                        pos += 1; // skip ';'
                        copy_start = pos;
                        continue;
                    }
                }
                // Out of range or invalid codepoint -- leave the reference as-is
                pos += 1; // skip ';'
                continue;
            }
            // No semicolon after digits -- not a valid reference
            continue;
        }

        // Named entity reference: &name; where name is \w+
        let name_start = pos;
        while pos < len && is_word_char(bytes[pos]) {
            pos += 1;
        }

        if pos > name_start && pos < len && bytes[pos] == b';' {
            let name = &s[name_start..pos];
            if let Some(replacement) = xml_entity_replacement(name) {
                result.push_str(&s[copy_start..amp_pos]);
                result.push_str(replacement);
                pos += 1; // skip ';'
                copy_start = pos;
                continue;
            }
            pos += 1; // skip ';' -- unknown entity, leave as-is
            continue;
        }
        // No semicolon or empty name -- not a valid reference
    }

    result.push_str(&s[copy_start..]);
    result
}

/// Substitutes declared general entities into the source ahead of parsing.
///
/// A replacement may itself reference an entity, so expansion repeats until it settles. Both
/// the pass count and the resulting size are capped: entities that reference each other are
/// otherwise an exponential bomb ("billion laughs"), and the budget is what keeps a hostile
/// document costing bounded work. Exhausting the budget stops expansion and keeps what
/// resolved, since a partially expanded document still parses.
///
/// Only declared general entities substitute. An undeclared reference is left alone for
/// `decode_xml_entities` to see as text.
fn expand_xml_entities(src: &str, entities: &HashMap<String, String>) -> String {
    if entities.is_empty() {
        return src.to_string();
    }

    let mut output = src.to_string();
    let budget = src.len() * MAX_XML_ENTITY_GROWTH + MAX_XML_ENTITY_BUDGET;

    for _pass in 0..MAX_XML_ENTITY_PASSES {
        let mut expanded = false;
        let next = replace_entity_references(&output, entities, &mut expanded);
        if !expanded || next.len() > budget {
            return output;
        }
        output = next;
    }
    output
}

/// Find the position of `needle` in `bytes` starting from `start`.
fn find_in_bytes(bytes: &[u8], needle: &[u8], start: usize) -> Option<usize> {
    if start + needle.len() > bytes.len() {
        return None;
    }
    bytes[start..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|i| start + i)
}

/// Check if a byte is a valid XML name character: [\w:.-]
fn is_name_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b':' || b == b'.' || b == b'-'
}

/// Check if a byte ends a tag name: whitespace, '>', or '/'
fn is_tag_name_end(b: u8) -> bool {
    b.is_ascii_whitespace() || b == b'>' || b == b'/'
}

/// Check if a byte is a word character: [a-zA-Z0-9_]
fn is_word_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn parse_element(src: &str, state: &mut ParseState) -> Option<XmlElement> {
    if state.depth >= MAX_XML_ELEMENT_DEPTH {
        state.depth_exceeded = true;
        return None;
    }

    let bytes = src.as_bytes();
    let len = bytes.len();

    skip_whitespace(bytes, &mut state.pos, len);
    if state.pos >= len || bytes[state.pos] != b'<' {
        return None;
    }

    state.pos += 1; // consume '<'

    // Skip processing instructions
    if state.pos < len && bytes[state.pos] == b'?' {
        if let Some(end) = find_in_bytes(bytes, b"?>", state.pos) {
            state.pos = end + 2;
        } else {
            state.pos = len;
        }
        return parse_element(src, state);
    }

    // Read element name
    let name_start = state.pos;
    while state.pos < len && !is_tag_name_end(bytes[state.pos]) {
        state.pos += 1;
    }
    let name = &src[name_start..state.pos];
    if name.is_empty() {
        return None;
    }
    let name = name.to_string();

    skip_whitespace(bytes, &mut state.pos, len);

    // Read attributes up to the tag end. Track the active quote so a '>' inside a
    // quoted attribute value (e.g. a TexturePacker/Starling value like "a>b") is
    // treated as data rather than ending the tag.
    let attrs_start = state.pos;
    let mut quote: u8 = 0;
    while state.pos < len {
        let ch = bytes[state.pos];
        if quote != 0 {
            if ch == quote {
                quote = 0;
            }
        } else if ch == b'"' || ch == b'\'' {
            quote = ch;
        } else if ch == b'>' || (ch == b'/' && state.pos + 1 < len && bytes[state.pos + 1] == b'>')
        {
            break;
        }
        state.pos += 1;
    }
    let attrs_str = &src[attrs_start..state.pos];

    let self_closing = state.pos < len && bytes[state.pos] == b'/';
    state.pos += if self_closing { 2 } else { 1 }; // consume '/>' or '>'

    let attributes = parse_xml_attributes(attrs_str);
    let mut children: Vec<Ref<XmlElement>> = Vec::new();
    let mut content: Vec<XmlContent> = Vec::new();
    let mut text = String::new();

    if !self_closing {
        // Parse children until closing tag
        while state.pos < len {
            if bytes[state.pos] != b'<' {
                // Text node
                let text_start = state.pos;
                while state.pos < len && bytes[state.pos] != b'<' {
                    state.pos += 1;
                }
                let decoded = decode_xml_entities(&src[text_start..state.pos]);
                text.push_str(decoded.trim());
                if !decoded.is_empty() {
                    content.push(XmlContent::Text(decoded));
                }
                continue;
            }

            // CDATA section
            if bytes[state.pos..].starts_with(b"<![CDATA[") {
                let cdata_start = state.pos + 9;
                if let Some(end) = find_in_bytes(bytes, b"]]>", cdata_start) {
                    let cdata = &src[cdata_start..end];
                    text.push_str(cdata.trim());
                    if !cdata.is_empty() {
                        content.push(XmlContent::Text(cdata.to_string()));
                    }
                    state.pos = end + 3;
                } else {
                    let cdata = &src[cdata_start..];
                    text.push_str(cdata.trim());
                    if !cdata.is_empty() {
                        content.push(XmlContent::Text(cdata.to_string()));
                    }
                    state.pos = len;
                }
                continue;
            }

            // Check for closing tag
            if state.pos + 1 < len && bytes[state.pos + 1] == b'/' {
                // Skip to '>'
                while state.pos < len && bytes[state.pos] != b'>' {
                    state.pos += 1;
                }
                if state.pos < len {
                    state.pos += 1; // consume '>'
                }
                break;
            }

            // Child element
            state.depth += 1;
            let child = parse_element(src, state);
            state.depth -= 1;
            if state.depth_exceeded {
                return None;
            }
            if let Some(child) = child {
                // One node, referenced from both projections. The clone is a new Ref handle,
                // not a copy of the subtree, so memory stays linear in the document size.
                let child_ref: Ref<XmlElement> = Ref::new(RwLock::new(child));
                children.push(child_ref.clone());
                content.push(XmlContent::Element(child_ref));
            }
        }
    }

    Some(XmlElement {
        attributes,
        children,
        content,
        name,
        text,
    })
}

/// Parse all attributes from an element's attribute string.
/// Supports double-quoted and single-quoted values and XML entity escapes.
pub fn parse_xml_attributes(attrs: &str) -> HashMap<String, String> {
    let mut result = HashMap::new();
    let bytes = attrs.as_bytes();
    let len = bytes.len();
    let mut pos = 0;

    while pos < len {
        // Skip to the start of the next attribute name
        while pos < len && !is_name_char(bytes[pos]) {
            pos += 1;
        }
        if pos >= len {
            break;
        }

        // Read attribute name ([\w:.-]+)
        let name_start = pos;
        while pos < len && is_name_char(bytes[pos]) {
            pos += 1;
        }
        let name = &attrs[name_start..pos];

        // Skip whitespace
        while pos < len && bytes[pos].is_ascii_whitespace() {
            pos += 1;
        }

        // Expect '='
        if pos >= len || bytes[pos] != b'=' {
            continue;
        }
        pos += 1;

        // Skip whitespace
        while pos < len && bytes[pos].is_ascii_whitespace() {
            pos += 1;
        }

        // Expect opening quote
        if pos >= len {
            break;
        }
        let quote = bytes[pos];
        if quote != b'"' && quote != b'\'' {
            continue;
        }
        pos += 1;

        // Read value until matching closing quote
        let value_start = pos;
        while pos < len && bytes[pos] != quote {
            pos += 1;
        }
        let value = &attrs[value_start..pos];
        if pos < len {
            pos += 1; // consume closing quote
        }

        result.insert(name.to_string(), decode_xml_entities(value));
    }

    return result;
}

/// Parse a simple XML document into a tree of XmlElement objects.
/// Returns the root element, or None when the input contains no recognizable element.
/// Does not validate DTD, namespaces, or processing instructions.
pub fn parse_xml_document(xml: &str) -> Option<XmlElement> {
    // Normalize: strip comments and normalize line endings.
    let src = strip_xml_comments(xml);
    let src = src.replace("\r\n", "\n").replace('\r', "\n");

    // Strip XML declaration and DOCTYPE before parsing the root element. The DOCTYPE is
    // discarded but its internal subset is read on the way out, because a general entity's
    // replacement text is markup and so has to be substituted into the source before the tree
    // is built, not decoded out of a text node afterwards.
    let mut entities = HashMap::new();
    let src = strip_processing_instructions(&src);
    let src = strip_xml_doctypes(&src, &mut entities);
    let src = src.trim();

    let expanded = expand_xml_entities(src, &entities);

    let mut state = ParseState {
        depth: 0,
        depth_exceeded: false,
        pos: 0,
    };
    return parse_element(&expanded, &mut state);
}

/// Single-pass replacement of entity references in a string using a given entity map.
fn replace_entity_references(
    src: &str,
    entities: &HashMap<String, String>,
    expanded: &mut bool,
) -> String {
    let bytes = src.as_bytes();
    let len = bytes.len();
    let mut result = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        if bytes[pos] != b'&' {
            pos += 1;
            continue;
        }

        let amp_pos = pos;
        pos += 1;

        // Read entity name ([\w:.-]+)
        let name_start = pos;
        while pos < len && is_name_char(bytes[pos]) {
            pos += 1;
        }

        if pos > name_start && pos < len && bytes[pos] == b';' {
            let name = &src[name_start..pos];
            if let Some(replacement) = entities.get(name) {
                result.push_str(&src[copy_start..amp_pos]);
                result.push_str(replacement);
                *expanded = true;
                pos += 1; // skip ';'
                copy_start = pos;
                continue;
            }
            pos += 1; // skip ';' -- entity not found, leave as-is
        }
        // Not a recognized entity reference -- continue scanning
    }

    result.push_str(&src[copy_start..]);
    result
}

fn skip_whitespace(bytes: &[u8], pos: &mut usize, len: usize) {
    while *pos < len && bytes[*pos].is_ascii_whitespace() {
        *pos += 1;
    }
}

/// Strips `<?...?>` processing instructions from the source.
fn strip_processing_instructions(xml: &str) -> String {
    let bytes = xml.as_bytes();
    let len = bytes.len();
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        if bytes[pos..].starts_with(b"<?") {
            output.push_str(&xml[copy_start..pos]);
            pos += 2;
            if let Some(end) = find_in_bytes(bytes, b"?>", pos) {
                pos = end + 2;
            } else {
                pos = len;
            }
            copy_start = pos;
        } else {
            pos += 1;
        }
    }

    output.push_str(&xml[copy_start..]);
    output
}

/// Strips `<!-- -->` comments from the source, preserving CDATA sections.
fn strip_xml_comments(xml: &str) -> String {
    let bytes = xml.as_bytes();
    let len = bytes.len();
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        // Skip over CDATA sections so comments inside CDATA are preserved as literal text
        if bytes[pos..].starts_with(b"<![CDATA[") {
            if let Some(end) = find_in_bytes(bytes, b"]]>", pos + 9) {
                pos = end + 3;
            } else {
                pos = len;
            }
            continue;
        }

        // Remove XML comments
        if bytes[pos..].starts_with(b"<!--") {
            output.push_str(&xml[copy_start..pos]);
            if let Some(end) = find_in_bytes(bytes, b"-->", pos + 4) {
                pos = end + 3;
            } else {
                pos = len;
            }
            copy_start = pos;
            continue;
        }

        pos += 1;
    }

    output.push_str(&xml[copy_start..]);
    output
}

/// Removes every DOCTYPE, collecting the general entities its internal subset declares into `out`.
fn strip_xml_doctypes(xml: &str, out: &mut HashMap<String, String>) -> String {
    let bytes = xml.as_bytes();
    let len = bytes.len();
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        if bytes[pos] != b'<' || pos + 9 > len {
            pos += 1;
            continue;
        }

        // Case-insensitive check for <!doctype
        let candidate = &xml[pos..pos + 9];
        if !candidate.eq_ignore_ascii_case("<!doctype") {
            pos += 1;
            continue;
        }

        output.push_str(&xml[copy_start..pos]);
        let doctype_start = pos;
        pos += 9;

        let mut internal_subset_depth: u32 = 0;
        let mut quote: u8 = 0;
        while pos < len {
            let ch = bytes[pos];
            if quote != 0 {
                if ch == quote {
                    quote = 0;
                }
            } else if ch == b'"' || ch == b'\'' {
                quote = ch;
            } else if ch == b'[' {
                internal_subset_depth += 1;
            } else if ch == b']' && internal_subset_depth > 0 {
                internal_subset_depth -= 1;
            } else if ch == b'>' && internal_subset_depth == 0 {
                pos += 1;
                break;
            }
            pos += 1;
        }

        collect_xml_entity_declarations(&xml[doctype_start..pos], out);
        copy_start = pos;
    }

    output.push_str(&xml[copy_start..]);
    output
}

/// Returns the replacement string for one of the five predefined XML entities.
fn xml_entity_replacement(name: &str) -> Option<&'static str> {
    match name {
        "amp" => Some("&"),
        "apos" => Some("'"),
        "gt" => Some(">"),
        "lt" => Some("<"),
        "quot" => Some("\""),
        _ => None,
    }
}
