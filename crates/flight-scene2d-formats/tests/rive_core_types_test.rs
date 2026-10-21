use std::collections::HashSet;

use flight_scene2d_formats::contract::*;

mod get_rive_core_type_name {
    use super::*;

    #[test]
    fn names_the_types_a_reader_meets_first() {
        assert_eq!(get_rive_core_type_name(1), Some("Artboard"));
        assert_eq!(get_rive_core_type_name(2), Some("Node"));
        assert_eq!(get_rive_core_type_name(3), Some("Shape"));
        assert_eq!(get_rive_core_type_name(23), Some("Backboard"));
    }

    #[test]
    fn returns_none_for_a_key_the_object_model_does_not_define() {
        assert_eq!(get_rive_core_type_name(0), None);
        assert_eq!(get_rive_core_type_name(999_999), None);
    }
}

mod get_rive_core_type_parent {
    use super::*;

    #[test]
    fn names_the_type_each_key_extends() {
        assert_eq!(get_rive_core_type_parent(3), Some(13));
        assert_eq!(get_rive_core_type_parent(13), Some(2));
    }

    #[test]
    fn reports_negative_one_for_a_root_of_the_object_model() {
        assert_eq!(get_rive_core_type_parent(10), Some(-1));
    }

    #[test]
    fn reports_none_for_an_unknown_key_which_is_not_the_same_as_a_root() {
        assert_eq!(get_rive_core_type_parent(999_999), None);
    }
}

mod is_rive_core_type_derived_from {
    use super::*;

    #[test]
    fn does_not_invent_inheritance_that_is_not_declared() {
        assert!(!is_rive_core_type_derived_from(2, 4));
        assert!(!is_rive_core_type_derived_from(23, 10));
        assert!(!is_rive_core_type_derived_from(999_999, 10));
    }

    #[test]
    fn holds_an_acyclic_graph_in_which_every_declared_parent_resolves() {
        let mut deepest = 0;
        for key in 0..1200 {
            if get_rive_core_type_name(key).is_none() {
                continue;
            }
            let mut seen = HashSet::new();
            let mut current = key;
            let mut depth = 0;
            loop {
                assert!(seen.insert(current));
                let Some(parent) = get_rive_core_type_parent(current) else {
                    panic!("known type {current} has no registry row");
                };
                if parent == -1 {
                    break;
                }
                assert!(get_rive_core_type_name(parent).is_some());
                current = parent;
                depth += 1;
            }
            deepest = deepest.max(depth);
        }
        assert_eq!(deepest, 8);
    }

    #[test]
    fn treats_a_type_as_derived_from_itself_so_the_test_reads_as_is_a() {
        assert!(is_rive_core_type_derived_from(3, 3));
    }

    #[test]
    fn walks_the_declared_inheritance_chain() {
        assert!(is_rive_core_type_derived_from(4, 2));
        assert!(is_rive_core_type_derived_from(4, 10));
        assert!(is_rive_core_type_derived_from(3, 10));
    }
}
