use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::contract::{Path, PathWinding, append_path_rectangle, create_path};
use flight_scene2d_formats::contract::*;
use flight_shape::contract::{Shape, ShapeCommandToken, create_shape};

mod append_lottie_dashed_shape_paths {
    use super::*;

    #[test]
    fn appends_the_path_untouched_when_the_dash_list_is_empty() {
        let dashed = create_shape();
        append_lottie_dashed_shape_paths(
            &[square()],
            &dashed,
            Some(PathWinding::EvenOdd),
            &[],
            0.0,
        );
        let plain = create_shape();
        append_lottie_shape_paths(&[square()], &plain, Some(PathWinding::EvenOdd));
        assert_eq!(tokens(&dashed), tokens(&plain));
    }

    #[test]
    fn cuts_each_path_into_dash_segments() {
        let dashed = create_shape();
        append_lottie_dashed_shape_paths(&[square()], &dashed, None, &[4.0, 4.0], 0.0);
        let plain = create_shape();
        append_lottie_shape_paths(&[square()], &plain, None);
        assert!(path_command_count(&dashed) > path_command_count(&plain));
    }
}

mod append_lottie_shape_paths {
    use super::*;

    #[test]
    fn appends_every_path_and_lets_the_paint_override_the_winding() {
        let shape = create_shape();
        append_lottie_shape_paths(&[square(), square()], &shape, Some(PathWinding::EvenOdd));
        let shape = shape.read().unwrap();
        assert_eq!(
            shape
                .data
                .commands
                .iter()
                .filter(
                    |token| matches!(token, ShapeCommandToken::String(value) if value == "drawPath")
                )
                .count(),
            2
        );
        assert!(
            shape.data.commands.iter().any(
                |token| matches!(token, ShapeCommandToken::String(value) if value == "evenOdd")
            )
        );
        assert!(
            !shape.data.commands.iter().any(
                |token| matches!(token, ShapeCommandToken::String(value) if value == "nonZero")
            )
        );
    }

    #[test]
    fn falls_back_to_the_path_own_winding_when_the_paint_names_none() {
        let shape = create_shape();
        append_lottie_shape_paths(&[square()], &shape, None);
        assert!(
            shape.read().unwrap().data.commands.iter().any(
                |token| matches!(token, ShapeCommandToken::String(value) if value == "nonZero")
            )
        );
    }
}

fn path_command_count(shape: &Ref<Shape>) -> usize {
    let shape = shape.read().unwrap();
    return match &shape.data.commands[2] {
        ShapeCommandToken::Numbers(values) => values.values.len(),
        _ => 0,
    };
}

fn square() -> Ref<Path> {
    let mut path = create_path(flight_path::PathWinding::NonZero);
    append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 10.0);
    return Arc::new(RwLock::new(path));
}

fn tokens(shape: &Ref<Shape>) -> Vec<String> {
    return shape
        .read()
        .unwrap()
        .data
        .commands
        .iter()
        .map(|token| format!("{token:?}"))
        .collect();
}
