use flight_skeleton2d_formats::contract::*;

use crate::support::{minimal_spine_binary, spine_binary_with_bones};

mod collect_spine_binary_section_counts {
    use super::*;

    #[test]
    fn distinguishes_unreadable_empty_and_populated_streams() {
        assert!(collect_spine_binary_section_counts(&[]).is_none());
        assert!(collect_spine_binary_section_counts(&minimal_spine_binary("4.2.0")).is_none());
        assert!(
            collect_spine_binary_section_counts(&minimal_spine_binary("4.1.0"))
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            collect_spine_binary_section_counts(&spine_binary_with_bones("4.1.0", 3))
                .unwrap()
                .get(SPINE_SECTION_KIND_BONES),
            Some(&3),
        );
    }
}
