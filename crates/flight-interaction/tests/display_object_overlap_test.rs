use flight_geometry::create_rectangle;

use crate::interaction_fixture;
use flight_interaction::display_object_overlap::*;

mod contains_node2d {
    use super::*;

    #[test]
    fn returns_true_for_overlapping_zero_bounds() {
        let a = interaction_fixture::node();
        let b = interaction_fixture::node();
        let mut revisions = interaction_fixture::revisions();
        assert!(contains_node2d(&a, &b, &mut revisions));
    }
}

mod get_node2d_overlap_rectangle {
    use super::*;

    #[test]
    fn zero_bounds_yields_zero_rectangle() {
        let a = interaction_fixture::node();
        let b = interaction_fixture::node();
        let mut revisions = interaction_fixture::revisions();
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_node2d_overlap_rectangle(&mut out, &a, &b, &mut revisions);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }
}

mod hit_test_node2ds_shape {
    use super::*;

    #[test]
    fn no_parent_returns_false() {
        let a = interaction_fixture::node();
        let b = interaction_fixture::node();
        let mut revisions = interaction_fixture::revisions();
        assert!(!hit_test_node2ds_shape(&a, &b, &mut revisions));
    }
}
