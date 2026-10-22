use flight_geometry::create_rectangle;
use flight_gizmo::*;

mod compute_gizmo_alignment_deltas {
    use super::*;

    #[test]
    fn aligns_every_selection_bound_to_the_combined_selection_edge() {
        let mut out = Vec::new();
        let bounds = [
            create_rectangle(10.0, 4.0, 10.0, 8.0),
            create_rectangle(-5.0, 20.0, 4.0, 6.0),
            create_rectangle(20.0, -2.0, -8.0, 10.0),
        ];

        compute_gizmo_alignment_deltas(&mut out, &bounds, GizmoAlignment::Left);

        assert_eq!(out, vec![-15.0, 0.0, 0.0, 0.0, -17.0, 0.0]);
    }

    #[test]
    fn aligns_every_selection_bound_using_each_remaining_alignment() {
        let bounds = [
            create_rectangle(-10.0, 10.0, 4.0, 20.0),
            create_rectangle(6.0, -20.0, 8.0, 10.0),
        ];
        let cases = [
            (GizmoAlignment::HorizontalCenter, vec![10.0, 0.0, -8.0, 0.0]),
            (GizmoAlignment::Right, vec![20.0, 0.0, 0.0, 0.0]),
            (GizmoAlignment::Top, vec![0.0, -30.0, 0.0, 0.0]),
            (GizmoAlignment::VerticalCenter, vec![0.0, -15.0, 0.0, 20.0]),
            (GizmoAlignment::Bottom, vec![0.0, 0.0, 0.0, 40.0]),
        ];

        for (alignment, expected) in cases {
            let mut out = Vec::new();
            compute_gizmo_alignment_deltas(&mut out, &bounds, alignment);
            assert_eq!(out, expected);
        }
    }

    #[test]
    fn clears_stale_output_for_an_empty_selection() {
        let mut out = vec![1.0, 2.0, 3.0, 4.0];

        compute_gizmo_alignment_deltas(&mut out, &[], GizmoAlignment::Bottom);

        assert!(out.is_empty());
    }
}

mod find_gizmo_smart_guides {
    use super::*;

    #[test]
    fn chooses_the_closest_edge_or_center_independently_on_each_axis() {
        let mut out = GizmoSmartGuideResult {
            delta_x: 99.0,
            delta_y: 99.0,
            guide_x: Some(99.0),
            guide_y: Some(99.0),
        };
        let moving = create_rectangle(10.0, 20.0, 10.0, 10.0);
        let candidates = [
            create_rectangle(23.0, 100.0, 10.0, 10.0),
            create_rectangle(100.0, 32.0, 10.0, 5.0),
        ];

        assert!(find_gizmo_smart_guides(&mut out, &moving, &candidates, 3.0));
        assert_eq!(
            out,
            GizmoSmartGuideResult {
                delta_x: 3.0,
                delta_y: 2.0,
                guide_x: Some(23.0),
                guide_y: Some(32.0),
            }
        );
    }

    #[test]
    fn resets_stale_output_when_no_guide_is_within_a_finite_non_negative_threshold() {
        let moving = create_rectangle(0.0, 0.0, 10.0, 10.0);
        let candidates = [create_rectangle(100.0, 100.0, 10.0, 10.0)];
        let mut out = GizmoSmartGuideResult {
            delta_x: 99.0,
            delta_y: 99.0,
            guide_x: Some(99.0),
            guide_y: Some(99.0),
        };

        assert!(!find_gizmo_smart_guides(
            &mut out,
            &moving,
            &candidates,
            2.0
        ));
        assert_eq!(
            out,
            GizmoSmartGuideResult {
                delta_x: 0.0,
                delta_y: 0.0,
                guide_x: None,
                guide_y: None,
            }
        );
        assert!(!find_gizmo_smart_guides(
            &mut out,
            &moving,
            &candidates,
            f32::INFINITY
        ));
    }

    #[test]
    fn uses_candidate_and_anchor_order_to_break_equal_distance_ties_deterministically() {
        let mut out = GizmoSmartGuideResult {
            delta_x: 0.0,
            delta_y: 0.0,
            guide_x: None,
            guide_y: None,
        };
        let moving = create_rectangle(-10.0, 20.0, -10.0, -10.0);
        let candidates = [
            create_rectangle(-7.0, 100.0, 4.0, 4.0),
            create_rectangle(-30.0, 100.0, 7.0, 4.0),
        ];

        assert!(find_gizmo_smart_guides(&mut out, &moving, &candidates, 3.0));
        assert_eq!(out.delta_x, 3.0);
        assert_eq!(out.delta_y, 0.0);
        assert_eq!(out.guide_x, Some(-7.0));
        assert_eq!(out.guide_y, None);
    }
}
