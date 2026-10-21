use std::sync::Arc;

use flight_skeleton2d_formats::contract::*;

use crate::support::spine_binary_header;

mod parse_spine_skeleton_binary_versioned {
    use super::*;

    #[test]
    fn separates_unreadable_and_unsupported_headers() {
        let mut unreadable = Vec::new();
        assert!(parse_spine_skeleton_binary_versioned(&[1, 2, 3], Some(&mut unreadable)).is_none());
        assert_eq!(unreadable[0].kind, "spine.binary-header-unreadable");

        let mut unsupported = Vec::new();
        assert!(
            parse_spine_skeleton_binary_versioned(
                &spine_binary_header("9.9.9"),
                Some(&mut unsupported),
            )
            .is_none()
        );
        assert_eq!(unsupported[0].kind, "spine.binary-version-unsupported");
    }
}

mod register_spine_skeleton_binary_parser {
    use super::*;

    #[test]
    fn dispatches_by_major_minor_and_replaces_previous_entries() {
        register_spine_skeleton_binary_parser("7.3", Arc::new(|_, _| None));
        register_spine_skeleton_binary_parser(
            "7.3.11",
            Arc::new(|_, _| {
                Some(Skeleton2DImport {
                    animations: Vec::new(),
                    skeleton: flight_skeleton2d::contract::create_skeleton_2d(Vec::new(), None),
                })
            }),
        );
        assert!(
            parse_spine_skeleton_binary_versioned(&spine_binary_header("7.3.99"), None,).is_some()
        );
    }
}

mod to_spine_binary_layout_key {
    use super::*;

    #[test]
    fn folds_patch_versions_without_inventing_a_minor() {
        assert_eq!(to_spine_binary_layout_key("4.1.17"), "4.1");
        assert_eq!(to_spine_binary_layout_key("4.2"), "4.2");
        assert_eq!(to_spine_binary_layout_key("4"), "4");
    }
}
