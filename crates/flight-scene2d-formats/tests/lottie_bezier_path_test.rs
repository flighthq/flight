use std::any::Any;
use std::sync::Arc;

use flight_entity::Unknown;
use flight_scene2d_formats::contract::*;

mod create_lottie_bezier_path {
    use super::*;

    #[test]
    fn emits_a_command_per_vertex_and_closes_a_closed_path() {
        let square = square();
        let closed = create_lottie_bezier_path(&square);
        let mut open_square = square;
        open_square.c = false;
        let open = create_lottie_bezier_path(&open_square);
        assert!(closed.commands.len() > open.commands.len());
    }

    #[test]
    fn produces_an_empty_path_for_a_path_with_no_vertices() {
        let path = LottieShapePath {
            c: false,
            i: Vec::new(),
            o: Vec::new(),
            v: Vec::new(),
        };
        assert!(create_lottie_bezier_path(&path).commands.is_empty());
    }
}

mod flatten_lottie_shape_path {
    use super::*;

    #[test]
    fn lays_out_six_numbers_per_vertex() {
        let square = square();
        let mut flattened = Vec::with_capacity(32);
        flattened.push(99.0);
        let capacity = flattened.capacity();
        flatten_lottie_shape_path(&mut flattened, &square);
        assert!(flattened.capacity() >= capacity);
        assert_eq!(flattened.len(), square.v.len() * 6);
    }

    #[test]
    fn round_trips_through_unflatten() {
        let square = square();
        let mut flattened = Vec::new();
        flatten_lottie_shape_path(&mut flattened, &square);
        let restored = unflatten_lottie_shape_path(&square, &flattened);
        assert_eq!(restored, square);
    }
}

mod to_lottie_shape_path {
    use super::*;

    #[test]
    fn answers_false_for_anything_that_is_not_a_shape_path() {
        for value in [None, unknown(42_i32), unknown("nope".to_string())] {
            assert!(to_lottie_shape_path(&value).is_none());
        }
    }

    #[test]
    fn reads_the_bare_object_and_the_single_element_array_form() {
        let mut value = empty_shape_path();
        value.v = vec![vec![2.0, 3.0]];
        for value in [unknown(value.clone()), unknown(vec![value.clone()])] {
            let path = to_lottie_shape_path(&value).expect("shape path");
            assert_eq!(path.v, [vec![2.0, 3.0]]);
        }
    }
}

mod unflatten_lottie_shape_path {
    use super::*;

    #[test]
    fn reads_the_flat_values_back_into_the_template_shape() {
        let square = square();
        let mut flattened = Vec::new();
        flatten_lottie_shape_path(&mut flattened, &square);
        flattened[0] = 5.0;
        let moved = unflatten_lottie_shape_path(&square, &flattened);
        assert_eq!(moved.v[0][0], 5.0);
        assert_eq!(square.v[0][0], 0.0);
    }
}

fn empty_shape_path() -> LottieShapePath {
    return LottieShapePath {
        c: false,
        i: Vec::new(),
        o: Vec::new(),
        v: Vec::new(),
    };
}

fn square() -> LottieShapePath {
    return LottieShapePath {
        c: true,
        i: vec![vec![0.0, 0.0]; 4],
        o: vec![vec![0.0, 0.0]; 4],
        v: vec![
            vec![0.0, 0.0],
            vec![10.0, 0.0],
            vec![10.0, 10.0],
            vec![0.0, 10.0],
        ],
    };
}

fn unknown<T: Any + Send + Sync>(value: T) -> Unknown {
    return Some(Arc::new(value));
}
