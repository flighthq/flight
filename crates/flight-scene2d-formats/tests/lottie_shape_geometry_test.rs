use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_path::{Path, append_path_line_to, append_path_move_to, create_path};
use flight_scene2d_formats::contract::*;

mod apply_lottie_shape_direction {
    use super::*;

    #[test]
    fn returns_the_same_path_object_for_directions_other_than_three() {
        for direction in [None, Some(1)] {
            let path = triangle();
            let result = apply_lottie_shape_direction(path.clone(), direction);
            assert!(Arc::ptr_eq(&result, &path));
        }
    }

    #[test]
    fn returns_a_reversed_copy_for_direction_three_leaving_the_original_alone() {
        let path = triangle();
        let original = path.read().unwrap().clone();
        let reversed = apply_lottie_shape_direction(path.clone(), Some(3));
        assert!(!Arc::ptr_eq(&reversed, &path));
        assert_eq!(*path.read().unwrap(), original);
        let reversed = reversed.read().unwrap();
        let path = path.read().unwrap();
        assert_eq!(reversed.commands.len(), path.commands.len());
        assert_eq!(reversed.winding, path.winding);
        assert_ne!(reversed.data, path.data);
    }
}

fn triangle() -> Ref<Path> {
    let mut path = create_path(flight_path::PathWinding::NonZero);
    append_path_move_to(&mut path, 0.0, 0.0);
    append_path_line_to(&mut path, 10.0, 0.0);
    append_path_line_to(&mut path, 0.0, 10.0);
    return Arc::new(RwLock::new(path));
}
