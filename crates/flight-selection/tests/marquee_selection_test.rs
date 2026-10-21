use std::ptr;

use flight_geometry::create_rectangle;
use flight_selection::contract::*;

use crate::support::*;

mod begin_marquee_selection {
    use super::*;

    #[test]
    fn starts_a_new_zero_area_rectangle_at_the_pointer_location() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 10.0, 20.0);

        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(10.0, 20.0, 0.0, 0.0)
        );
    }
}

mod create_marquee_selection {
    use super::*;

    #[test]
    fn creates_an_inactive_marquee_with_an_empty_rectangle() {
        let mut marquee = create_marquee_selection();

        update_marquee_selection(&mut marquee, 100.0, 100.0);

        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(0.0, 0.0, 0.0, 0.0)
        );
    }
}

mod end_marquee_selection {
    use super::*;

    #[test]
    fn returns_the_live_rectangle_and_makes_later_updates_inert() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 1.0, 2.0);
        update_marquee_selection(&mut marquee, 3.0, 4.0);

        let returned = end_marquee_selection(&mut marquee) as *const _;
        update_marquee_selection(&mut marquee, 50.0, 50.0);

        assert!(ptr::eq(returned, get_marquee_rectangle(&marquee)));
        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(1.0, 2.0, 2.0, 2.0)
        );
    }
}

mod find_nodes_in_marquee_selection {
    use super::*;

    #[test]
    fn finds_intersecting_or_fully_contained_bounds_in_caller_order() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 0.0, 0.0);
        update_marquee_selection(&mut marquee, 10.0, 10.0);
        let contained = create_bounded_node(
            "contained",
            &create_rectangle(2.0, 2.0, 2.0, 2.0),
            true,
            true,
        );
        let overlapping = create_bounded_node(
            "overlapping",
            &create_rectangle(8.0, 8.0, 5.0, 5.0),
            true,
            true,
        );
        let outside = create_bounded_node(
            "outside",
            &create_rectangle(20.0, 20.0, 1.0, 1.0),
            true,
            true,
        );
        let candidates = vec![overlapping.clone(), outside, contained.clone()];

        assert!(same_nodes(
            &find_nodes_in_marquee_selection(&marquee, &candidates, None),
            &[overlapping.clone(), contained.clone()]
        ));
        assert!(same_nodes(
            &find_nodes_in_marquee_selection(
                &marquee,
                &candidates,
                Some(MarqueeSelectionMode::Contain)
            ),
            &[contained]
        ));
    }

    #[test]
    fn uses_local_bounds_without_filtering_disabled_or_hidden_candidates() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 0.0, 0.0);
        update_marquee_selection(&mut marquee, 10.0, 10.0);
        let disabled = create_bounded_node(
            "disabled",
            &create_rectangle(1.0, 1.0, 1.0, 1.0),
            false,
            true,
        );
        let hidden =
            create_bounded_node("hidden", &create_rectangle(2.0, 2.0, 1.0, 1.0), true, false);

        assert!(same_nodes(
            &find_nodes_in_marquee_selection(&marquee, &[disabled.clone(), hidden.clone()], None),
            &[disabled, hidden]
        ));
    }
}

mod get_marquee_rectangle {
    use super::*;

    #[test]
    fn exposes_the_same_rectangle_throughout_a_gesture() {
        let mut marquee = create_marquee_selection();
        let original = get_marquee_rectangle(&marquee) as *const _;

        begin_marquee_selection(&mut marquee, 4.0, 5.0);

        assert!(ptr::eq(original, get_marquee_rectangle(&marquee)));
    }
}

mod get_marquee_selection_mode_string {
    use super::*;

    #[test]
    fn returns_the_exact_source_strings() {
        assert_eq!(
            get_marquee_selection_mode_string(MarqueeSelectionMode::Contain),
            "contain"
        );
        assert_eq!(
            get_marquee_selection_mode_string(MarqueeSelectionMode::Intersect),
            "intersect"
        );
    }
}

mod initialize_marquee_selection {
    use super::*;

    #[test]
    fn restores_inactive_empty_gesture_state() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 1.0, 2.0);
        update_marquee_selection(&mut marquee, 3.0, 4.0);

        initialize_marquee_selection(&mut marquee);
        update_marquee_selection(&mut marquee, 10.0, 10.0);

        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(0.0, 0.0, 0.0, 0.0)
        );
    }
}

mod parse_marquee_selection_mode {
    use super::*;

    #[test]
    fn accepts_only_the_exact_source_strings() {
        assert_eq!(
            parse_marquee_selection_mode("contain"),
            Some(MarqueeSelectionMode::Contain)
        );
        assert_eq!(
            parse_marquee_selection_mode("intersect"),
            Some(MarqueeSelectionMode::Intersect)
        );
        assert_eq!(parse_marquee_selection_mode("Contain"), None);
    }
}

mod update_marquee_selection {
    use super::*;

    #[test]
    fn normalizes_a_reverse_drag_into_positive_rectangle_dimensions() {
        let mut marquee = create_marquee_selection();
        begin_marquee_selection(&mut marquee, 10.0, 20.0);

        update_marquee_selection(&mut marquee, 2.0, 5.0);

        assert_eq!(
            get_marquee_rectangle(&marquee),
            &create_rectangle(2.0, 5.0, 8.0, 15.0)
        );
    }
}
