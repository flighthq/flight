use flight_scene2d_formats::*;
use flight_xml::{XmlElement, parse_xml_document};

mod parse_svg_coordinate {
    use super::*;

    #[test]
    fn reads_a_coordinate_turning_a_percentage_into_a_fraction() {
        assert_eq!(parse_svg_coordinate(Some("10"), 0.0), 10.0);
        assert_eq!(parse_svg_coordinate(Some("50%"), 0.0), 0.5);
        assert_eq!(parse_svg_coordinate(None, 4.0), 4.0);
    }
}

mod parse_svg_css_number {
    use super::*;

    #[test]
    fn reads_a_css_number_falling_back_for_undefined_and_for_nonsense() {
        assert_eq!(parse_svg_css_number(Some("2.5"), 0.0), 2.5);
        assert_eq!(parse_svg_css_number(None, 9.0), 9.0);
        assert_eq!(parse_svg_css_number(Some("x"), 9.0), 9.0);
    }
}

mod parse_svg_length {
    use super::*;

    #[test]
    fn reads_a_length_ignoring_the_unit_suffix_svg_allows() {
        assert_eq!(parse_svg_length(Some("10px"), 0.0), 10.0);
        assert_eq!(parse_svg_length(Some("2em"), 0.0), 2.0);
        assert_eq!(parse_svg_length(None, 5.0), 5.0);
    }
}

mod parse_svg_number_list {
    use super::*;

    #[test]
    fn splits_on_whitespace_and_commas_alike_which_svg_treats_as_the_same_separator() {
        assert_eq!(
            parse_svg_number_list("1 2,3  -4"),
            vec![1.0, 2.0, 3.0, -4.0]
        );
        assert_eq!(parse_svg_number_list(""), Vec::<f32>::new());
    }
}

mod parse_url_reference {
    use super::*;

    #[test]
    fn reads_the_url_form_only_and_answers_none_for_anything_else() {
        assert_eq!(parse_url_reference(Some("url(#a)")), Some("a".to_string()));
        assert_eq!(parse_url_reference(Some("#a")), None);
        assert_eq!(parse_url_reference(None), None);
    }
}

mod svg_attribute {
    use super::*;

    #[test]
    fn reads_an_attribute_and_answers_none_for_one_the_element_does_not_carry() {
        let rectangle = element(r#"<rect x="3"/>"#);
        assert_eq!(svg_attribute(&rectangle, "x"), Some("3"));
        assert_eq!(svg_attribute(&rectangle, "y"), None);
    }
}

mod svg_first_number {
    use super::*;

    #[test]
    fn takes_the_first_entry_of_a_number_list_falling_back_for_an_absent_or_unreadable_one() {
        assert_eq!(svg_first_number(Some("3 4 5"), 0.0), 3.0);
        assert_eq!(svg_first_number(None, 7.0), 7.0);
        assert_eq!(svg_first_number(Some("bad"), 7.0), 7.0);
    }
}

mod svg_local_name {
    use super::*;

    #[test]
    fn drops_a_namespace_prefix_since_svg_in_the_wild_is_written_both_ways() {
        assert_eq!(svg_local_name("svg:rect"), "rect");
        assert_eq!(svg_local_name("rect"), "rect");
    }
}

mod svg_number_attribute {
    use super::*;

    #[test]
    fn reads_a_numeric_attribute_and_falls_back_when_it_is_absent() {
        let rectangle = element(r#"<rect x="3"/>"#);
        assert_eq!(svg_number_attribute(&rectangle, "x", -1.0), 3.0);
        assert_eq!(svg_number_attribute(&rectangle, "y", -1.0), -1.0);
    }
}

mod svg_optional_number_attribute {
    use super::*;

    #[test]
    fn distinguishes_an_absent_attribute_from_a_zero_one() {
        assert_eq!(
            svg_optional_number_attribute(&element(r#"<rect x="3"/>"#), "x"),
            Some(3.0)
        );
        assert_eq!(
            svg_optional_number_attribute(&element(r#"<rect x="3"/>"#), "y"),
            None
        );
        assert_eq!(
            svg_optional_number_attribute(&element(r#"<rect y="0"/>"#), "y"),
            Some(0.0)
        );
    }
}

mod visit_svg_elements {
    use super::*;

    #[test]
    fn visits_the_element_and_every_descendant() {
        let document = element("<svg><g><rect/></g><text/></svg>");
        let mut seen: Vec<String> = Vec::new();
        visit_svg_elements(&document, &mut |node| {
            seen.push(svg_local_name(&node.name).to_string());
        });
        assert_eq!(seen, ["svg", "g", "rect", "text"]);
    }
}

fn element(xml: &str) -> XmlElement {
    return parse_xml_document(xml).expect("valid test XML");
}
