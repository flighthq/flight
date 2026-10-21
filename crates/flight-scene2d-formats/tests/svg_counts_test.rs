use std::collections::HashMap;

use flight_scene2d_formats::contract::*;

mod collect_svg_counts {
    use super::*;

    #[test]
    fn counts_container_elements_including_the_root_svg() {
        let counts = counts("<svg><g><rect width=\"10\" height=\"10\"/></g></svg>");
        assert_eq!(counts.get(SVG_ELEMENT_KIND_CONTAINER), Some(&2));
        assert_eq!(counts.get(SVG_ELEMENT_KIND_GEOMETRY), Some(&1));
    }

    #[test]
    fn counts_element_kinds() {
        let counts =
            counts("<svg><rect width=\"10\" height=\"10\"/><circle r=\"5\"/><text>hi</text></svg>");
        assert_eq!(counts.get(SVG_ELEMENT_KIND_GEOMETRY), Some(&2));
        assert_eq!(counts.get(SVG_ELEMENT_KIND_TEXT), Some(&1));
    }

    #[test]
    fn counts_the_root_svg_element_as_a_container() {
        let mut counts = HashMap::from([("stale".to_string(), 7)]);
        assert!(collect_svg_counts(&mut counts, "<svg></svg>"));
        assert_eq!(counts.get(SVG_ELEMENT_KIND_CONTAINER), Some(&1));
        assert_eq!(counts.len(), 1);
    }

    #[test]
    fn counts_use_and_image_elements() {
        let counts = counts(
            "<svg><defs><rect id=\"r\" width=\"10\" height=\"10\"/></defs><use href=\"#r\"/><image href=\"a.png\" width=\"10\" height=\"10\"/></svg>",
        );
        assert_eq!(counts.get(SVG_ELEMENT_KIND_USE), Some(&1));
        assert_eq!(counts.get(SVG_ELEMENT_KIND_IMAGE), Some(&1));
    }

    #[test]
    fn returns_none_for_invalid_xml() {
        let mut counts = HashMap::from([("stale".to_string(), 7)]);
        assert!(!collect_svg_counts(&mut counts, "not xml <<<<"));
        assert!(counts.is_empty());
    }

    #[test]
    fn returns_none_for_non_svg_xml() {
        let mut counts = HashMap::new();
        assert!(!collect_svg_counts(&mut counts, "<html></html>"));
        assert!(!collect_svg_counts(&mut counts, "<div></div>"));
    }

    #[test]
    fn walks_nested_elements() {
        let counts = counts(
            "<svg><g><g><rect width=\"10\" height=\"10\"/><rect width=\"5\" height=\"5\"/></g></g></svg>",
        );
        assert_eq!(counts.get(SVG_ELEMENT_KIND_GEOMETRY), Some(&2));
        assert_eq!(counts.get(SVG_ELEMENT_KIND_CONTAINER), Some(&3));
    }

    fn counts(source: &str) -> HashMap<String, usize> {
        let mut counts = HashMap::new();
        assert!(collect_svg_counts(&mut counts, source));
        return counts;
    }
}
