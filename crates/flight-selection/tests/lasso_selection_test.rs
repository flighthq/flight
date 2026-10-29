use flight_geometry::create_rectangle;
use flight_selection::contract::*;

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

        assert!(crate::has_only_move_command(get_lasso_selection_path(
            &lasso
        )));
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
        assert!(crate::has_even_odd_winding(path));
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

        assert!(crate::same_path(returned, get_lasso_selection_path(&lasso)));
        assert!(crate::has_move_line_close_commands(
            get_lasso_selection_path(&lasso)
        ));
    }
}

mod find_nodes_in_lasso_selection {
    use super::*;

    /// flight-compiler: rust-only — JavaScript arrays expose no allocation capacity.
    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let inside =
            crate::create_bounded_node("inside", &create_rectangle(4.0, 4.0, 2.0, 2.0), true, true);
        let mut out = Vec::with_capacity(8);
        out.push(crate::create_test_node("stale"));

        find_nodes_in_lasso_selection(&mut out, &lasso, &[inside.clone()]);

        assert!(crate::same_nodes(&out, &[inside]));
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn includes_degenerate_boundary_edges_without_changing_even_odd_fill() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 10.0);
        add_lasso_selection_point(&mut lasso, 0.0, 10.0);
        end_lasso_selection(&mut lasso);
        let boundary = crate::create_bounded_node(
            "boundary",
            &create_rectangle(10.0, 0.0, 0.0, 0.0),
            true,
            true,
        );

        assert!(crate::same_nodes(
            &crate::lasso_matches(&lasso, &[boundary.clone()]),
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
            crate::create_bounded_node("inside", &create_rectangle(4.0, 4.0, 2.0, 2.0), true, true);
        let boundary = crate::create_bounded_node(
            "boundary",
            &create_rectangle(9.0, 4.0, 2.0, 2.0),
            true,
            true,
        );
        let outside = crate::create_bounded_node(
            "outside",
            &create_rectangle(11.0, 11.0, 2.0, 2.0),
            true,
            true,
        );

        assert!(crate::same_nodes(
            &crate::lasso_matches(&lasso, &[outside, boundary.clone(), inside.clone()]),
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
        let overlaps_with_center_outside = crate::create_bounded_node(
            "overlap",
            &create_rectangle(9.0, 9.0, 10.0, 10.0),
            true,
            true,
        );

        assert!(crate::lasso_matches(&lasso, &[overlaps_with_center_outside]).is_empty());
    }

    #[test]
    fn returns_no_candidates_for_a_path_with_fewer_than_three_points() {
        let mut lasso = create_lasso_selection();
        begin_lasso_selection(&mut lasso, 0.0, 0.0);
        add_lasso_selection_point(&mut lasso, 10.0, 0.0);
        end_lasso_selection(&mut lasso);
        let candidate =
            crate::create_bounded_node("node", &create_rectangle(0.0, 0.0, 1.0, 1.0), true, true);

        assert!(crate::lasso_matches(&lasso, &[candidate]).is_empty());
    }
}

mod get_lasso_selection_path {
    use super::*;

    #[test]
    fn exposes_the_same_path_throughout_a_gesture() {
        let mut lasso = create_lasso_selection();
        let original = get_lasso_selection_path(&lasso) as *const _;

        begin_lasso_selection(&mut lasso, 1.0, 2.0);

        assert!(crate::same_path(original, get_lasso_selection_path(&lasso)));
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
        assert!(crate::has_even_odd_winding(path));
    }
}
