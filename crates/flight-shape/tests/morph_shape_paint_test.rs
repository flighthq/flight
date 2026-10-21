use flight_shape::contract::*;

use crate::support::*;

fn color_endpoint(color: u32) -> MorphShapeColorEndpoint {
    return MorphShapeColorEndpoint {
        alpha: Some(1.0),
        color,
    };
}

fn gradient_endpoint(colors: Vec<u32>) -> MorphShapeGradientEndpoint {
    let count = colors.len();
    return MorphShapeGradientEndpoint {
        alphas: vec![1.0; count],
        colors,
        focal_point_ratio: None,
        matrix: None,
        ratios: vec![0.0; count],
    };
}

fn line_endpoint(color: u32) -> MorphShapeLineEndpoint {
    return MorphShapeLineEndpoint {
        alpha: Some(1.0),
        color,
        thickness: 2.0,
    };
}

mod append_morph_shape_begin_fill {
    use super::*;

    #[test]
    fn appends_a_color_binding() {
        let shape = morph();
        append_morph_shape_begin_fill(
            &shape,
            &color_endpoint(0xff0000ff),
            &color_endpoint(0x00ff00ff),
        );
        assert_eq!(get_shape_command_count(&*shape.read().unwrap()), 1);
    }
}

mod append_morph_shape_begin_gradient_fill {
    use super::*;

    #[test]
    fn rejects_mismatched_stop_counts() {
        let shape = morph();
        let start = gradient_endpoint(vec![0]);
        let end = gradient_endpoint(vec![0, 1]);
        assert!(!append_morph_shape_begin_gradient_fill(
            &shape,
            GradientType::Linear,
            &start,
            &end,
            None,
            None
        ));
    }

    #[test]
    fn appends_matching_endpoints() {
        let shape = morph();
        let start = gradient_endpoint(vec![0]);
        let end = gradient_endpoint(vec![0xffffffff]);
        assert!(append_morph_shape_begin_gradient_fill(
            &shape,
            GradientType::Linear,
            &start,
            &end,
            None,
            None
        ));
        assert_eq!(get_shape_command_count(&*shape.read().unwrap()), 1);
    }
}

mod append_morph_shape_begin_texture_fill {
    use super::*;

    #[test]
    fn appends_a_texture_binding() {
        let shape = morph();
        append_morph_shape_begin_texture_fill(&shape, &texture(), Some(&identity()), None);
        assert_eq!(get_shape_command_count(&*shape.read().unwrap()), 1);
    }
}

mod append_morph_shape_line_gradient_style {
    use super::*;

    #[test]
    fn appends_matching_line_endpoints() {
        let shape = morph();
        let start = gradient_endpoint(vec![0]);
        let end = gradient_endpoint(vec![0xffffffff]);
        assert!(append_morph_shape_line_gradient_style(
            &shape,
            GradientType::Linear,
            &start,
            &end,
            None,
            None
        ));
        assert_eq!(get_shape_command_count(&*shape.read().unwrap()), 1);
    }
}

mod append_morph_shape_line_style {
    use super::*;

    #[test]
    fn appends_a_color_line_binding() {
        let shape = morph();
        append_morph_shape_line_style(
            &shape,
            &line_endpoint(0xff),
            &line_endpoint(0xffff),
            None,
            None,
            None,
            None,
            None,
        );
        assert_eq!(get_shape_command_count(&*shape.read().unwrap()), 1);
    }
}

mod append_morph_shape_line_texture_style {
    use super::*;

    #[test]
    fn appends_a_texture_line_binding() {
        let shape = morph();
        append_morph_shape_line_texture_style(&shape, &texture(), Some(&identity()), None);
        assert_eq!(get_shape_command_count(&*shape.read().unwrap()), 1);
    }
}

mod sample_morph_shape_paint_bindings {
    use super::*;

    #[test]
    fn samples_the_retained_bindings_at_a_progress() {
        let shape = morph();
        let start = gradient_endpoint(vec![0]);
        let end = gradient_endpoint(vec![0xffffffff]);
        append_morph_shape_begin_gradient_fill(
            &shape,
            GradientType::Linear,
            &start,
            &end,
            None,
            None,
        );
        let mut guard = shape.write().unwrap();
        assert_eq!(guard.data.paint_bindings.len(), 1);
        sample_morph_shape_paint_bindings(&mut guard.data, 0.5);
        assert!(!guard.data.commands.is_empty());
    }
}
