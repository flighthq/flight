//! flight-compiler: nullable-options

// Tree-building (DOM-style) XML parser sufficient for atlas and plist file formats.
// Not a general-purpose XML parser, but handles namespaced/extra attributes and elements,
// both double-quoted and single-quoted attribute values, XML entity escapes
// (&amp; &lt; &gt; &quot; &apos; plus numeric references), general entities declared in a
// DOCTYPE's internal subset, XML comments (<!-- -->), CDATA sections (<![CDATA[...]]>),
// the XML declaration, and DOCTYPE.

use std::sync::RwLock;

use flight_entity::Ref;

use crate::types::{XmlContent, XmlElement};
use crate::xml_native::{
    XmlRecord, create_xml_record, get_xml_record_value, push_xml_element_content,
    push_xml_text_content, set_xml_record_value, xml_is_whitespace, xml_record_is_empty,
    xml_string_from_code_point, xml_trim, xml_utf16_slice,
};

/// An entity may nest a few levels legitimately; past that a document is recursing, not composing.
const MAX_XML_ENTITY_PASSES: usize = 8;
const MAX_XML_ENTITY_GROWTH: usize = 16;
const MAX_XML_ENTITY_BUDGET: usize = 65536;

/// Authored XML rarely nests beyond a few dozen elements. This leaves an order of magnitude of
/// margin while stopping recursion well below the engine-dependent call-stack limit.
const MAX_XML_ELEMENT_DEPTH: usize = 256;

struct ParseState {
    depth: usize,
    depth_exceeded: bool,
    pos: usize,
}

fn utf16_units(value: &str) -> Vec<u16> {
    return value.encode_utf16().collect();
}

fn utf16_starts_with(units: &[u16], start: usize, pattern: &str) -> bool {
    let pattern_units: Vec<u16> = pattern.encode_utf16().collect();
    if start + pattern_units.len() > units.len() {
        return false;
    }
    let mut index: usize = 0;
    while index < pattern_units.len() {
        if units[start + index] != pattern_units[index] {
            return false;
        }
        index += 1;
    }
    return true;
}

fn find_in_units(units: &[u16], pattern: &str, start: usize) -> Option<usize> {
    let pattern_units: Vec<u16> = pattern.encode_utf16().collect();
    if pattern_units.is_empty() {
        return Some(start);
    }
    let mut position = start;
    while position + pattern_units.len() <= units.len() {
        let mut matches = true;
        let mut index: usize = 0;
        while index < pattern_units.len() {
            if units[position + index] != pattern_units[index] {
                matches = false;
                break;
            }
            index += 1;
        }
        if matches {
            return Some(position);
        }
        position += 1;
    }
    return None;
}

fn is_name_char(unit: u16) -> bool {
    return (unit >= 48 && unit <= 57)
        || (unit >= 65 && unit <= 90)
        || (unit >= 97 && unit <= 122)
        || unit == 95
        || unit == 58
        || unit == 46
        || unit == 45;
}

fn is_tag_name_end(unit: u16) -> bool {
    return xml_is_whitespace(unit) || unit == 62 || unit == 47;
}

fn is_word_char(unit: u16) -> bool {
    return (unit >= 48 && unit <= 57)
        || (unit >= 65 && unit <= 90)
        || (unit >= 97 && unit <= 122)
        || unit == 95;
}

fn is_decimal_digit(unit: u16) -> bool {
    return unit >= 48 && unit <= 57;
}

fn is_hex_digit(unit: u16) -> bool {
    return is_decimal_digit(unit) || (unit >= 65 && unit <= 70) || (unit >= 97 && unit <= 102);
}

fn parse_code_point(units: &[u16], start: usize, end: usize, radix: u32) -> Option<u32> {
    let mut value: u32 = 0;
    let mut position = start;
    while position < end {
        let unit = units[position];
        let digit: u32;
        if unit >= 48 && unit <= 57 {
            digit = (unit - 48) as u32;
        } else if unit >= 65 && unit <= 70 {
            digit = (unit - 65 + 10) as u32;
        } else if unit >= 97 && unit <= 102 {
            digit = (unit - 97 + 10) as u32;
        } else {
            return None;
        }
        if digit >= radix || value > 0x10ffff / radix {
            return None;
        }
        value = value * radix + digit;
        if value > 0x10ffff {
            return None;
        }
        position += 1;
    }
    return Some(value);
}

fn skip_whitespace(units: &[u16], pos: &mut usize) {
    while *pos < units.len() && xml_is_whitespace(units[*pos]) {
        *pos += 1;
    }
}

/// Collects general entity declarations from a DOCTYPE's internal subset.
///
/// Parameter entities (`<!ENTITY % name ...>`) and external ones (`SYSTEM` / `PUBLIC`) are
/// deliberately not collected: an external entity resolves a URL or a file path at parse time,
/// which is a document reading whatever the process can reach, so the parser has no business
/// honoring one.
fn collect_xml_entity_declarations(doctype: &str, out: &mut XmlRecord<String, String>) {
    let units = utf16_units(doctype);
    let len = units.len();
    let mut pos = 0;

    while pos + 8 <= len {
        if !utf16_starts_with(&units, pos, "<!ENTITY") {
            pos += 1;
            continue;
        }
        pos += 8;

        let ws_start = pos;
        while pos < len && xml_is_whitespace(units[pos]) {
            pos += 1;
        }
        if pos == ws_start {
            continue;
        }

        let name_start = pos;
        while pos < len && is_name_char(units[pos]) {
            pos += 1;
        }
        if pos == name_start {
            continue;
        }
        let name = xml_utf16_slice(doctype, name_start, pos);

        while pos < len && xml_is_whitespace(units[pos]) {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let quote = units[pos];
        if quote != 34 && quote != 39 {
            continue;
        }
        pos += 1;

        let value_start = pos;
        while pos < len && units[pos] != quote {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let value = xml_utf16_slice(doctype, value_start, pos);
        pos += 1;

        while pos < len && xml_is_whitespace(units[pos]) {
            pos += 1;
        }
        if pos < len && units[pos] == 62 {
            set_xml_record_value(out, name, value);
            pos += 1;
        }
    }
}

fn decode_xml_entities(source: &str) -> String {
    let units = utf16_units(source);
    let len = units.len();
    let mut result = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        if units[pos] != 38 {
            pos += 1;
            continue;
        }

        let amp_pos = pos;
        pos += 1;
        if pos >= len {
            break;
        }

        if units[pos] == 35 {
            pos += 1;
            let is_hex = pos < len && units[pos] == 120;
            if is_hex {
                pos += 1;
            }

            let num_start = pos;
            if is_hex {
                while pos < len && is_hex_digit(units[pos]) {
                    pos += 1;
                }
            } else {
                while pos < len && is_decimal_digit(units[pos]) {
                    pos += 1;
                }
            }

            if pos > num_start && pos < len && units[pos] == 59 {
                let radix: u32 = if is_hex { 16 } else { 10 };
                if let Some(code_point) = parse_code_point(&units, num_start, pos, radix) {
                    if let Some(replacement) = xml_string_from_code_point(code_point) {
                        result += &xml_utf16_slice(source, copy_start, amp_pos);
                        result += &replacement;
                        pos += 1;
                        copy_start = pos;
                        continue;
                    }
                }
                pos += 1;
                continue;
            }
            continue;
        }

        let name_start = pos;
        while pos < len && is_word_char(units[pos]) {
            pos += 1;
        }
        if pos > name_start && pos < len && units[pos] == 59 {
            let name = xml_utf16_slice(source, name_start, pos);
            if let Some(replacement) = xml_entity_replacement(&name) {
                result += &xml_utf16_slice(source, copy_start, amp_pos);
                result += replacement;
                pos += 1;
                copy_start = pos;
                continue;
            }
            pos += 1;
        }
    }

    result += &xml_utf16_slice(source, copy_start, len);
    return result;
}

/// Substitutes declared general entities into the source ahead of parsing.
fn expand_xml_entities(src: &str, entities: &XmlRecord<String, String>) -> String {
    if xml_record_is_empty(entities) {
        return src.to_string();
    }

    let source_units = utf16_units(src);
    let mut output = src.to_string();
    let budget = source_units.len() * MAX_XML_ENTITY_GROWTH + MAX_XML_ENTITY_BUDGET;

    let mut pass: usize = 0;
    while pass < MAX_XML_ENTITY_PASSES {
        let mut expanded = false;
        let next = replace_entity_references(&output, entities, &mut expanded);
        if !expanded || utf16_units(&next).len() > budget {
            return output;
        }
        output = next;
        pass += 1;
    }
    return output;
}

fn parse_element(src: &str, units: &[u16], state: &mut ParseState) -> Option<XmlElement> {
    if state.depth >= MAX_XML_ELEMENT_DEPTH {
        state.depth_exceeded = true;
        return None;
    }

    let len = units.len();
    skip_whitespace(units, &mut state.pos);
    if state.pos >= len || units[state.pos] != 60 {
        return None;
    }
    state.pos += 1;

    if state.pos < len && units[state.pos] == 63 {
        if let Some(end) = find_in_units(units, "?>", state.pos) {
            state.pos = end + 2;
        } else {
            state.pos = len;
        }
        return parse_element(src, units, state);
    }

    let name_start = state.pos;
    while state.pos < len && !is_tag_name_end(units[state.pos]) {
        state.pos += 1;
    }
    let name = xml_utf16_slice(src, name_start, state.pos);
    if name.is_empty() {
        return None;
    }

    skip_whitespace(units, &mut state.pos);
    let attrs_start = state.pos;
    let mut quote: u16 = 0;
    while state.pos < len {
        let unit = units[state.pos];
        if quote != 0 {
            if unit == quote {
                quote = 0;
            }
        } else if unit == 34 || unit == 39 {
            quote = unit;
        } else if unit == 62 || (unit == 47 && state.pos + 1 < len && units[state.pos + 1] == 62) {
            break;
        }
        state.pos += 1;
    }
    let attrs_str = xml_utf16_slice(src, attrs_start, state.pos);

    let self_closing = state.pos < len && units[state.pos] == 47;
    state.pos += if self_closing { 2 } else { 1 };

    let attributes = parse_xml_attributes(&attrs_str);
    let mut children: Vec<Ref<XmlElement>> = Vec::new();
    let mut content: Vec<XmlContent> = Vec::new();
    let mut text = String::new();

    if !self_closing {
        while state.pos < len {
            if units[state.pos] != 60 {
                let text_start = state.pos;
                while state.pos < len && units[state.pos] != 60 {
                    state.pos += 1;
                }
                let decoded = decode_xml_entities(&xml_utf16_slice(src, text_start, state.pos));
                text += &xml_trim(&decoded);
                if !decoded.is_empty() {
                    push_xml_text_content(&mut content, decoded);
                }
                continue;
            }

            if utf16_starts_with(units, state.pos, "<![CDATA[") {
                let cdata_start = state.pos + 9;
                if let Some(end) = find_in_units(units, "]]>", cdata_start) {
                    let cdata = xml_utf16_slice(src, cdata_start, end);
                    text += &xml_trim(&cdata);
                    if !cdata.is_empty() {
                        push_xml_text_content(&mut content, cdata);
                    }
                    state.pos = end + 3;
                } else {
                    let cdata = xml_utf16_slice(src, cdata_start, len);
                    text += &xml_trim(&cdata);
                    if !cdata.is_empty() {
                        push_xml_text_content(&mut content, cdata);
                    }
                    state.pos = len;
                }
                continue;
            }

            if state.pos + 1 < len && units[state.pos + 1] == 47 {
                while state.pos < len && units[state.pos] != 62 {
                    state.pos += 1;
                }
                if state.pos < len {
                    state.pos += 1;
                }
                break;
            }

            state.depth += 1;
            let child = parse_element(src, units, state);
            state.depth -= 1;
            if state.depth_exceeded {
                return None;
            }
            if let Some(child) = child {
                let child_ref: Ref<XmlElement> = Ref::new(RwLock::new(child));
                children.push(child_ref.clone());
                push_xml_element_content(&mut content, child_ref);
            }
        }
    }

    return Some(XmlElement {
        attributes,
        children,
        content,
        name,
        text,
    });
}

/// Parse all attributes from an element's attribute string.
/// Supports double-quoted and single-quoted values and XML entity escapes.
pub fn parse_xml_attributes(attrs: &str) -> XmlRecord<String, String> {
    let units = utf16_units(attrs);
    let len = units.len();
    let mut result = create_xml_record();
    let mut pos = 0;

    while pos < len {
        while pos < len && !is_name_char(units[pos]) {
            pos += 1;
        }
        if pos >= len {
            break;
        }

        let name_start = pos;
        while pos < len && is_name_char(units[pos]) {
            pos += 1;
        }
        let name = xml_utf16_slice(attrs, name_start, pos);

        while pos < len && xml_is_whitespace(units[pos]) {
            pos += 1;
        }
        if pos >= len || units[pos] != 61 {
            continue;
        }
        pos += 1;

        while pos < len && xml_is_whitespace(units[pos]) {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let quote = units[pos];
        if quote != 34 && quote != 39 {
            continue;
        }
        pos += 1;

        let value_start = pos;
        while pos < len && units[pos] != quote {
            pos += 1;
        }
        let value = xml_utf16_slice(attrs, value_start, pos);
        if pos < len {
            pos += 1;
        }
        set_xml_record_value(&mut result, name, decode_xml_entities(&value));
    }

    return result;
}

/// Parse a simple XML document into a tree of XmlElement objects.
/// Returns the root element, or None when the input contains no recognizable element.
/// Does not validate DTD, namespaces, or processing instructions.
pub fn parse_xml_document(xml: &str) -> Option<XmlElement> {
    let src = strip_xml_comments(xml);
    let src = normalize_xml_line_endings(&src);

    let mut entities = create_xml_record();
    let src = strip_processing_instructions(&src);
    let src = strip_xml_doctypes(&src, &mut entities);
    let src = xml_trim(&src);
    let expanded = expand_xml_entities(&src, &entities);
    let units = utf16_units(&expanded);

    let mut state = ParseState {
        depth: 0,
        depth_exceeded: false,
        pos: 0,
    };
    return parse_element(&expanded, &units, &mut state);
}

fn replace_entity_references(
    src: &str,
    entities: &XmlRecord<String, String>,
    expanded: &mut bool,
) -> String {
    let units = utf16_units(src);
    let len = units.len();
    let mut result = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        if units[pos] != 38 {
            pos += 1;
            continue;
        }

        let amp_pos = pos;
        pos += 1;
        let name_start = pos;
        while pos < len && is_name_char(units[pos]) {
            pos += 1;
        }

        if pos > name_start && pos < len && units[pos] == 59 {
            let name = xml_utf16_slice(src, name_start, pos);
            if let Some(replacement) = get_xml_record_value(entities, &name) {
                result += &xml_utf16_slice(src, copy_start, amp_pos);
                result += replacement;
                *expanded = true;
                pos += 1;
                copy_start = pos;
                continue;
            }
            pos += 1;
        }
    }

    result += &xml_utf16_slice(src, copy_start, len);
    return result;
}

fn normalize_xml_line_endings(xml: &str) -> String {
    let units = utf16_units(xml);
    let mut output = String::new();
    let mut position: usize = 0;
    let mut copy_start: usize = 0;
    while position < units.len() {
        if units[position] != 13 {
            position += 1;
            continue;
        }
        output += &xml_utf16_slice(xml, copy_start, position);
        output += "\n";
        position += 1;
        if position < units.len() && units[position] == 10 {
            position += 1;
        }
        copy_start = position;
    }
    output += &xml_utf16_slice(xml, copy_start, units.len());
    return output;
}

fn strip_processing_instructions(xml: &str) -> String {
    let units = utf16_units(xml);
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < units.len() {
        if utf16_starts_with(&units, pos, "<?") {
            output += &xml_utf16_slice(xml, copy_start, pos);
            pos += 2;
            if let Some(end) = find_in_units(&units, "?>", pos) {
                pos = end + 2;
            } else {
                pos = units.len();
            }
            copy_start = pos;
        } else {
            pos += 1;
        }
    }

    output += &xml_utf16_slice(xml, copy_start, units.len());
    return output;
}

fn strip_xml_comments(xml: &str) -> String {
    let units = utf16_units(xml);
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < units.len() {
        if utf16_starts_with(&units, pos, "<![CDATA[") {
            if let Some(end) = find_in_units(&units, "]]>", pos + 9) {
                pos = end + 3;
            } else {
                pos = units.len();
            }
            continue;
        }

        if utf16_starts_with(&units, pos, "<!--") {
            output += &xml_utf16_slice(xml, copy_start, pos);
            if let Some(end) = find_in_units(&units, "-->", pos + 4) {
                pos = end + 3;
            } else {
                pos = units.len();
            }
            copy_start = pos;
            continue;
        }
        pos += 1;
    }

    output += &xml_utf16_slice(xml, copy_start, units.len());
    return output;
}

fn ascii_case_insensitive_at(units: &[u16], start: usize, expected: &str) -> bool {
    let expected_units = utf16_units(expected);
    if start + expected_units.len() > units.len() {
        return false;
    }
    let mut index: usize = 0;
    while index < expected_units.len() {
        let mut actual = units[start + index];
        if actual >= 65 && actual <= 90 {
            actual += 32;
        }
        if actual != expected_units[index] {
            return false;
        }
        index += 1;
    }
    return true;
}

fn strip_xml_doctypes(xml: &str, out: &mut XmlRecord<String, String>) -> String {
    let units = utf16_units(xml);
    let len = units.len();
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        if units[pos] != 60 || !ascii_case_insensitive_at(&units, pos, "<!doctype") {
            pos += 1;
            continue;
        }

        output += &xml_utf16_slice(xml, copy_start, pos);
        let doctype_start = pos;
        pos += 9;

        let mut internal_subset_depth: u32 = 0;
        let mut quote: u16 = 0;
        while pos < len {
            let unit = units[pos];
            if quote != 0 {
                if unit == quote {
                    quote = 0;
                }
            } else if unit == 34 || unit == 39 {
                quote = unit;
            } else if unit == 91 {
                internal_subset_depth += 1;
            } else if unit == 93 && internal_subset_depth > 0 {
                internal_subset_depth -= 1;
            } else if unit == 62 && internal_subset_depth == 0 {
                pos += 1;
                break;
            }
            pos += 1;
        }

        collect_xml_entity_declarations(&xml_utf16_slice(xml, doctype_start, pos), out);
        copy_start = pos;
    }

    output += &xml_utf16_slice(xml, copy_start, len);
    return output;
}

fn xml_entity_replacement(name: &str) -> Option<&'static str> {
    if name == "amp" {
        return Some("&");
    }
    if name == "apos" {
        return Some("'");
    }
    if name == "gt" {
        return Some(">");
    }
    if name == "lt" {
        return Some("<");
    }
    if name == "quot" {
        return Some("\"");
    }
    return None;
}
