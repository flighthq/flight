use std::ptr;

use flight_geometry::create_rectangle;
use flight_path::{PathCommand, PathWinding};
use flight_selection::contract::*;

use crate::support::*;

mod add_lasso_selection_point {
    use super::*;

    #[test]
    fn appends_line_points_only_during_an_active_gesture() {
        let mut lasso = create_lasso_selection();
        add_lasso_selection_point(&mut lasso, 99.0, 99.0);
        begin_lasso_selection(&mut lasso, 1.0, 2.0);
        add_lasso_selection_point(&mut lasso, 3.0, 4.0);
        end_lasso_selection(&mut lasso);
        add_lasso_selection_point(&mut lasso, 5.0, 6.0);

        assert_eq!(
            get_lasso_selection_path(&lasso).data,
            vec![1.0, 2.0, 3.0, 4.0]
        );
    }
}

mod begin_lasso_selection {
    use super::*;

    #[test]
    fn resets_the_reused_path_and_starts_it_with_a_move_command() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 1.0, 2.0);
        add_lasso_selection_point(&mut lasso, 3.0, 4.0);
        end_lasso_selection(&mut lasso);

        begin_lasso_selection(&mut lasso, 10.0, 11.0);

        assert_eq!(
            get_lasso_selection_path(&lasso).commands,
            vec![PathCommand::MoveTo as u8]
        );
        assert_eq!(get_lasso_selection_path(&lasso).data, vec![10.0, 11.0]);
    }
}

mod create_lasso_selection {
    use super::*;

    #[test]
    fn creates_an_empty_even_odd_path() {
        let lasso = create_lasso_selection();
        let path = get_lasso_selection_path(&lasso);

        assert!(path.commands.is_empty());
        assert!(path.data.is_empty());
        assert_eq!(path.winding, PathWinding::EvenOdd);
    }
}

mod end_lasso_selection {
    use super::*;

    #[test]
    fn closes_an_active_path_once_and_returns_the_live_path_object() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 1.0, 2.0);
        add_lasso_selection_point(&mut lasso, 3.0, 4.0);

        let returned = end_lasso_selection(&mut lasso) as *const _;
        end_lasso_selection(&mut lasso);

        assert!(ptr::eq(returned, get_lasso_selection_path(&lasso)));
        assert_eq!(
            get_lasso_selection_path(&lasso).commands,
            vec![
                PathCommand::MoveTo as u8,
                PathCommand::LineTo as u8,
                PathCommand::Close as u8,
            ]
        );
    }
}

mod find_nodes_in_lasso_selection {
    use super::*;

    #[test]
    fn includes_degenerate_boundary_edges_without_changing_even_odd_fill() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let boundary = create_bounded_node(
            "boundary",
            &create_rectangle(10.0, 0.0, 0.0, 0.0),
            true,
            true,
        );

        assert!(same_nodes(
            &find_nodes_in_lasso_selection(&lasso, &[boundary.clone()]),
            &[boundary]
        ));
    }

    #[test]
    fn selects_bounds_centers_inside_or_on_the_lasso_boundary_in_caller_order() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let inside =
            create_bounded_node("inside", &create_rectangle(4.0, 4.0, 2.0, 2.0), true, true);
        let boundary = create_bounded_node(
            "boundary",
            &create_rectangle(9.0, 4.0, 2.0, 2.0),
            true,
            true,
        );
        let outside = create_bounded_node(
            "outside",
            &create_rectangle(11.0, 11.0, 2.0, 2.0),
            true,
            true,
        );

        assert!(same_nodes(
            &find_nodes_in_lasso_selection(&lasso, &[outside, boundary.clone(), inside.clone()]),
            &[boundary, inside]
        ));
    }

    #[test]
    fn tests_the_bounds_center_rather_than_rectangle_overlap() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let overlaps_with_center_outside = create_bounded_node(
            "overlap",
            &create_rectangle(9.0, 9.0, 10.0, 10.0),
            true,
            true,
        );

        assert!(find_nodes_in_lasso_selection(&lasso, &[overlaps_with_center_outside]).is_empty());
    }

    #[test]
    fn returns_no_candidates_for_a_path_with_fewer_than_three_points() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        end_lasso_selection(&mut lasso);
        let candidate =
            create_bounded_node("node", &create_rectangle(0.0, 0.0, 1.0, 1.0), true, true);

        assert!(find_nodes_in_lasso_selection(&lasso, &[candidate]).is_empty());
    }
}

mod get_lasso_selection_path {
    use super::*;

    #[test]
    fn exposes_the_same_path_throughout_a_gesture() {
        let mut lasso = create_lasso_selection();
        let original = get_lasso_selection_path(&lasso) as *const _;

        begin_lasso_selection(&mut lasso, 1.0, 2.0);

        assert!(ptr::eq(original, get_lasso_selection_path(&lasso)));
    }
}

mod initialize_lasso_selection {
    use super::*;

    #[test]
    fn restores_an_empty_even_odd_path() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 1.0, 2.0);
        initialize_lasso_selection(&mut lasso);

        let path = get_lasso_selection_path(&lasso);
        assert!(path.commands.is_empty());
        assert!(path.data.is_empty());
        assert_eq!(path.winding, PathWinding::EvenOdd);
    }
}
