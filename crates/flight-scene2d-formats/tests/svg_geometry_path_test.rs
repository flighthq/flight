use flight_path::PathWinding;
use flight_scene2d_formats::contract::*;
use flight_xml::{XmlElement, parse_xml_document};

mod create_svg_geometry_path {
    use super::*;

    #[test]
    fn answers_none_for_an_element_that_is_not_geometry() {
        assert!(create_svg_geometry_path(&element("<g/>"), PathWinding::NonZero).is_none());
        assert!(create_svg_geometry_path(&element("<text/>"), PathWinding::NonZero).is_none());
    }

    #[test]
    fn carries_the_winding_it_is_given_onto_the_path() {
        assert_eq!(
            create_svg_geometry_path(
                &element(r#"<rect width="4" height="4"/>"#),
                PathWinding::EvenOdd,
            )
            .expect("rectangle path")
            .winding,
            PathWinding::EvenOdd
        );
        assert_eq!(
            create_svg_geometry_path(
                &element(r#"<rect width="4" height="4"/>"#),
                PathWinding::NonZero,
            )
            .expect("rectangle path")
            .winding,
            PathWinding::NonZero
        );
    }

    #[test]
    fn reads_each_geometry_element_into_the_commands_that_element_implies() {
        assert_eq!(
            commands_of(r#"<rect width="4" height="4"/>"#),
            [1, 2, 2, 2, 7]
        );
        assert_eq!(commands_of(r#"<circle r="3"/>"#), [1, 6, 6, 6, 6, 7]);
        assert_eq!(
            commands_of(r#"<polygon points="0,0 4,0 4,4"/>"#),
            [1, 2, 2, 7]
        );
        assert_eq!(commands_of(r#"<path d="M0 0 L5 5"/>"#), [1, 2]);
    }

    fn commands_of(xml: &str) -> Vec<u8> {
        return create_svg_geometry_path(&element(xml), PathWinding::NonZero)
            .expect("geometry path")
            .commands;
    }
}

fn element(xml: &str) -> XmlElement {
    return parse_xml_document(xml).expect("valid test XML");
}
