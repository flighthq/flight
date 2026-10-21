use flight_geometry::create_rectangle;
use flight_shape::contract::*;

use crate::support::*;

mod compute_shape_bounds_rectangle {
    use super::*;

    #[test]
    fn reports_complete_with_zero_bounds_for_an_empty_shape() {
        let shape = create_shape(None);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(compute_shape_bounds_rectangle(
            &mut out,
            &*shape.read().unwrap(),
            None
        ));
        assert_eq!((out.width, out.height), (0.0, 0.0));
    }
}

mod default_shape_bounds_cubic_curve_to {
    use super::*;

    #[test]
    fn forwards_a_cubic_curve() {
        let mut context = recording();
        default_shape_bounds_cubic_curve_to(
            &mut context,
            &args(vec![
                number(1.0),
                number(2.0),
                number(3.0),
                number(4.0),
                number(5.0),
                number(6.0),
            ]),
        );
        assert_eq!(context.curves, 1);
    }
}

mod default_shape_bounds_draw_circle {
    use super::*;

    #[test]
    fn forwards_a_circle() {
        let mut context = recording();
        default_shape_bounds_draw_circle(
            &mut context,
            &args(vec![number(1.0), number(2.0), number(3.0)]),
        );
        assert_eq!(context.circles, 1);
    }
}

mod default_shape_bounds_draw_ellipse {
    use super::*;

    #[test]
    fn forwards_an_ellipse() {
        let mut context = recording();
        default_shape_bounds_draw_ellipse(
            &mut context,
            &args(vec![number(1.0), number(2.0), number(3.0), number(4.0)]),
        );
        assert_eq!(context.ellipses, 1);
    }
}

mod default_shape_bounds_draw_path {
    use super::*;

    #[test]
    fn replays_the_path_verbs() {
        let mut context = recording();
        let tokens = vec![numbers(&[1.0, 2.0]), numbers(&[0.0, 0.0, 4.0, 0.0])];
        default_shape_bounds_draw_path(&mut context, &args(tokens));
        assert_eq!(context.moves, 1);
        assert_eq!(context.lines, 1);
    }
}

mod default_shape_bounds_draw_rectangle {
    use super::*;

    #[test]
    fn forwards_a_rectangle() {
        let mut context = recording();
        default_shape_bounds_draw_rectangle(
            &mut context,
            &args(vec![number(1.0), number(2.0), number(3.0), number(4.0)]),
        );
        assert_eq!(context.rectangles, 1);
    }
}

mod default_shape_bounds_draw_rounded_rectangle {
    use super::*;

    #[test]
    fn forwards_a_rounded_rectangle() {
        let mut context = recording();
        default_shape_bounds_draw_rounded_rectangle(
            &mut context,
            &args(vec![
                number(1.0),
                number(2.0),
                number(3.0),
                number(4.0),
                number(1.0),
            ]),
        );
        assert_eq!(context.rectangles, 1);
    }
}

mod default_shape_bounds_expand_point_pairs {
    use super::*;

    #[test]
    fn expands_each_point_pair() {
        let mut context = recording();
        default_shape_bounds_expand_point_pairs(
            &mut context,
            &args(vec![numbers(&[0.0, 0.0, 2.0, 3.0])]),
        );
        assert_eq!(context.expanded, 2);
    }
}

mod default_shape_bounds_flush {
    use super::*;

    #[test]
    fn flushes_the_active_subpath() {
        let mut context = recording();
        default_shape_bounds_flush(&mut context);
        assert_eq!(context.flushed, 1);
    }
}

mod default_shape_bounds_line_style {
    use super::*;

    #[test]
    fn applies_the_authored_stroke_style() {
        let mut context = recording();
        let tokens = vec![
            number(2.0),
            number(0xffffffffu32 as f64),
            number(1.0),
            ShapeCommandToken::Boolean(false),
            string("normal"),
            string("round"),
            string("bevel"),
            number(4.0),
        ];
        default_shape_bounds_line_style(&mut context, &args(tokens));
        assert_eq!(context.styles, 1);
    }
}

mod default_shape_bounds_line_to {
    use super::*;

    #[test]
    fn forwards_a_line_to() {
        let mut context = recording();
        default_shape_bounds_line_to(&mut context, &args(vec![number(2.0), number(3.0)]));
        assert_eq!(context.lines, 1);
    }
}

mod default_shape_bounds_move_to {
    use super::*;

    #[test]
    fn forwards_a_move_to() {
        let mut context = recording();
        default_shape_bounds_move_to(&mut context, &args(vec![number(2.0), number(3.0)]));
        assert_eq!(context.moves, 1);
    }
}

mod default_shape_bounds_quadratic_curve_to {
    use super::*;

    #[test]
    fn forwards_a_quadratic_curve() {
        let mut context = recording();
        default_shape_bounds_quadratic_curve_to(
            &mut context,
            &args(vec![number(1.0), number(2.0), number(3.0), number(4.0)]),
        );
        assert_eq!(context.curves, 1);
    }
}

mod explain_shape_bounds {
    use super::*;

    #[test]
    fn reports_an_empty_shape_as_complete() {
        let shape = create_shape(None);
        let explanation = explain_shape_bounds(&*shape.read().unwrap(), None);
        assert!(explanation.complete);
        assert!(explanation.missing_command_keys.is_empty());
    }
}

mod normalize_shape_stroke_miter_limit {
    use super::*;

    #[test]
    fn keeps_a_positive_finite_limit_and_defaults_otherwise() {
        assert_eq!(normalize_shape_stroke_miter_limit(4.0), 4.0);
        assert_eq!(normalize_shape_stroke_miter_limit(0.0), 10.0);
        assert_eq!(normalize_shape_stroke_miter_limit(f64::NAN), 10.0);
    }
}

mod normalize_shape_stroke_width {
    use super::*;

    #[test]
    fn keeps_zero_and_rejects_nonfinite_widths() {
        assert_eq!(normalize_shape_stroke_width(0.0), 0.0);
        assert_eq!(normalize_shape_stroke_width(f64::INFINITY), 1.0);
        assert_eq!(normalize_shape_stroke_width(2.0), 2.0);
    }
}
