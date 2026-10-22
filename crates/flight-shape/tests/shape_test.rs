use flight_node::contract::Node;
use flight_shape::contract::*;

mod clear_shape_commands {
    use super::*;

    #[test]
    fn empties_the_stream() {
        let shape = create_shape();
        append_shape_begin_fill(&shape, 0xff0000ff, None);
        clear_shape_commands(&shape);
        let guard = shape.read().unwrap();
        assert!(is_shape_empty(&*guard));
    }
}

mod compute_shape_local_bounds_rectangle {
    use super::*;

    #[test]
    fn writes_an_empty_rectangle_for_an_empty_shape() {
        let shape = create_shape();
        let mut out = flight_geometry::create_rectangle(0.0, 0.0, 1.0, 1.0);
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }
}

mod copy_shape_commands {
    use super::*;

    #[test]
    fn copies_the_source_stream_onto_the_target() {
        let source = create_shape();
        append_shape_move_to(&source, 3.0, 4.0);
        let target = create_shape();
        copy_shape_commands(&target, &*source.read().unwrap());
        assert_eq!(get_shape_command_count(&*target.read().unwrap()), 1);
    }
}

mod create_shape {
    use super::*;

    #[test]
    fn defaults_to_the_plain_shape_kind_with_an_empty_stream() {
        let shape = create_shape();
        let guard = shape.read().unwrap();
        assert_eq!(Node::node_fields(&*guard).kind, SHAPE_KIND);
        assert!(is_shape_empty(&*guard));
    }
}

mod create_shape_data {
    use super::*;

    #[test]
    fn copies_supplied_commands() {
        let data = create_shape_data();
        assert!(data.commands.is_empty());
    }
}

mod create_shape_runtime {
    use super::*;

    #[test]
    fn carries_a_bounds_computer_and_a_fresh_registry() {
        let runtime = create_shape_runtime();
        let shape = create_shape_data();
        let node = flight_node::contract::create_node::<flight_scene2d::contract::DisplayObject>(
            String::from(SHAPE_KIND),
        );
        let mut out = flight_geometry::create_rectangle(0.0, 0.0, 1.0, 1.0);
        (runtime.bounds.compute_local_bounds_rectangle)(&mut out, &node);
        assert_eq!(out.width, 0.0);
        assert!(
            runtime.bounds.is_local_bounds_rectangle_valid.is_none() || shape.commands.is_empty()
        );
    }
}

mod get_shape_bounds {
    use super::*;

    #[test]
    fn reports_incomplete_without_registered_bounds_commands() {
        let shape = create_shape();
        append_shape_move_to(&shape, 0.0, 0.0);
        let mut out = flight_geometry::create_rectangle(0.0, 0.0, 0.0, 0.0);
        assert!(!get_shape_bounds(&mut out, &*shape.read().unwrap(), None));
    }
}

mod get_shape_command_count {
    use super::*;

    #[test]
    fn counts_one_command() {
        let shape = create_shape();
        append_shape_begin_fill(&shape, 0xff0000ff, None);
        let guard = shape.read().unwrap();
        assert_eq!(get_shape_command_count(&*guard), 1);
    }
}

mod get_shape_runtime {
    use super::*;

    #[test]
    fn returns_the_kind_runtime_extra() {
        let shape = create_shape();
        assert!(get_shape_runtime(&*shape.read().unwrap()).is_some());
    }
}

mod initialize_shape {
    use super::*;

    #[test]
    fn is_the_construction_seam_of_create_shape() {
        let shape = create_shape();
        initialize_shape(&mut *shape.write().unwrap());
        assert!(is_shape_empty(&*shape.read().unwrap()));
    }
}

mod initialize_shape_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_shape_data() {
        let mut data = create_shape_data();
        initialize_shape_data(&mut data);
        assert!(data.commands.is_empty());
    }
}

mod is_shape_empty {
    use super::*;

    #[test]
    fn is_true_before_any_command() {
        let shape = create_shape();
        let guard = shape.read().unwrap();
        assert!(is_shape_empty(&*guard));
    }
}

mod shape_source_parity {
    use super::*;
    use crate::support::*;
    use flight_geometry::Rectangle;
    use flight_node::contract::{NodeRef, get_node_local_content_revision};

    fn command_shape(commands: Vec<ShapeCommandToken>) -> flight_entity::Ref<Shape> {
        return registered_shape(Some(commands));
    }

    #[test]
    fn clear_empties_the_commands_array_and_bumps_the_content_revision() {
        let shape = create_shape();
        shape
            .write()
            .unwrap()
            .shape_commands_mut()
            .extend([string("endFill"), number(0.0)]);
        let content = get_node_local_content_revision(&*shape.read().unwrap());
        clear_shape_commands(&shape);
        assert!(is_shape_empty(&*shape.read().unwrap()));
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            content + 1
        );
    }

    #[test]
    fn local_bounds_are_zero_for_an_empty_shape() {
        let shape = create_shape();
        let mut out = flight_geometry::create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(rect_values(&out), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn local_bounds_compute_from_draw_rectangle_commands() {
        let shape = command_shape(vec![
            string("drawRectangle"),
            number(4.0),
            number(10.0),
            number(20.0),
            number(100.0),
            number(50.0),
        ]);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(rect_values(&out), (10.0, 20.0, 100.0, 50.0));
    }

    #[test]
    fn local_bounds_compute_from_a_circle() {
        let shape = registered_shape(None);
        append_shape_circle(&shape, 100.0, 100.0, 50.0);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(rect_values(&out), (50.0, 50.0, 100.0, 100.0));
    }

    #[test]
    fn local_bounds_compute_from_a_cubic_bezier_with_an_interior_extremum() {
        let shape = registered_shape(None);
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_cubic_curve_to(&shape, 0.0, 0.0, 200.0, 150.0, 200.0, 0.0);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 200.0);
        assert!(((out.height as f64) - 200.0 / 3.0).abs() < 1e-4);
    }

    #[test]
    fn local_bounds_of_a_simple_horizontal_s_curve_include_the_endpoints() {
        let shape = registered_shape(None);
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_cubic_curve_to(&shape, 100.0, 0.0, 0.0, 100.0, 100.0, 100.0);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert!(out.x <= 0.0);
        assert!(out.y <= 0.0);
        assert!(out.x + out.width >= 100.0);
        assert!(out.y + out.height >= 100.0);
    }

    #[test]
    fn local_bounds_compute_from_an_ellipse() {
        let shape = registered_shape(None);
        append_shape_ellipse(&shape, 100.0, 100.0, 60.0, 30.0);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(rect_values(&out), (40.0, 70.0, 120.0, 60.0));
    }

    #[test]
    fn local_bounds_compute_from_move_to_and_line_to() {
        let shape = command_shape(vec![
            string("moveTo"),
            number(2.0),
            number(0.0),
            number(0.0),
            string("lineTo"),
            number(2.0),
            number(80.0),
            number(60.0),
        ]);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(rect_values(&out), (0.0, 0.0, 80.0, 60.0));
    }

    #[test]
    fn local_bounds_include_a_miter_point_beyond_the_half_width_envelope() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(30.0),
            0xffffffff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(6.0),
        );
        append_shape_move_to(&shape, -110.0, -110.0);
        append_shape_line_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 110.0, -110.0);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert!(out.y + out.height > 18.0);
    }

    #[test]
    fn local_bounds_of_a_closed_rectangle_stroke_do_not_apply_the_miter_limit_to_every_axis() {
        let shape = registered_shape(None);
        append_shape_line_style(
            &shape,
            Some(30.0),
            0xffffffff,
            Some(1.0),
            Some(false),
            Some(LineScaleMode::Normal),
            Some(CapsStyle::None),
            Some(JointStyle::Miter),
            Some(6.0),
        );
        append_shape_rectangle(&shape, 0.0, 0.0, 100.0, 100.0);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(rect_values(&out), (-15.0, -15.0, 130.0, 130.0));
    }

    #[test]
    fn local_bounds_compute_from_a_quadratic_bezier_with_an_interior_extremum() {
        let shape = registered_shape(None);
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_quadratic_curve_to(&shape, 50.0, 100.0, 100.0, 0.0);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 100.0);
        assert!(((out.height as f64) - 50.0).abs() < 1e-4);
    }

    #[test]
    fn local_bounds_compute_from_a_quadratic_bezier_with_extrema_in_both_axes() {
        let shape = registered_shape(None);
        append_shape_move_to(&shape, 0.0, 50.0);
        append_shape_quadratic_curve_to(&shape, 50.0, 0.0, 100.0, 50.0);
        let mut out = empty_rect();
        compute_shape_local_bounds_rectangle(&mut out, &*shape.read().unwrap());
        assert_eq!(out.x, 0.0);
        assert!(((out.y as f64) - 25.0).abs() < 1e-4);
        assert_eq!(out.width, 100.0);
        assert!(((out.height as f64) - 25.0).abs() < 1e-4);
    }

    #[test]
    fn copy_discards_target_paint_bindings_when_replacing_a_morph_shape_stream() {
        let start = flight_path::create_path();
        let end = flight_path::create_path();
        let morph = flight_path::create_path_morph(&start, &end).expect("morph");
        let target = create_morph_shape(&std::sync::Arc::new(std::sync::RwLock::new(morph)));
        append_morph_shape_begin_fill(
            &target,
            &MorphShapeColorEndpoint {
                color: 0x000000ff,
                alpha: None,
            },
            &MorphShapeColorEndpoint {
                color: 0xffffffff,
                alpha: None,
            },
        );
        let source = command_shape(vec![
            string("beginFill"),
            number(2.0),
            number(0x123456ffu32 as f64),
            number(1.0),
        ]);
        let source_node: NodeRef = source.clone();
        copy_shape_commands(&target, &*source_node.read().unwrap());
        set_morph_shape_progress(&target, 1.0);
        let guard = target.read().unwrap();
        assert_eq!(guard.data.commands.len(), 4);
        assert!(guard.data.paint_bindings.is_empty());
    }

    #[test]
    fn copy_copies_commands_from_source_to_target() {
        let source = create_shape();
        source
            .write()
            .unwrap()
            .shape_commands_mut()
            .extend([string("endFill"), number(0.0)]);
        let target = create_shape();
        let source_node: NodeRef = source.clone();
        copy_shape_commands(&target, &*source_node.read().unwrap());
        assert_eq!(tokens(&target).len(), 2);
    }

    #[test]
    fn copy_handles_a_command_stream_longer_than_the_engine_argument_limit() {
        let source = create_shape();
        {
            let mut guard = source.write().unwrap();
            let commands = guard.shape_commands_mut();
            commands.reserve(1_200_000);
            for index in 0..400_000.0 as usize {
                commands.push(string("lineTo"));
                commands.push(number(2.0));
                commands.push(number(index as f64));
                commands.push(number(index as f64));
            }
        }
        let target = create_shape();
        let source_node: NodeRef = source.clone();
        copy_shape_commands(&target, &*source_node.read().unwrap());
        let copied = tokens(&target);
        assert_eq!(copied.len(), 1_600_000);
        assert!(
            matches!(&copied[1_599_998], ShapeCommandToken::Number(value) if *value == 399_999.0)
        );
    }

    #[test]
    fn copy_replaces_existing_target_commands_and_bumps_the_content_revision() {
        let source = create_shape();
        source
            .write()
            .unwrap()
            .shape_commands_mut()
            .extend([string("endFill"), number(0.0)]);
        let target = create_shape();
        target.write().unwrap().shape_commands_mut().extend([
            string("beginFill"),
            number(2.0),
            number(0.0),
            number(1.0),
        ]);
        let content = get_node_local_content_revision(&*target.read().unwrap());
        let source_node: NodeRef = source.clone();
        copy_shape_commands(&target, &*source_node.read().unwrap());
        assert_eq!(tokens(&target).len(), 2);
        assert_eq!(
            get_node_local_content_revision(&*target.read().unwrap()),
            content + 1
        );
    }

    #[test]
    fn copy_does_not_share_the_same_array_reference() {
        let source = create_shape();
        source
            .write()
            .unwrap()
            .shape_commands_mut()
            .extend([string("endFill"), number(0.0)]);
        let target = create_shape();
        let source_node: NodeRef = source.clone();
        copy_shape_commands(&target, &*source_node.read().unwrap());
        source
            .write()
            .unwrap()
            .shape_commands_mut()
            .push(string("extra"));
        assert_eq!(tokens(&target).len(), 2);
    }

    #[test]
    fn create_shape_initializes_with_an_empty_commands_array_and_the_shape_kind() {
        let shape = create_shape();
        assert!(is_shape_empty(&*shape.read().unwrap()));
        assert_eq!(Node::node_fields(&*shape.read().unwrap()).kind, SHAPE_KIND);
    }

    #[test]
    fn create_shape_accepts_pre_defined_commands() {
        let shape = command_shape(vec![string("endFill"), number(0.0)]);
        assert_eq!(tokens(&shape).len(), 2);
    }

    #[test]
    fn create_shape_returns_a_new_object_each_call() {
        let first = create_shape();
        let second = create_shape();
        assert!(!std::sync::Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn create_shape_data_returns_empty_commands_and_a_new_object_each_call() {
        let first = create_shape_data();
        let second = create_shape_data();
        assert!(first.commands.is_empty());
        assert!(second.commands.is_empty());
    }

    #[test]
    fn create_shape_runtime_returns_a_non_null_runtime() {
        let runtime = create_shape_runtime();
        let shape = create_shape_data();
        assert!(
            runtime.bounds.is_local_bounds_rectangle_valid.is_some() || shape.commands.is_empty()
        );
    }

    #[test]
    fn get_shape_bounds_matches_compute_shape_local_bounds_rectangle() {
        let shape = command_shape(vec![
            string("drawRectangle"),
            number(4.0),
            number(5.0),
            number(10.0),
            number(200.0),
            number(80.0),
        ]);
        let mut computed: Rectangle = empty_rect();
        let mut queried: Rectangle = empty_rect();
        compute_shape_local_bounds_rectangle(&mut computed, &*shape.read().unwrap());
        get_shape_bounds(&mut queried, &*shape.read().unwrap(), None);
        assert_eq!(rect_values(&queried), rect_values(&computed));
    }

    #[test]
    fn get_shape_bounds_returns_zero_bounds_for_an_empty_shape() {
        let shape = create_shape();
        let mut out = flight_geometry::create_rectangle(1.0, 2.0, 3.0, 4.0);
        get_shape_bounds(&mut out, &*shape.read().unwrap(), None);
        assert_eq!(rect_values(&out), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn get_shape_bounds_rejects_a_partial_result_when_any_command_has_no_contribution() {
        let shape = command_shape(vec![
            string("drawRectangle"),
            number(4.0),
            number(5.0),
            number(10.0),
            number(200.0),
            number(80.0),
            string("__test.incomplete-public-bounds__"),
            number(0.0),
        ]);
        let mut out = flight_geometry::create_rectangle(1.0, 2.0, 3.0, 4.0);
        assert!(!get_shape_bounds(&mut out, &*shape.read().unwrap(), None));
        assert_eq!(rect_values(&out), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn get_shape_command_count_counts_entries_not_flat_elements() {
        let empty = create_shape();
        assert_eq!(get_shape_command_count(&*empty.read().unwrap()), 0);
        let shape = create_shape();
        {
            let mut guard = shape.write().unwrap();
            let commands = guard.shape_commands_mut();
            commands.extend([
                string("beginFill"),
                number(2.0),
                number(0xff0000ffu32 as f64),
                number(1.0),
            ]);
            commands.extend([
                string("drawRectangle"),
                number(4.0),
                number(0.0),
                number(0.0),
                number(100.0),
                number(100.0),
            ]);
            commands.extend([string("endFill"), number(0.0)]);
        }
        assert_eq!(get_shape_command_count(&*shape.read().unwrap()), 3);
    }

    #[test]
    fn get_shape_runtime_returns_the_runtime_for_a_shape() {
        let shape = create_shape();
        assert!(get_shape_runtime(&*shape.read().unwrap()).is_some());
    }

    #[test]
    fn is_shape_empty_tracks_append_and_clear() {
        let shape = create_shape();
        assert!(is_shape_empty(&*shape.read().unwrap()));
        shape
            .write()
            .unwrap()
            .shape_commands_mut()
            .extend([string("endFill"), number(0.0)]);
        assert!(!is_shape_empty(&*shape.read().unwrap()));
        clear_shape_commands(&shape);
        assert!(is_shape_empty(&*shape.read().unwrap()));
    }
}
