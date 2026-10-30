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
    XmlRecord, XmlScanner, create_xml_record, create_xml_scanner, decode_xml_entities_native,
    expand_xml_entities_native, parse_xml_attributes_native, prepare_xml_document_native,
    push_xml_element_content, push_xml_text_content, xml_is_whitespace, xml_scanner_find,
    xml_scanner_length, xml_scanner_starts_with, xml_scanner_unit_at, xml_trim, xml_utf16_slice,
};

/// Authored XML rarely nests beyond a few dozen elements. This leaves an order of magnitude of
/// margin while stopping recursion well below the engine-dependent call-stack limit.
const MAX_XML_ELEMENT_DEPTH: usize = 256;

struct ParseState {
    depth: usize,
    depth_exceeded: bool,
    pos: usize,
}

fn is_tag_name_end(unit: u16) -> bool {
    return xml_is_whitespace(unit) || unit == 62 || unit == 47;
}

fn parse_element(source: &str, scanner: &XmlScanner, state: &mut ParseState) -> Option<XmlElement> {
    if state.depth >= MAX_XML_ELEMENT_DEPTH {
        state.depth_exceeded = true;
        return None;
    }

    let len = xml_scanner_length(scanner);
    state.pos = skip_whitespace(scanner, state.pos);
    if state.pos >= len || xml_scanner_unit_at(scanner, state.pos) != 60 {
        return None;
    }
    state.pos += 1;

    if state.pos < len && xml_scanner_unit_at(scanner, state.pos) == 63 {
        let instruction_end = xml_scanner_find(scanner, "?>", state.pos);
        if let Some(end) = instruction_end {
            state.pos = end + 2;
        } else {
            state.pos = len;
        }
        return parse_element(source, scanner, state);
    }

    let name_start = state.pos;
    while state.pos < len && !is_tag_name_end(xml_scanner_unit_at(scanner, state.pos)) {
        state.pos += 1;
    }
    let name = xml_utf16_slice(source, name_start, state.pos);
    if name.is_empty() {
        return None;
    }

    state.pos = skip_whitespace(scanner, state.pos);
    let attributes_start = state.pos;
    let mut quote: u16 = 0;
    while state.pos < len {
        let unit = xml_scanner_unit_at(scanner, state.pos);
        if quote != 0 {
            if unit == quote {
                quote = 0;
            }
        } else if unit == 34 || unit == 39 {
            quote = unit;
        } else if unit == 62
            || (unit == 47
                && state.pos + 1 < len
                && xml_scanner_unit_at(scanner, state.pos + 1) == 62)
        {
            break;
        }
        state.pos += 1;
    }
    let attributes_source = xml_utf16_slice(source, attributes_start, state.pos);
    let self_closing = state.pos < len && xml_scanner_unit_at(scanner, state.pos) == 47;
    state.pos += if self_closing { 2 } else { 1 };

    let attributes = parse_xml_attributes(&attributes_source);
    let mut children: Vec<Ref<XmlElement>> = Vec::new();
    let mut content: Vec<XmlContent> = Vec::new();
    let mut text = String::new();

    if !self_closing {
        while state.pos < len {
            if xml_scanner_unit_at(scanner, state.pos) != 60 {
                let text_start = state.pos;
                while state.pos < len && xml_scanner_unit_at(scanner, state.pos) != 60 {
                    state.pos += 1;
                }
                let decoded =
                    decode_xml_entities_native(&xml_utf16_slice(source, text_start, state.pos));
                text += &xml_trim(&decoded);
                if !decoded.is_empty() {
                    push_xml_text_content(&mut content, decoded);
                }
                continue;
            }

            if xml_scanner_starts_with(scanner, state.pos, "<![CDATA[") {
                let cdata_start = state.pos + 9;
                let cdata_end = xml_scanner_find(scanner, "]]>", cdata_start);
                if let Some(end) = cdata_end {
                    let cdata = xml_utf16_slice(source, cdata_start, end);
                    text += &xml_trim(&cdata);
                    if !cdata.is_empty() {
                        push_xml_text_content(&mut content, cdata);
                    }
                    state.pos = end + 3;
                } else {
                    let cdata = xml_utf16_slice(source, cdata_start, len);
                    text += &xml_trim(&cdata);
                    if !cdata.is_empty() {
                        push_xml_text_content(&mut content, cdata);
                    }
                    state.pos = len;
                }
                continue;
            }

            if state.pos + 1 < len && xml_scanner_unit_at(scanner, state.pos + 1) == 47 {
                while state.pos < len && xml_scanner_unit_at(scanner, state.pos) != 62 {
                    state.pos += 1;
                }
                if state.pos < len {
                    state.pos += 1;
                }
                break;
            }

            state.depth += 1;
            let parsed_child = parse_element(source, scanner, state);
            state.depth -= 1;
            if state.depth_exceeded {
                return None;
            }
            if let Some(child) = parsed_child {
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
pub fn parse_xml_attributes(attributes: &str) -> XmlRecord<String, String> {
    return parse_xml_attributes_native(attributes);
}

/// Parse a simple XML document into a tree of XmlElement objects.
/// Returns the root element, or None when the input contains no recognizable element.
/// Does not validate DTD, namespaces, or processing instructions.
pub fn parse_xml_document(xml: &str) -> Option<XmlElement> {
    let mut entities = create_xml_record();
    let source = prepare_xml_document_native(xml, &mut entities);
    let source = xml_trim(&source);
    let expanded = expand_xml_entities_native(&source, &entities);
    let scanner = create_xml_scanner(&expanded);
    let mut state = ParseState {
        depth: 0,
        depth_exceeded: false,
        pos: 0,
    };
    return parse_element(&expanded, &scanner, &mut state);
}

fn skip_whitespace(scanner: &XmlScanner, mut position: usize) -> usize {
    let len = xml_scanner_length(scanner);
    while position < len && xml_is_whitespace(xml_scanner_unit_at(scanner, position)) {
        position += 1;
    }
    return position;
}
