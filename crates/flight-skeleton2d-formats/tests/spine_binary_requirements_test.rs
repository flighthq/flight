use flight_requirement::contract::RequirementFacet;
use flight_skeleton2d_formats::contract::*;

use crate::support::{minimal_spine_binary, spine_binary_with_bones};

mod is_readable_spine_binary {
    use super::*;

    #[test]
    fn distinguishes_supported_complete_streams() {
        assert!(!is_readable_spine_binary(&[]));
        assert!(!is_readable_spine_binary(&minimal_spine_binary("3.8.55")));
        assert!(is_readable_spine_binary(&minimal_spine_binary("4.1.0")));
    }
}

mod parse_spine_binary_requirements {
    use super::*;

    #[test]
    fn emits_namespaced_document_format_requirements() {
        let set = parse_spine_binary_requirements(&spine_binary_with_bones("4.1.0", 2));
        assert_eq!(set.covers, [RequirementFacet::DocumentFormat]);
        assert_eq!(set.requirements.len(), 1);
        assert_eq!(set.requirements[0].facet, RequirementFacet::DocumentFormat);
        assert_eq!(set.requirements[0].key, "spine-binary.bones");
    }
}
