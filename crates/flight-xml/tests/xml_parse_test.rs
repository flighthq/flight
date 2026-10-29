use flight_xml::*;

fn repeated(value: &str, count: usize) -> String {
    let mut result = String::new();
    let mut index: usize = 0;
    while index < count {
        result += value;
        index += 1;
    }
    return result;
}

mod parse_xml_attributes {
    use super::*;

    #[test]
    fn parses_double_quoted_attributes() {
        let attrs = parse_xml_attributes(r#"name="hero" x="10" y="20""#);
        assert_eq!(attrs["name"], "hero");
        assert_eq!(attrs["x"], "10");
        assert_eq!(attrs["y"], "20");
    }

    #[test]
    fn parses_single_quoted_attributes() {
        let attrs = parse_xml_attributes("name='hero' x='10'");
        assert_eq!(attrs["name"], "hero");
        assert_eq!(attrs["x"], "10");
    }

    #[test]
    fn decodes_xml_entity_amp() {
        let attrs = parse_xml_attributes(r#"name="a&amp;b""#);
        assert_eq!(attrs["name"], "a&b");
    }

    #[test]
    fn decodes_xml_entity_lt_and_gt() {
        let attrs = parse_xml_attributes(r#"name="a&lt;b&gt;c""#);
        assert_eq!(attrs["name"], "a<b>c");
    }

    #[test]
    fn decodes_xml_entity_quot() {
        let attrs = parse_xml_attributes("name='say &quot;hi&quot;'");
        assert_eq!(attrs["name"], "say \"hi\"");
    }

    #[test]
    fn decodes_xml_entity_apos() {
        let attrs = parse_xml_attributes(r#"name="it&apos;s""#);
        assert_eq!(attrs["name"], "it's");
    }

    #[test]
    fn decodes_numeric_character_references() {
        let attrs = parse_xml_attributes(r#"name="&#65;""#);
        assert_eq!(attrs["name"], "A");
    }

    #[test]
    fn preserves_out_of_range_numeric_references_without_panicking() {
        let attrs = parse_xml_attributes(r#"decimal="&#1114112;" hex="&#x110000;""#);
        assert_eq!(attrs["decimal"], "&#1114112;");
        assert_eq!(attrs["hex"], "&#x110000;");
    }

    #[test]
    fn returns_empty_map_for_empty_string() {
        assert!(parse_xml_attributes("").is_empty());
    }
}

mod parse_xml_document {
    use super::*;

    #[test]
    fn returns_the_first_top_level_element_as_the_root() {
        let root =
            parse_xml_document(r#"<TextureAtlas imagePath="sheet.png"></TextureAtlas>"#).unwrap();
        assert_eq!(root.name, "TextureAtlas");
        assert_eq!(root.attributes["imagePath"], "sheet.png");
        assert!(root.children.is_empty());
    }

    #[test]
    fn parses_multiple_attributes_on_a_single_element() {
        let root = parse_xml_document(r#"<sub x="10" y="20" width="32" height="64"/>"#).unwrap();
        assert_eq!(root.attributes["x"], "10");
        assert_eq!(root.attributes["y"], "20");
        assert_eq!(root.attributes["width"], "32");
        assert_eq!(root.attributes["height"], "64");
    }

    #[test]
    fn accepts_both_single_and_double_quoted_attribute_values() {
        let root = parse_xml_document(r#"<node a='single' b="double"/>"#).unwrap();
        assert_eq!(root.attributes["a"], "single");
        assert_eq!(root.attributes["b"], "double");
    }

    #[test]
    fn nests_children_under_their_parent_open_tag() {
        let xml = r#"<TextureAtlas imagePath="s.png"><SubTexture name="a" x="0" y="0"/><SubTexture name="b" x="8" y="8"/></TextureAtlas>"#;
        let root = parse_xml_document(xml).unwrap();
        assert_eq!(root.name, "TextureAtlas");
        assert_eq!(root.children.len(), 2);
        assert_eq!(root.children[0].read().unwrap().name, "SubTexture");
        assert_eq!(root.children[0].read().unwrap().attributes["name"], "a");
        assert_eq!(root.children[1].read().unwrap().attributes["name"], "b");
    }

    #[test]
    fn treats_self_closing_tags_as_leaves_rather_than_opening_a_scope() {
        let xml = "<root><leaf/><sibling/></root>";
        let root = parse_xml_document(xml).unwrap();
        let names: Vec<String> = root
            .children
            .iter()
            .map(|c| c.read().unwrap().name.clone())
            .collect();
        assert_eq!(names, vec!["leaf".to_string(), "sibling".to_string()]);
    }

    #[test]
    fn supports_deep_nesting_across_multiple_levels() {
        let xml = r#"<a><b><c value="deep"/></b></a>"#;
        let root = parse_xml_document(xml).unwrap();
        assert_eq!(root.name, "a");
        let b = root.children[0].read().unwrap();
        assert_eq!(b.name, "b");
        let c = b.children[0].read().unwrap();
        assert_eq!(c.name, "c");
        assert_eq!(c.attributes["value"], "deep");
    }

    #[test]
    fn accepts_element_nesting_with_broad_margin_for_authored_documents() {
        let depth = 128;
        let xml = repeated("<node>", depth) + "<leaf/>" + &repeated("</node>", depth);
        assert!(parse_xml_document(&xml).is_some());
    }

    #[test]
    fn returns_none_instead_of_exhausting_the_call_stack_on_excessive_element_nesting() {
        let depth = 300;
        let xml = repeated("<node>", depth) + "<leaf/>" + &repeated("</node>", depth);
        assert!(parse_xml_document(&xml).is_none());
    }

    #[test]
    fn returns_none_when_the_input_contains_no_recognizable_element() {
        assert!(parse_xml_document("").is_none());
        assert!(parse_xml_document("   just text, no tags   ").is_none());
    }

    #[test]
    fn tolerates_unbalanced_close_tags_without_underflowing_the_stack() {
        let root = parse_xml_document("<a></a></b>").unwrap();
        assert_eq!(root.name, "a");
    }

    #[test]
    fn returns_the_first_element_when_several_share_the_top_level() {
        let root = parse_xml_document("<first/><second/>").unwrap();
        assert_eq!(root.name, "first");
    }

    #[test]
    fn allows_dots_hyphens_and_underscores_in_tag_and_attribute_names() {
        let root = parse_xml_document(r#"<my-tag.v2 data_key="x"/>"#).unwrap();
        assert_eq!(root.name, "my-tag.v2");
        assert_eq!(root.attributes["data_key"], "x");
    }

    #[test]
    fn strips_xml_comments() {
        let xml = "<root><!-- This is a comment --><child/></root>";
        let doc = parse_xml_document(xml).unwrap();
        assert_eq!(doc.children.len(), 1);
        assert_eq!(doc.children[0].read().unwrap().name, "child");
    }

    #[test]
    fn strips_the_xml_declaration() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?><root/>"#;
        let doc = parse_xml_document(xml).unwrap();
        assert_eq!(doc.name, "root");
    }

    #[test]
    fn parses_text_content() {
        let xml = "<root><key>hello</key></root>";
        let doc = parse_xml_document(xml).unwrap();
        assert_eq!(doc.children[0].read().unwrap().text, "hello");
    }

    #[test]
    fn keeps_a_gt_inside_a_quoted_attribute_value_as_data_not_tag_end() {
        let root = parse_xml_document(r#"<node attr="a>b"/>"#).unwrap();
        assert_eq!(root.name, "node");
        assert_eq!(root.attributes["attr"], "a>b");
        assert!(root.children.is_empty());
    }

    #[test]
    fn keeps_a_gt_inside_a_single_quoted_attribute_value_and_still_parses_children() {
        let root = parse_xml_document("<root><child path='x>y'/></root>").unwrap();
        assert_eq!(root.children.len(), 1);
        assert_eq!(root.children[0].read().unwrap().attributes["path"], "x>y");
    }

    #[test]
    fn strips_a_doctype_that_carries_an_internal_subset() {
        let xml = r#"<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "#.to_string()
            + r#""http://www.apple.com/DTDs/PropertyList-1.0.dtd" [ <!ENTITY x "y"> ]>"#
            + r#"<plist version="1.0"/>"#;
        let doc = parse_xml_document(&xml).unwrap();
        assert_eq!(doc.name, "plist");
        assert_eq!(doc.attributes["version"], "1.0");
    }

    #[test]
    fn strips_an_internal_subset_when_an_entity_value_contains_bracket_and_gt() {
        let xml = r#"<!DOCTYPE root [<!ENTITY tricky "a ] > b"><!ELEMENT root (#PCDATA)>]>"#
            .to_string()
            + r#"<root value="ok"/>"#;
        let doc = parse_xml_document(&xml).unwrap();
        assert_eq!(doc.name, "root");
        assert_eq!(doc.attributes["value"], "ok");
    }

    #[test]
    fn strips_a_doctype_when_its_external_identifier_contains_gt() {
        let xml = r#"<!DOCTYPE root SYSTEM "https://example.invalid/a>b.dtd"><root/>"#;
        let doc = parse_xml_document(xml).unwrap();
        assert_eq!(doc.name, "root");
    }
}

mod parse_xml_document_internal_dtd_entities {
    use super::*;

    fn doctype(subset: &str, body: &str) -> String {
        return format!(r#"<?xml version="1.0"?><!DOCTYPE root [{subset}]><root>{body}</root>"#);
    }

    #[test]
    fn expands_an_entity_whose_replacement_is_an_element() {
        let xml = doctype(r#"<!ENTITY dot "<circle r='4'/>">"#, "&dot;");
        let root = parse_xml_document(&xml).unwrap();
        assert_eq!(root.children.len(), 1);
        assert_eq!(root.children[0].read().unwrap().name, "circle");
        assert_eq!(root.children[0].read().unwrap().attributes["r"], "4");
    }

    #[test]
    fn expands_the_same_entity_at_every_reference() {
        let xml = doctype(r#"<!ENTITY dot "<circle/>">"#, "&dot;&dot;&dot;");
        let root = parse_xml_document(&xml).unwrap();
        assert_eq!(root.children.len(), 3);
    }

    #[test]
    fn expands_an_entity_declared_with_single_quotes() {
        let xml = doctype("<!ENTITY dot '<circle/>'>", "&dot;");
        let root = parse_xml_document(&xml).unwrap();
        assert_eq!(root.children[0].read().unwrap().name, "circle");
    }

    #[test]
    fn expands_an_entity_that_references_another_entity() {
        let subset = r#"<!ENTITY inner "<circle/>"><!ENTITY outer "<g>&inner;</g>">"#;
        let xml = doctype(subset, "&outer;");
        let root = parse_xml_document(&xml).unwrap();
        let outer = root.children[0].read().unwrap();
        assert_eq!(outer.name, "g");
        assert_eq!(outer.children[0].read().unwrap().name, "circle");
    }

    #[test]
    fn expands_an_entity_used_as_an_attribute_value() {
        let xml = doctype(r#"<!ENTITY w "40">"#, r#"<rect width="&w;"/>"#);
        let root = parse_xml_document(&xml).unwrap();
        assert_eq!(root.children[0].read().unwrap().attributes["width"], "40");
    }

    #[test]
    fn leaves_an_undeclared_reference_alone_rather_than_dropping_it() {
        let xml = doctype(r#"<!ENTITY dot "<circle/>">"#, "&missing;");
        let root = parse_xml_document(&xml).unwrap();
        assert_eq!(root.text, "&missing;");
    }

    #[test]
    fn still_decodes_the_predefined_entities_which_no_subset_needs_to_declare() {
        let xml = doctype(r#"<!ENTITY dot "<circle/>">"#, "a &amp; b");
        let root = parse_xml_document(&xml).unwrap();
        assert_eq!(root.text, "a & b");
    }

    #[test]
    fn does_not_honor_external_system_entity() {
        let xml = doctype(r#"<!ENTITY x SYSTEM "/etc/passwd">"#, "&x;");
        let root = parse_xml_document(&xml).unwrap();
        assert!(root.children.is_empty());
        assert_eq!(root.text, "&x;");
    }

    #[test]
    fn does_not_honor_external_public_entity() {
        let xml = doctype(
            r#"<!ENTITY x PUBLIC "-//X//EN" "http://example.test/x">"#,
            "&x;",
        );
        let root = parse_xml_document(&xml).unwrap();
        assert!(root.children.is_empty());
        assert_eq!(root.text, "&x;");
    }

    #[test]
    fn does_not_honor_parameter_entity() {
        let xml = doctype(r#"<!ENTITY % x "<circle/>">"#, "&x;");
        let root = parse_xml_document(&xml).unwrap();
        assert!(root.children.is_empty());
        assert_eq!(root.text, "&x;");
    }

    #[test]
    fn does_not_expand_a_nested_entity_without_bound() {
        let mut subset = String::from(r#"<!ENTITY e0 "aaaaaaaaaa">"#);
        for level in 1..=6u32 {
            let prev_ref = format!("&e{};", level - 1);
            let references = repeated(&prev_ref, 10);
            subset += &format!(r#"<!ENTITY e{level} "{references}">"#);
        }
        let xml = doctype(&subset, "&e6;");
        let root = parse_xml_document(&xml).unwrap();
        assert!(root.text.len() < 200_000);
    }

    #[test]
    fn terminates_on_an_entity_that_references_itself() {
        let xml = doctype(r#"<!ENTITY loop "&loop;">"#, "&loop;");
        let root = parse_xml_document(&xml);
        assert!(root.is_some());
    }
}
