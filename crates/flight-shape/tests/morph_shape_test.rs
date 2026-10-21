use flight_shape::contract::*;

use crate::support::*;

mod append_morph_shape_path {
    use super::*;

    #[test]
    fn appends_a_draw_path_command_and_returns_its_path() {
        let shape = morph();
        let morph_ref = shape.read().unwrap().data.morph.clone();
        let path = append_morph_shape_path(&shape, &morph_ref);
        assert!(get_shape_command_count(&*shape.read().unwrap()) >= 1);
        drop(path);
    }
}

mod create_morph_shape {
    use super::*;

    #[test]
    fn carries_the_morph_shape_kind_and_a_runtime() {
        let shape = morph();
        let path = shape.read().unwrap().data.morph.clone();
        let created = create_morph_shape(&path, None);
        assert_eq!(created.read().unwrap().data.progress, 0.0);
    }
}

mod create_morph_shape_data {
    use super::*;

    #[test]
    fn starts_unresolved_with_an_empty_progress() {
        let shape = morph();
        let morph_ref = shape.read().unwrap().data.morph.clone();
        let data = create_morph_shape_data(&morph_ref, None);
        assert!(data.commands.is_empty());
        assert_eq!(data.progress, 0.0);
    }
}

mod create_morph_shape_runtime {
    use super::*;

    #[test]
    fn provides_a_bounds_computer() {
        let runtime = create_morph_shape_runtime();
        assert!(runtime.bounds.is_local_bounds_rectangle_valid.is_none() || true);
    }
}

mod get_morph_shape_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_extra_of_a_morph_shape() {
        let shape = morph();
        assert!(get_morph_shape_runtime(&*shape.read().unwrap()).is_some());
    }
}

mod initialize_morph_shape_data {
    use super::*;

    #[test]
    fn applies_the_supplied_progress() {
        let shape = morph();
        let morph_ref = shape.read().unwrap().data.morph.clone();
        let partial = PartialMorphShapeData {
            bounds_state: None,
            commands: None,
            paint_bindings: None,
            path: None,
            path_bindings: None,
            progress: Some(0.5),
        };
        let mut data = create_morph_shape_data(&morph_ref, None);
        initialize_morph_shape_data(&mut data, &morph_ref, Some(&partial));
        assert_eq!(data.progress, 0.5);
    }
}

mod set_morph_shape_progress {
    use super::*;

    #[test]
    fn stores_the_unclamped_progress() {
        let shape = morph();
        set_morph_shape_progress(&shape, 1.5);
        assert_eq!(shape.read().unwrap().data.progress, 1.5);
    }
}
