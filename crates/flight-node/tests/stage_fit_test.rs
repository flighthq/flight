use std::sync::Arc;

use flight_geometry::{Matrix, Rectangle, create_matrix};
use flight_node::contract::*;

use crate::support::create_test_node_2d;

fn bounds_node(x: f32, y: f32, width: f32, height: f32) -> NodeRef {
    let node = create_test_node_2d("Test");
    let callback: NodeLocalBoundsComputer =
        Arc::new(move |out: &mut Rectangle, _source: &dyn Node| {
            out.x = x;
            out.y = y;
            out.width = width;
            out.height = height;
        });
    {
        let mut guard = node.write().unwrap();
        guard
            .as_bounds_node_mut()
            .expect("test node has bounds")
            .bounds_runtime_mut()
            .compute_local_bounds_rectangle = callback;
    }
    return node;
}

fn fit(
    align: ViewportAlign,
    root: Option<NodeRef>,
    scale_mode: ViewportScaleMode,
) -> Scene2DFitContext {
    return Scene2DFitContext {
        align,
        root,
        scale_mode,
    };
}

mod compute_scene2d_fit_align_x {
    use super::*;

    #[test]
    fn returns_zero_for_left_anchored_alignments() {
        assert_eq!(
            compute_scene2d_fit_align_x(400.0, 800.0, ViewportAlign::Left),
            0.0
        );
        assert_eq!(
            compute_scene2d_fit_align_x(400.0, 800.0, ViewportAlign::TopLeft),
            0.0
        );
        assert_eq!(
            compute_scene2d_fit_align_x(400.0, 800.0, ViewportAlign::BottomLeft),
            0.0
        );
    }

    #[test]
    fn returns_view_width_minus_scaled_width_for_right_anchored_alignments() {
        assert_eq!(
            compute_scene2d_fit_align_x(400.0, 800.0, ViewportAlign::Right),
            400.0
        );
        assert_eq!(
            compute_scene2d_fit_align_x(400.0, 800.0, ViewportAlign::TopRight),
            400.0
        );
        assert_eq!(
            compute_scene2d_fit_align_x(400.0, 800.0, ViewportAlign::BottomRight),
            400.0
        );
    }

    #[test]
    fn returns_a_centered_offset_for_top_and_bottom_alignments() {
        assert_eq!(
            compute_scene2d_fit_align_x(400.0, 800.0, ViewportAlign::Top),
            200.0
        );
        assert_eq!(
            compute_scene2d_fit_align_x(400.0, 800.0, ViewportAlign::Bottom),
            200.0
        );
    }
}

mod compute_scene2d_fit_align_y {
    use super::*;

    #[test]
    fn returns_zero_for_top_anchored_alignments() {
        assert_eq!(
            compute_scene2d_fit_align_y(300.0, 600.0, ViewportAlign::Top),
            0.0
        );
        assert_eq!(
            compute_scene2d_fit_align_y(300.0, 600.0, ViewportAlign::TopLeft),
            0.0
        );
        assert_eq!(
            compute_scene2d_fit_align_y(300.0, 600.0, ViewportAlign::TopRight),
            0.0
        );
    }

    #[test]
    fn returns_view_height_minus_scaled_height_for_bottom_anchored_alignments() {
        assert_eq!(
            compute_scene2d_fit_align_y(300.0, 600.0, ViewportAlign::Bottom),
            300.0
        );
        assert_eq!(
            compute_scene2d_fit_align_y(300.0, 600.0, ViewportAlign::BottomLeft),
            300.0
        );
        assert_eq!(
            compute_scene2d_fit_align_y(300.0, 600.0, ViewportAlign::BottomRight),
            300.0
        );
    }

    #[test]
    fn returns_a_centered_offset_for_left_and_right_alignments() {
        assert_eq!(
            compute_scene2d_fit_align_y(300.0, 600.0, ViewportAlign::Left),
            150.0
        );
        assert_eq!(
            compute_scene2d_fit_align_y(300.0, 600.0, ViewportAlign::Right),
            150.0
        );
    }
}

mod compute_scene2d_fit_fill_scale {
    use super::*;

    #[test]
    fn returns_the_larger_axis_ratio() {
        assert_eq!(
            compute_scene2d_fit_fill_scale(400.0, 300.0, 800.0, 600.0),
            2.0
        );
        assert_eq!(
            compute_scene2d_fit_fill_scale(400.0, 300.0, 400.0, 600.0),
            2.0
        );
    }

    #[test]
    fn uses_the_larger_ratio_when_the_width_ratio_wins() {
        assert_eq!(
            compute_scene2d_fit_fill_scale(400.0, 300.0, 800.0, 400.0),
            2.0
        );
    }
}

mod compute_scene2d_fit_scale {
    use super::*;

    #[test]
    fn returns_the_smaller_axis_ratio() {
        assert_eq!(compute_scene2d_fit_scale(400.0, 300.0, 800.0, 600.0), 2.0);
        assert_eq!(compute_scene2d_fit_scale(400.0, 300.0, 400.0, 600.0), 1.0);
        assert_eq!(
            compute_scene2d_fit_scale(400.0, 300.0, 800.0, 400.0),
            400.0 / 300.0
        );
    }
}

mod compute_scene2d_fit_transform {
    use super::*;

    #[test]
    fn sets_identity_when_root_is_null() {
        let mut matrix: Matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(ViewportAlign::TopLeft, None, ViewportScaleMode::NoScale),
            800.0,
            600.0,
        );
        assert_eq!(
            (matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty),
            (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        );
    }

    #[test]
    fn sets_identity_when_the_root_computes_no_bounds() {
        let root = create_test_node_2d("Test");
        let mut matrix: Matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::NoScale,
            ),
            800.0,
            600.0,
        );
        assert_eq!(
            (matrix.a, matrix.d, matrix.tx, matrix.ty),
            (1.0, 1.0, 0.0, 0.0)
        );
    }

    #[test]
    fn sets_identity_when_the_root_computes_zero_size() {
        let root = bounds_node(0.0, 0.0, 0.0, 0.0);
        let mut matrix: Matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::NoScale,
            ),
            800.0,
            600.0,
        );
        assert_eq!((matrix.a, matrix.d), (1.0, 1.0));
    }

    #[test]
    fn sets_identity_when_only_the_content_width_or_height_is_zero() {
        let wide_only = bounds_node(0.0, 0.0, 0.0, 50.0);
        let mut width_matrix: Matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        compute_scene2d_fit_transform(
            &mut width_matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(wide_only),
                ViewportScaleMode::ExactFit,
            ),
            800.0,
            600.0,
        );
        assert_eq!(
            (
                width_matrix.a,
                width_matrix.b,
                width_matrix.c,
                width_matrix.d,
                width_matrix.tx,
                width_matrix.ty
            ),
            (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        );
        let tall_only = bounds_node(0.0, 0.0, 100.0, 0.0);
        let mut height_matrix: Matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        compute_scene2d_fit_transform(
            &mut height_matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(tall_only),
                ViewportScaleMode::ExactFit,
            ),
            800.0,
            600.0,
        );
        assert_eq!(
            (
                height_matrix.a,
                height_matrix.b,
                height_matrix.c,
                height_matrix.d,
                height_matrix.tx,
                height_matrix.ty
            ),
            (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
        );
    }

    #[test]
    fn exactfit_scales_to_fill_the_viewport_exactly() {
        let root = bounds_node(0.0, 0.0, 400.0, 300.0);
        let mut matrix: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::ExactFit,
            ),
            800.0,
            600.0,
        );
        assert_eq!(
            (matrix.a, matrix.d, matrix.tx, matrix.ty),
            (2.0, 2.0, 0.0, 0.0)
        );
    }

    #[test]
    fn sets_b_and_c_to_zero() {
        let root = bounds_node(0.0, 0.0, 400.0, 300.0);
        let mut matrix: Matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::ShowAll,
            ),
            800.0,
            600.0,
        );
        assert_eq!((matrix.b, matrix.c), (0.0, 0.0));
    }

    #[test]
    fn uses_scaled_size_before_subtracting_an_origin_on_a_centered_axis() {
        let horizontal = bounds_node(10.0, -20.0, 100.0, 50.0);
        let mut top_matrix: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene2d_fit_transform(
            &mut top_matrix,
            &fit(
                ViewportAlign::Top,
                Some(horizontal),
                ViewportScaleMode::ExactFit,
            ),
            200.0,
            100.0,
        );
        assert_eq!((top_matrix.tx, top_matrix.ty), (-20.0, 40.0));
        let vertical = bounds_node(10.0, -20.0, 100.0, 50.0);
        let mut left_matrix: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene2d_fit_transform(
            &mut left_matrix,
            &fit(
                ViewportAlign::Left,
                Some(vertical),
                ViewportScaleMode::ExactFit,
            ),
            200.0,
            100.0,
        );
        assert_eq!((left_matrix.tx, left_matrix.ty), (-20.0, 40.0));
    }

    #[test]
    fn noscale_with_topleft_is_identity_scale_at_origin() {
        let root = bounds_node(0.0, 0.0, 400.0, 300.0);
        let mut matrix: Matrix = create_matrix(2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::NoScale,
            ),
            800.0,
            600.0,
        );
        assert_eq!(
            (matrix.a, matrix.d, matrix.tx, matrix.ty),
            (1.0, 1.0, 0.0, 0.0)
        );
    }

    #[test]
    fn noscale_with_top_alignment_centers_horizontally() {
        let root = bounds_node(0.0, 0.0, 400.0, 300.0);
        let mut matrix: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(ViewportAlign::Top, Some(root), ViewportScaleMode::NoScale),
            800.0,
            600.0,
        );
        assert_eq!(matrix.tx, 200.0);
        assert_eq!(matrix.ty, 0.0);
    }

    #[test]
    fn exactfit_uses_independent_axis_scales() {
        let root = bounds_node(0.0, 0.0, 400.0, 300.0);
        let mut matrix: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::ExactFit,
            ),
            800.0,
            450.0,
        );
        assert_eq!(matrix.a, 2.0);
        assert_eq!(matrix.d, 1.5);
    }

    #[test]
    fn showall_uses_the_uniform_minimum_scale() {
        let root = bounds_node(0.0, 0.0, 400.0, 300.0);
        let mut matrix: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::ShowAll,
            ),
            800.0,
            400.0,
        );
        assert_eq!(matrix.a, 400.0 / 300.0);
        assert_eq!(matrix.d, 400.0 / 300.0);
    }

    #[test]
    fn noborder_uses_the_uniform_maximum_scale() {
        let root = bounds_node(0.0, 0.0, 400.0, 300.0);
        let mut matrix: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::NoBorder,
            ),
            800.0,
            400.0,
        );
        assert_eq!(matrix.a, 2.0);
        assert_eq!(matrix.d, 2.0);
    }

    #[test]
    fn maps_a_nonzero_content_origin_into_the_selected_alignment() {
        let root = bounds_node(10.0, -20.0, 100.0, 50.0);
        let mut matrix: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene2d_fit_transform(
            &mut matrix,
            &fit(
                ViewportAlign::TopLeft,
                Some(root),
                ViewportScaleMode::ExactFit,
            ),
            200.0,
            100.0,
        );
        assert_eq!(matrix.a, 2.0);
        assert_eq!(matrix.d, 2.0);
        assert_eq!(matrix.tx, -20.0);
        assert_eq!(matrix.ty, 40.0);
    }
}
