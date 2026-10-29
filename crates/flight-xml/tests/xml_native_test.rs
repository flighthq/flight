//! flight-compiler: target-native
//!
//! Mixed-content identity and record key enumeration are representation-specific: Rust stores
//! `XmlContent` as an enum and TypeScript stores the same union directly, while their map types
//! expose ordering through different APIs.

use flight_xml::*;

#[test]
fn creates_empty_attribute_record_for_empty_input() {
    assert!(parse_xml_attributes("").is_empty());
}

#[test]
fn shares_the_same_child_between_children_and_content() {
    let doc = parse_xml_document("<root><child/></root>").unwrap();
    let content_child = match &doc.content[0] {
        XmlContent::Element(element) => element,
        _ => panic!("expected element content at index 0"),
    };
    assert!(std::sync::Arc::ptr_eq(&doc.children[0], content_child));
}

#[test]
fn observes_child_updates_through_both_projections() {
    let doc = parse_xml_document("<root><child/></root>").unwrap();
    doc.children[0].write().unwrap().name = "renamed".to_string();
    match &doc.content[0] {
        XmlContent::Element(element) => assert_eq!(element.read().unwrap().name, "renamed"),
        _ => panic!("expected element content at index 0"),
    }
}

#[test]
fn preserves_the_order_of_mixed_text_and_child_elements() {
    let doc = parse_xml_document("<text>Hello <tspan>world</tspan>!</text>").unwrap();
    match &doc.content[0] {
        XmlContent::Text(text) => assert_eq!(text, "Hello "),
        _ => panic!("expected text content at index 0"),
    }
    match &doc.content[1] {
        XmlContent::Element(element) => assert_eq!(element.read().unwrap().name, "tspan"),
        _ => panic!("expected element content at index 1"),
    }
    match &doc.content[2] {
        XmlContent::Text(text) => assert_eq!(text, "!"),
        _ => panic!("expected text content at index 2"),
    }
    assert_eq!(doc.text, "Hello!");
}

#[test]
fn preserves_markup_and_comment_syntax_inside_cdata_as_text() {
    let doc = parse_xml_document("<root><![CDATA[<tag>&amp;<!-- literal -->]]><child/>tail</root>")
        .unwrap();
    assert_eq!(doc.children.len(), 1);
    assert_eq!(doc.children[0].read().unwrap().name, "child");
    match &doc.content[0] {
        XmlContent::Text(text) => assert_eq!(text, "<tag>&amp;<!-- literal -->"),
        _ => panic!("expected text content at index 0"),
    }
    assert_eq!(doc.text, "<tag>&amp;<!-- literal -->tail");
}

#[test]
fn preserves_attribute_insertion_order_and_duplicate_position() {
    let attributes = parse_xml_attributes(r#"z="first" a="second" z="updated""#);
    let keys: Vec<&String> = attributes.keys().collect();
    assert_eq!(keys, vec![&"z".to_string(), &"a".to_string()]);
    assert_eq!(attributes["z"], "updated");
}
