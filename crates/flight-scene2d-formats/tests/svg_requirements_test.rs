use flight_requirement::RequirementFacet;
use flight_scene2d_formats::contract::*;

mod is_readable_svg {
    use super::*;

    #[test]
    fn returns_false_for_non_svg_content() {
        assert!(!is_readable_svg("<html></html>"));
        assert!(!is_readable_svg("not xml"));
    }

    #[test]
    fn returns_true_for_a_valid_svg_document() {
        assert!(is_readable_svg("<svg></svg>"));
    }
}

mod parse_svg_requirements {
    use super::*;

    #[test]
    fn emits_a_requirement_for_each_counted_kind() {
        let result =
            parse_svg_requirements("<svg><rect width=\"10\" height=\"10\"/><text>hi</text></svg>");
        let keys: Vec<&str> = result
            .requirements
            .iter()
            .map(|requirement| requirement.key.as_str())
            .collect();
        assert_eq!(keys, vec!["svg.container", "svg.geometry", "svg.text"]);
        assert_eq!(result.covers, vec![RequirementFacet::DocumentFormat]);
    }
}
