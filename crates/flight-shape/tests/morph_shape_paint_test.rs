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

mod paint_source_parity {
    use super::*;
    use flight_geometry::Matrix;
    use flight_node::contract::get_node_local_content_revision;

    fn color(alpha: f64, color: u32) -> MorphShapeColorEndpoint {
        return MorphShapeColorEndpoint {
            alpha: Some(alpha as f32),
            color,
        };
    }

    fn gradient(colors: &[u32], alphas: &[f64], ratios: &[f64]) -> MorphShapeGradientEndpoint {
        return MorphShapeGradientEndpoint {
            alphas: alphas.to_vec(),
            colors: colors.to_vec(),
            focal_point_ratio: None,
            matrix: None,
            ratios: ratios.to_vec(),
        };
    }

    fn commands(shape: &flight_entity::Ref<MorphShape>) -> Vec<ShapeCommandToken> {
        return shape.read().unwrap().data.commands.clone();
    }

    fn token_matrix(token: &ShapeCommandToken) -> Option<Matrix> {
        return match token {
            ShapeCommandToken::Matrix(matrix) => Some(matrix.clone()),
            _ => None,
        };
    }

    fn token_numbers(token: &ShapeCommandToken) -> Option<Vec<f64>> {
        return match token {
            ShapeCommandToken::Numbers(numbers) => Some(numbers.values.clone()),
            _ => None,
        };
    }

    #[test]
    fn begin_fill_retains_one_command_while_sampling_packed_rgb_and_alpha_at_current_progress() {
        let shape = test_morph_shape_with_progress(0.0, 0.5);
        append_morph_shape_begin_fill(&shape, &color(0.25, 0xff0000ff), &color(0.75, 0x0000ffff));
        assert_eq!(
            commands(&shape)
                .iter()
                .map(|token| format!("{:?}", token))
                .collect::<Vec<String>>(),
            vec![
                format!("{:?}", string("beginFill")),
                format!("{:?}", number(2.0)),
                format!("{:?}", number(0x800080ffu32 as f64)),
                format!("{:?}", number(0.5)),
            ]
        );
        assert_eq!(shape.read().unwrap().data.paint_bindings.len(), 1);
        set_morph_shape_progress(&shape, 1.0);
        let updated = commands(&shape);
        assert!(
            matches!(&updated[2], ShapeCommandToken::Number(value) if *value == 0x0000ffffu32 as f64)
        );
        assert!(matches!(&updated[3], ShapeCommandToken::Number(value) if *value == 0.75));
    }

    #[test]
    fn gradient_fill_samples_stops_matrices_and_focal_ratio_into_stable_retained_values() {
        let shape = test_morph_shape_with_progress(0.0, 0.0);
        let mut start = gradient(&[0x000000ff, 0xff0000ff], &[0.25, 0.5], &[0.0, 100.0]);
        start.focal_point_ratio = Some(-0.5);
        start.matrix = Some(matrix(1.0, 2.0, 3.0, 4.0, 5.0, 6.0));
        let mut end = gradient(&[0xffffffff, 0x0000ffff], &[0.75, 1.0], &[100.0, 200.0]);
        end.focal_point_ratio = Some(0.5);
        end.matrix = Some(matrix(3.0, 4.0, 5.0, 6.0, 7.0, 8.0));
        assert!(append_morph_shape_begin_gradient_fill(
            &shape,
            GradientType::Radial,
            &start,
            &end,
            None,
            None
        ));
        set_morph_shape_progress(&shape, 0.5);
        let updated = commands(&shape);
        assert_eq!(
            token_numbers(&updated[3]),
            Some(vec![0x808080ffu32 as f64, 0x800080ffu32 as f64])
        );
        assert_eq!(token_numbers(&updated[4]), Some(vec![0.5, 0.75]));
        assert_eq!(token_numbers(&updated[5]), Some(vec![50.0, 150.0]));
        let sampled = token_matrix(&updated[6]).expect("matrix");
        assert_eq!(
            (
                sampled.a, sampled.b, sampled.c, sampled.d, sampled.tx, sampled.ty
            ),
            (2.0, 3.0, 4.0, 5.0, 6.0, 7.0)
        );
        assert!(matches!(&updated[9], ShapeCommandToken::Number(value) if *value == 0.0));
    }

    #[test]
    fn gradient_rejects_incompatible_stop_topology_without_mutating_the_shape() {
        let shape = test_morph_shape_with_progress(0.0, 0.0);
        let revision = get_node_local_content_revision(&*shape.read().unwrap());
        assert!(!append_morph_shape_begin_gradient_fill(
            &shape,
            GradientType::Linear,
            &gradient(&[0x000000ff], &[1.0], &[0.0]),
            &gradient(&[0x000000ff, 0xffffffff], &[1.0, 1.0], &[0.0, 255.0]),
            None,
            None
        ));
        assert!(commands(&shape).is_empty());
        assert!(shape.read().unwrap().data.paint_bindings.is_empty());
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            revision
        );
    }

    #[test]
    fn gradient_treats_a_missing_endpoint_matrix_as_identity_while_retaining_one_live_matrix() {
        let shape = test_morph_shape_with_progress(0.0, 0.0);
        let mut end = gradient(&[0xffffffff], &[1.0], &[255.0]);
        end.matrix = Some(matrix(3.0, 0.0, 0.0, 5.0, 20.0, 40.0));
        assert!(append_morph_shape_begin_gradient_fill(
            &shape,
            GradientType::Linear,
            &gradient(&[0x000000ff], &[1.0], &[0.0]),
            &end,
            None,
            None
        ));
        set_morph_shape_progress(&shape, 0.5);
        let sampled = token_matrix(&commands(&shape)[6]).expect("matrix");
        assert_eq!(
            (
                sampled.a, sampled.b, sampled.c, sampled.d, sampled.tx, sampled.ty
            ),
            (2.0, 0.0, 0.0, 3.0, 10.0, 20.0)
        );
    }

    #[test]
    fn texture_fill_preserves_an_ordinary_null_matrix_when_no_placement_morph_is_needed() {
        let shape = test_morph_shape_with_progress(0.0, 0.0);
        append_morph_shape_begin_texture_fill(&shape, &texture(), None, None);
        let updated = commands(&shape);
        assert_eq!(
            format!("{:?}", updated[0]),
            format!("{:?}", string("beginTextureFill"))
        );
        assert!(matches!(updated[3], ShapeCommandToken::Null));
        assert!(shape.read().unwrap().data.paint_bindings.is_empty());
    }

    #[test]
    fn texture_fill_morphs_the_placement_matrix_while_retaining_texture_identity() {
        let shape = test_morph_shape_with_progress(0.0, 0.0);
        let texture = texture();
        append_morph_shape_begin_texture_fill(
            &shape,
            &texture,
            None,
            Some(&matrix(2.0, 0.0, 0.0, 4.0, 10.0, 20.0)),
        );
        set_morph_shape_progress(&shape, 0.5);
        let updated = commands(&shape);
        assert!(std::sync::Arc::ptr_eq(
            token_texture(&updated[2]).expect("texture"),
            &texture
        ));
        let sampled = token_matrix(&updated[3]).expect("matrix");
        assert_eq!(
            (
                sampled.a, sampled.b, sampled.c, sampled.d, sampled.tx, sampled.ty
            ),
            (1.5, 0.0, 0.0, 2.5, 5.0, 10.0)
        );
    }

    #[test]
    fn line_gradient_style_uses_the_same_stable_gradient_sampler() {
        let shape = test_morph_shape_with_progress(0.0, 0.0);
        assert!(append_morph_shape_line_gradient_style(
            &shape,
            GradientType::Linear,
            &gradient(&[0xff0000ff], &[1.0], &[0.0]),
            &gradient(&[0x0000ffff], &[0.5], &[255.0]),
            None,
            None
        ));
        set_morph_shape_progress(&shape, 1.0);
        let updated = commands(&shape);
        assert_eq!(
            format!("{:?}", updated[0]),
            format!("{:?}", string("lineGradientStyle"))
        );
        assert_eq!(token_numbers(&updated[3]), Some(vec![0x0000ffffu32 as f64]));
        assert_eq!(token_numbers(&updated[4]), Some(vec![0.5]));
        assert_eq!(token_numbers(&updated[5]), Some(vec![255.0]));
    }

    #[test]
    fn line_style_samples_stroke_width_and_color_while_retaining_structural_options() {
        let shape = test_morph_shape_with_progress(0.0, 0.5);
        append_morph_shape_line_style(
            &shape,
            &MorphShapeLineEndpoint {
                alpha: Some(0.25),
                color: 0xff0000ff,
                thickness: 2.0,
            },
            &MorphShapeLineEndpoint {
                alpha: Some(0.75),
                color: 0x0000ffff,
                thickness: 10.0,
            },
            Some(true),
            Some(LineScaleMode::Horizontal),
            Some(CapsStyle::Round),
            Some(JointStyle::Bevel),
            Some(5.0),
        );
        assert_eq!(
            commands(&shape)
                .iter()
                .map(|token| format!("{:?}", token))
                .collect::<Vec<String>>(),
            vec![
                format!("{:?}", string("lineStyle")),
                format!("{:?}", number(8.0)),
                format!("{:?}", number(6.0)),
                format!("{:?}", number(0x800080ffu32 as f64)),
                format!("{:?}", number(0.5)),
                format!("{:?}", ShapeCommandToken::Boolean(true)),
                format!("{:?}", string("horizontal")),
                format!("{:?}", string("round")),
                format!("{:?}", string("bevel")),
                format!("{:?}", number(5.0)),
            ]
        );
    }

    #[test]
    fn line_texture_style_uses_the_same_stable_matrix_sampler() {
        let shape = test_morph_shape_with_progress(0.0, 0.0);
        let texture = texture();
        append_morph_shape_line_texture_style(
            &shape,
            &texture,
            Some(&matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)),
            Some(&matrix(2.0, 0.0, 0.0, 2.0, 10.0, 20.0)),
        );
        set_morph_shape_progress(&shape, 1.0);
        let updated = commands(&shape);
        assert_eq!(
            format!("{:?}", updated[0]),
            format!("{:?}", string("lineTextureStyle"))
        );
        let sampled = token_matrix(&updated[3]).expect("matrix");
        assert_eq!(
            (sampled.a, sampled.d, sampled.tx, sampled.ty),
            (2.0, 2.0, 10.0, 20.0)
        );
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
