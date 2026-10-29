use flight_xml::*;

mod get_xml_element_attribute {
    use super::*;

    #[test]
    fn returns_the_attribute_value_when_present() {
        let root = parse_xml_document(r#"<node name="hero" x="10"/>"#).unwrap();
        assert_eq!(get_xml_element_attribute(&root, "name"), Some("hero"));
    }

    #[test]
    fn returns_none_when_the_attribute_is_absent() {
        let root = parse_xml_document(r#"<node name="hero"/>"#).unwrap();
        assert_eq!(get_xml_element_attribute(&root, "missing"), None);
    }

    #[test]
    fn returns_an_empty_string_attribute_rather_than_none() {
        let root = parse_xml_document(r#"<node label=""/>"#).unwrap();
        assert_eq!(get_xml_element_attribute(&root, "label"), Some(""));
    }
}

mod get_xml_element_attribute_number {
    use super::*;

    #[test]
    fn parses_a_numeric_attribute() {
        let root = parse_xml_document(r#"<node x="10" scale="1.5"/>"#).unwrap();
        assert_eq!(get_xml_element_attribute_number(&root, "x"), Some(10.0));
        assert_eq!(get_xml_element_attribute_number(&root, "scale"), Some(1.5));
    }

    #[test]
    fn returns_none_when_the_attribute_is_absent() {
        let root = parse_xml_document(r#"<node x="10"/>"#).unwrap();
        assert_eq!(get_xml_element_attribute_number(&root, "missing"), None);
    }

    #[test]
    fn returns_none_when_the_value_is_not_a_finite_number() {
        let root = parse_xml_document(r#"<node x="abc" y=""/>"#).unwrap();
        assert_eq!(get_xml_element_attribute_number(&root, "x"), None);
        assert_eq!(get_xml_element_attribute_number(&root, "y"), None);
    }
}

mod get_xml_element_child_by_name {
    use super::*;

    #[test]
    fn returns_the_first_matching_child_element() {
        let root = parse_xml_document(r#"<root><a id="1"/><b/><a id="2"/></root>"#).unwrap();
        let child = get_xml_element_child_by_name(&root, "a").unwrap();
        assert_eq!(child.read().unwrap().attributes["id"], "1");
    }

    #[test]
    fn returns_none_when_no_child_matches() {
        let root = parse_xml_document("<root><a/></root>").unwrap();
        assert!(get_xml_element_child_by_name(&root, "z").is_none());
    }
}

mod get_xml_element_children_by_name {
    use super::*;

    #[test]
    fn returns_all_matching_children_in_document_order() {
        let root = parse_xml_document(r#"<root><a id="1"/><b/><a id="2"/></root>"#).unwrap();
        let matches = get_xml_element_children_by_name(&root, "a");
        let ids: Vec<String> = matches
            .iter()
            .map(|c| c.read().unwrap().attributes["id"].clone())
            .collect();
        assert_eq!(ids, vec!["1".to_string(), "2".to_string()]);
    }

    #[test]
    fn returns_an_empty_vec_when_no_child_matches() {
        let root = parse_xml_document("<root><a/></root>").unwrap();
        assert!(get_xml_element_children_by_name(&root, "z").is_empty());
    }
}
