use flight_shape::contract::*;

use crate::support::*;

fn count_after(append: impl FnOnce(&flight_entity::Ref<Shape>)) -> usize {
    let shape = shape();
    append(&shape);
    return get_shape_command_count(&*shape.read().unwrap());
}

mod append_shape_arc {
    use super::*;

    #[test]
    fn appends_one_arc_command() {
        assert!(count_after(|shape| append_shape_arc(shape, 0.0, 0.0, 4.0, 0.0, 1.0, None)) >= 1);
    }
}

mod append_shape_begin_fill {
    use super::*;

    #[test]
    fn appends_one_fill_command() {
        assert!(count_after(|shape| append_shape_begin_fill(shape, 0xff0000ff, None)) >= 1);
    }
}

mod append_shape_begin_gradient_fill {
    use super::*;

    #[test]
    fn appends_one_gradient_command() {
        assert!(
            count_after(|shape| append_shape_begin_gradient_fill(
                shape,
                GradientType::Linear,
                &[0, 0xffffffff],
                &[1.0, 1.0],
                &[0.0, 1.0],
                None,
                None,
                None,
                None,
            )) >= 1
        );
    }
}

mod append_shape_begin_texture_fill {
    use super::*;

    #[test]
    fn appends_one_texture_command() {
        assert!(count_after(|shape| append_shape_begin_texture_fill(shape, &texture(), None)) >= 1);
    }
}

mod append_shape_circle {
    use super::*;

    #[test]
    fn appends_one_circle_command() {
        assert!(count_after(|shape| append_shape_circle(shape, 0.0, 0.0, 4.0)) >= 1);
    }
}

mod append_shape_cubic_curve_to {
    use super::*;

    #[test]
    fn appends_one_cubic_command() {
        assert!(
            count_after(|shape| append_shape_cubic_curve_to(shape, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0))
                >= 1
        );
    }
}

mod append_shape_draw_triangles {
    use super::*;

    #[test]
    fn appends_one_triangle_command() {
        assert!(
            count_after(|shape| append_shape_draw_triangles(
                shape,
                &[0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
                None,
                None,
                None
            )) >= 1
        );
    }
}

mod append_shape_ellipse {
    use super::*;

    #[test]
    fn appends_one_ellipse_command() {
        assert!(count_after(|shape| append_shape_ellipse(shape, 0.0, 0.0, 4.0, 2.0)) >= 1);
    }
}

mod append_shape_elliptical_arc_to {
    use super::*;

    #[test]
    fn appends_one_elliptical_arc_command() {
        assert!(
            count_after(|shape| append_shape_elliptical_arc_to(
                shape, 4.0, 2.0, 0.0, false, true, 8.0, 0.0
            )) >= 1
        );
    }
}

mod append_shape_end_fill {
    use super::*;

    #[test]
    fn appends_one_end_fill_command() {
        assert!(count_after(|shape| append_shape_end_fill(shape)) >= 1);
    }
}

mod append_shape_line_gradient_style {
    use super::*;

    #[test]
    fn appends_one_line_gradient_command() {
        assert!(
            count_after(|shape| append_shape_line_gradient_style(
                shape,
                GradientType::Linear,
                &[0, 0xffffffff],
                &[1.0, 1.0],
                &[0.0, 1.0],
                None,
                None,
                None,
                None,
            )) >= 1
        );
    }
}

mod append_shape_line_style {
    use super::*;

    #[test]
    fn appends_one_line_style_command() {
        assert!(
            count_after(|shape| append_shape_line_style(
                shape,
                Some(2.0),
                0xffffffff,
                None,
                None,
                None,
                None,
                None,
                None
            )) >= 1
        );
    }
}

mod append_shape_line_texture_style {
    use super::*;

    #[test]
    fn appends_one_line_texture_command() {
        assert!(count_after(|shape| append_shape_line_texture_style(shape, &texture(), None)) >= 1);
    }
}

mod append_shape_line_to {
    use super::*;

    #[test]
    fn appends_one_line_to_command() {
        assert!(count_after(|shape| append_shape_line_to(shape, 4.0, 2.0)) >= 1);
    }
}

mod append_shape_move_to {
    use super::*;

    #[test]
    fn appends_one_move_to_command() {
        assert!(count_after(|shape| append_shape_move_to(shape, 4.0, 2.0)) >= 1);
    }
}

mod append_shape_path {
    use super::*;

    #[test]
    fn appends_one_draw_path_command() {
        assert!(count_after(|shape| append_shape_path(shape, &[1], &[4.0, 2.0], None)) >= 1);
    }
}

mod append_shape_polygon {
    use super::*;

    #[test]
    fn appends_one_closed_polygon() {
        assert!(
            count_after(|shape| append_shape_polygon(shape, &[0.0, 0.0, 4.0, 0.0, 4.0, 4.0])) >= 1
        );
    }
}

mod append_shape_polyline {
    use super::*;

    #[test]
    fn appends_one_open_polyline() {
        assert!(
            count_after(|shape| append_shape_polyline(shape, &[0.0, 0.0, 4.0, 0.0, 4.0, 4.0])) >= 1
        );
    }
}

mod append_shape_quadratic_curve_to {
    use super::*;

    #[test]
    fn appends_one_quadratic_command() {
        assert!(
            count_after(|shape| append_shape_quadratic_curve_to(shape, 1.0, 2.0, 3.0, 4.0)) >= 1
        );
    }
}

mod append_shape_rectangle {
    use super::*;

    #[test]
    fn appends_one_rectangle_command() {
        assert!(count_after(|shape| append_shape_rectangle(shape, 0.0, 0.0, 4.0, 2.0)) >= 1);
    }
}

mod append_shape_rounded_rectangle {
    use super::*;

    #[test]
    fn appends_one_rounded_rectangle_command() {
        assert!(
            count_after(|shape| append_shape_rounded_rectangle(shape, 0.0, 0.0, 4.0, 2.0, 1.0))
                >= 1
        );
    }
}

mod append_shape_rounded_rectangle_with_corner_radii {
    use super::*;

    #[test]
    fn appends_one_corner_radius_command() {
        assert!(
            count_after(|shape| append_shape_rounded_rectangle_with_corner_radii(
                shape, 0.0, 0.0, 4.0, 2.0, 1.0, 2.0, 3.0, 4.0
            )) >= 1
        );
    }
}

mod append_shape_tangent_arc_to {
    use super::*;

    #[test]
    fn appends_one_tangent_arc_command() {
        assert!(
            count_after(|shape| append_shape_tangent_arc_to(shape, 4.0, 2.0, 8.0, 6.0, 2.0)) >= 1
        );
    }
}
