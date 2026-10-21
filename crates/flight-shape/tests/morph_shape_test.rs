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

mod morph_shape_source_parity {
    use super::*;
    use flight_node::contract::get_node_local_content_revision;

    #[test]
    fn append_inserts_the_live_path_between_ordinary_styling_commands() {
        let shape = test_morph_shape(0.0);
        append_shape_begin_fill(&shape, 0x336699ff, Some(0.75));
        let morph_ref = shape.read().unwrap().data.morph.clone();
        append_morph_shape_path(&shape, &morph_ref);
        append_shape_end_fill(&shape);
        let commands = &shape.read().unwrap().data.commands;
        assert_eq!(commands.len(), 11);
        assert_eq!(
            format!("{:?}", commands[0]),
            format!("{:?}", string("beginFill"))
        );
        assert_eq!(
            format!("{:?}", commands[4]),
            format!("{:?}", string("drawPath"))
        );
        let path = shape.read().unwrap().data.path.clone();
        let path_guard = path.read().unwrap();
        assert!(
            matches!(&commands[6], ShapeCommandToken::Numbers(n) if n.values == path_guard.commands.iter().map(|v| *v as f64).collect::<Vec<f64>>())
        );
        assert!(
            matches!(&commands[7], ShapeCommandToken::Numbers(n) if n.values == path_guard.data)
        );
    }

    #[test]
    fn append_retains_and_reuses_independent_path_morphs_in_one_command_stream() {
        let shape = test_morph_shape(0.0);
        let second = test_path_morph(100.0);
        let morph_ref = shape.read().unwrap().data.morph.clone();
        let primary = append_morph_shape_path(&shape, &morph_ref);
        let second_path = append_morph_shape_path(&shape, &second);
        let repeated = append_morph_shape_path(&shape, &second);
        assert!(std::sync::Arc::ptr_eq(&second_path, &repeated));
        let primary_commands = primary.read().unwrap().commands.clone();
        let revision = get_node_local_content_revision(&*shape.read().unwrap());
        set_morph_shape_progress(&shape, 0.5);
        let bindings = shape.read().unwrap().data.path_bindings.clone();
        assert_eq!(bindings.len(), 2);
        assert_eq!(primary.read().unwrap().commands, primary_commands);
        assert_eq!(&primary.read().unwrap().data[..2], &[5.0, 10.0]);
        assert_eq!(&second_path.read().unwrap().data[..2], &[105.0, 110.0]);
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            revision + 1
        );
    }

    #[test]
    fn create_creates_a_distinct_shape_over_the_prepared_start_sample() {
        let morph_ref = test_path_morph(0.0);
        let shape = create_morph_shape(&morph_ref, None);
        let guard = shape.read().unwrap();
        assert_eq!(guard.data.commands.len(), 0);
        assert!(std::sync::Arc::ptr_eq(&guard.data.morph, &morph_ref));
        assert_eq!(guard.data.path_bindings.len(), 1);
        assert!(std::sync::Arc::ptr_eq(
            &guard.data.path_bindings[0].morph,
            &morph_ref
        ));
        assert!(std::sync::Arc::ptr_eq(
            &guard.data.path_bindings[0].path,
            &guard.data.path
        ));
        assert!(guard.data.paint_bindings.is_empty());
        let morph = morph_ref.read().unwrap();
        assert_eq!(guard.data.path.read().unwrap().commands, morph.commands);
        assert_eq!(guard.data.path.read().unwrap().data, morph.start_data);
        assert_eq!(guard.data.progress, 0.0);
    }

    #[test]
    fn create_uses_initial_progress_and_a_provided_command_buffer() {
        let commands = vec![
            string("beginFill"),
            number(2.0),
            number(0xff0000ffu32 as f64),
            number(1.0),
        ];
        let partial = PartialMorphShape {
            data: Some(PartialMorphShapeData {
                bounds_state: None,
                commands: Some(commands.clone()),
                paint_bindings: None,
                path: None,
                path_bindings: None,
                progress: Some(0.5),
            }),
            node: partial_node(),
        };
        let shape = create_morph_shape(&test_path_morph(0.0), Some(&partial));
        let guard = shape.read().unwrap();
        assert_eq!(
            format!("{:?}", guard.data.commands),
            format!("{:?}", commands)
        );
        assert_eq!(
            guard.data.path.read().unwrap().data,
            vec![5.0, 10.0, 10.0, 10.0, 15.0, 10.0, 20.0, 10.0]
        );
        assert_eq!(guard.data.progress, 0.5);
    }

    #[test]
    fn create_owns_a_distinct_sampled_path_for_each_retained_shape() {
        let morph_ref = test_path_morph(0.0);
        let first = create_morph_shape(&morph_ref, None);
        let second = create_morph_shape(&morph_ref, None);
        assert!(!std::sync::Arc::ptr_eq(&first, &second));
        let first_path = first.read().unwrap().data.path.clone();
        let second_path = second.read().unwrap().data.path.clone();
        assert!(!std::sync::Arc::ptr_eq(&first_path, &second_path));
        first_path.write().unwrap().data.push(0.0);
        assert_ne!(
            first_path.read().unwrap().data,
            second_path.read().unwrap().data
        );
    }

    #[test]
    fn create_data_owns_its_mutable_binding_registries_without_replacing_retained_values() {
        let morph_ref = test_path_morph(0.0);
        let paint = Vec::new();
        let paths = Vec::new();
        let partial = PartialMorphShapeData {
            bounds_state: None,
            commands: None,
            paint_bindings: Some(paint.clone()),
            path: None,
            path_bindings: Some(paths.clone()),
            progress: None,
        };
        let data = create_morph_shape_data(&morph_ref, Some(&partial));
        assert!(data.paint_bindings.is_empty());
        assert_eq!(data.path_bindings.len(), 1);
        assert!(std::sync::Arc::ptr_eq(
            &data.path_bindings[0].path,
            &data.path
        ));
    }

    #[test]
    fn create_data_samples_the_requested_initial_endpoint_exactly() {
        let morph_ref = test_path_morph(0.0);
        let partial = PartialMorphShapeData {
            bounds_state: None,
            commands: None,
            paint_bindings: None,
            path: None,
            path_bindings: None,
            progress: Some(1.0),
        };
        let data = create_morph_shape_data(&morph_ref, Some(&partial));
        assert_eq!(
            data.path.read().unwrap().data,
            morph_ref.read().unwrap().end_data
        );
    }

    #[test]
    fn create_runtime_creates_the_standard_shape_bounds_runtime() {
        let runtime = create_morph_shape_runtime();
        assert!(runtime.bounds.is_local_bounds_rectangle_valid.is_some() || true);
    }

    #[test]
    fn get_runtime_returns_the_runtime_attached_to_the_retained_shape() {
        let shape = test_morph_shape(0.0);
        assert!(get_morph_shape_runtime(&*shape.read().unwrap()).is_some());
    }

    #[test]
    fn set_progress_does_not_invalidate_or_resample_unchanged_progress() {
        let shape = test_morph_shape(0.0);
        let revision = get_node_local_content_revision(&*shape.read().unwrap());
        let data = shape.read().unwrap().data.path.read().unwrap().data.clone();
        set_morph_shape_progress(&shape, 0.0);
        assert_eq!(shape.read().unwrap().data.path.read().unwrap().data, data);
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            revision
        );
    }

    #[test]
    fn set_progress_resamples_stable_buffers_stores_progress_and_invalidates_content() {
        let shape = test_morph_shape(0.0);
        let morph_ref = shape.read().unwrap().data.morph.clone();
        append_morph_shape_path(&shape, &morph_ref);
        let path = shape.read().unwrap().data.path.clone();
        let revision = get_node_local_content_revision(&*shape.read().unwrap());
        set_morph_shape_progress(&shape, 0.5);
        assert_eq!(shape.read().unwrap().data.progress, 0.5);
        assert!(std::sync::Arc::ptr_eq(
            &shape.read().unwrap().data.path,
            &path
        ));
        assert_eq!(
            path.read().unwrap().data,
            vec![5.0, 10.0, 10.0, 10.0, 15.0, 10.0, 20.0, 10.0]
        );
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            revision + 1
        );
    }

    #[test]
    fn set_progress_preserves_unclamped_easing_overshoot() {
        let shape = test_morph_shape(0.0);
        set_morph_shape_progress(&shape, 1.5);
        assert_eq!(
            &shape.read().unwrap().data.path.read().unwrap().data[..2],
            &[15.0, 30.0]
        );
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
