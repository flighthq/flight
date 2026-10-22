use std::sync::{Arc, Mutex, RwLock};

use flight_camera::{Camera2D, create_camera_2d, project_camera_2d_point};
use flight_entity::{Ref, allocate_entity, get_entity_uid, set_entity_uid};
use flight_geometry::{Rectangle, Vector2, create_rectangle};
use flight_gizmo::*;
use flight_interaction::contract::{PointerEventData, PointerType, enable_interaction_signals};
use flight_node::{NodeRef, get_node_child_by_name, get_node_parent, remove_node_child};
use flight_scene2d::{
    Node2DRef, Scene2D, as_node2d_ref, create_display_object, create_scene2d,
};
use flight_selection::{SelectionState, create_selection_state, select_all_nodes};
use flight_shape::{Shape, ShapeCommandToken};
use flight_signals::{Signal, connect_signal, emit_signal};

#[derive(Clone)]
struct TestNodeFeatures {
    bounds: Rectangle,
    origin_x: f32,
    origin_y: f32,
    rotation: f32,
}

type FeatureMap = Arc<RwLock<Vec<(NodeRef, TestNodeFeatures)>>>;

struct TestContext {
    camera: Ref<Camera2D>,
    features_by_node: FeatureMap,
    overlay: Ref<Scene2D>,
    selection: Ref<SelectionState>,
    state: GizmoState,
}

#[derive(Clone, Copy)]
struct NodeTransform {
    pivot_x: f32,
    pivot_y: f32,
    rotation: f32,
    scale_x: f32,
    scale_y: f32,
    skew_x: f32,
    skew_y: f32,
    visible: bool,
    x: f32,
    y: f32,
}

mod create_gizmo_state {
    use super::*;

    #[test]
    fn preserves_selection_identity_and_creates_the_fixed_semantic_handle_set() {
        let context = create_test_context(&[create_test_node()]);
        let root = get_gizmo_root(&context.overlay);
        let handle_root = child(&root, "GizmoHandleRoot");

        assert_eq!(get_gizmo_mode(&context.state), GizmoMode::Translate);
        for name in [
            "GizmoRotateHandle",
            "GizmoTranslateXHandle",
            "GizmoTranslateYHandle",
            "GizmoTranslateXYHandle",
            "GizmoScaleEastHandle",
            "GizmoScaleWestHandle",
            "GizmoScaleNorthHandle",
            "GizmoScaleSouthHandle",
            "GizmoScaleNortheastHandle",
            "GizmoScaleNorthwestHandle",
            "GizmoScaleSoutheastHandle",
            "GizmoScaleSouthwestHandle",
        ] {
            assert!(get_node_child_by_name(&handle_root, name).is_some());
        }
    }
}

mod dispose_gizmo_state {
    use super::*;

    #[test]
    fn also_disposes_cleanly_after_the_caller_detached_the_overlay_root() {
        let context = create_test_context(&[create_test_node()]);
        let root = get_gizmo_root(&context.overlay);
        let scene_root: NodeRef = context.overlay.read().unwrap().root.clone();
        remove_node_child(&scene_root, &root);

        dispose_gizmo_state(&context.state);
        dispose_gizmo_state(&context.state);
    }

    #[test]
    fn detaches_owned_visuals_listeners_and_references_idempotently() {
        let context = create_test_context(&[create_test_node()]);
        let root = get_gizmo_root(&context.overlay);
        let handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");
        let began = Arc::new(Mutex::new(0usize));
        connect_count(
            &get_gizmo_signals(&context.state).on_transform_begin,
            &began,
        );

        dispose_gizmo_state(&context.state);
        dispose_gizmo_state(&context.state);
        emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));
        update_gizmo(&context.state);

        assert!(get_node_parent(&root).is_none());
        assert_eq!(*began.lock().unwrap(), 0);
    }
}

mod get_gizmo_mode {
    use super::*;

    #[test]
    fn returns_the_configured_transform_mode() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Scale);
        assert_eq!(get_gizmo_mode(&context.state), GizmoMode::Scale);
    }
}

mod get_gizmo_signals {
    use super::*;

    #[test]
    fn brackets_one_active_transform_with_zero_argument_begin_and_end_signals() {
        let context = create_test_context(&[create_test_node()]);
        let handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");
        let began = Arc::new(Mutex::new(0usize));
        let ended = Arc::new(Mutex::new(0usize));
        let signals = get_gizmo_signals(&context.state);
        connect_count(&signals.on_transform_begin, &began);
        connect_count(&signals.on_transform_end, &ended);

        emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));
        emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));
        emit_pointer(&handle, PointerSignal::Up, pointer(172.0, 50.0, 2, false));
        assert_eq!(*began.lock().unwrap(), 1);
        assert_eq!(*ended.lock().unwrap(), 0);

        emit_pointer(&handle, PointerSignal::Up, pointer(172.0, 50.0, 1, false));
        emit_pointer(&handle, PointerSignal::Up, pointer(172.0, 50.0, 1, false));
        assert_eq!(*ended.lock().unwrap(), 1);
    }

    #[test]
    fn exposes_stable_translate_rotate_scale_begin_and_end_signals() {
        let first = get_gizmo_signals(&create_test_context(&[create_test_node()]).state);
        let context = create_test_context(&[create_test_node()]);
        let second = get_gizmo_signals(&context.state);
        let third = get_gizmo_signals(&context.state);

        assert!(!Arc::ptr_eq(
            &first.on_translate.data,
            &second.on_translate.data
        ));
        assert!(Arc::ptr_eq(
            &second.on_translate.data,
            &third.on_translate.data
        ));
        assert!(Arc::ptr_eq(&second.on_rotate.data, &third.on_rotate.data));
        assert!(Arc::ptr_eq(&second.on_scale.data, &third.on_scale.data));
        assert!(Arc::ptr_eq(
            &second.on_transform_begin.data,
            &third.on_transform_begin.data
        ));
        assert!(Arc::ptr_eq(
            &second.on_transform_end.data,
            &third.on_transform_end.data
        ));
    }
}

mod get_gizmo_space {
    use super::*;

    #[test]
    fn returns_the_configured_coordinate_space() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_space(&context.state, GizmoSpace::Local);
        assert_eq!(get_gizmo_space(&context.state), GizmoSpace::Local);
    }
}

mod initialize_gizmo_state {
    use super::*;

    #[test]
    fn preserves_the_caller_entity_identity_and_builds_the_overlay() {
        let camera = Arc::new(RwLock::new(create_camera_2d()));
        let overlay = create_scene2d();
        let selection = Arc::new(RwLock::new(create_selection_state()));
        let mut state: GizmoState = allocate_entity();
        set_entity_uid(&mut state, "caller-gizmo".to_string());

        initialize_gizmo_state(
            &mut state,
            &GizmoCreateOptions {
                camera,
                features: create_node2d_gizmo_features(),
                overlay_scene: overlay.clone(),
                selection,
                viewport_height: 100.0,
                viewport_width: 200.0,
            },
        );

        assert_eq!(get_entity_uid(&mut state), "caller-gizmo");
        assert_eq!(get_gizmo_mode(&state), GizmoMode::Translate);
        let root = get_gizmo_root(&overlay);
        assert!(get_node_child_by_name(&root, "GizmoHandleRoot").is_some());
        dispose_gizmo_state(&state);
    }
}

mod set_gizmo_custom_pivot {
    use super::*;

    #[test]
    fn changes_the_custom_world_coordinate_pivot() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Scale);
        set_gizmo_pivot(&context.state, GizmoPivot::Custom);
        set_gizmo_custom_pivot(&context.state, -10.0, 20.0);
        update_gizmo(&context.state);

        let handle_root = child(&get_gizmo_root(&context.overlay), "GizmoHandleRoot");
        let transform = node_transform(&handle_root);
        assert_eq!(transform.x, 90.0);
        assert_eq!(transform.y, 70.0);
    }
}

mod set_gizmo_mode {
    use super::*;

    #[test]
    fn changes_the_active_transform_mode() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Rotate);
        assert_eq!(get_gizmo_mode(&context.state), GizmoMode::Rotate);
    }

    #[test]
    fn leaves_an_active_command_bracket_intact_when_the_mode_is_unchanged() {
        let context = create_test_context(&[create_test_node()]);
        let handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");
        let ended = Arc::new(Mutex::new(0usize));
        connect_count(&get_gizmo_signals(&context.state).on_transform_end, &ended);
        emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));

        set_gizmo_mode(&context.state, GizmoMode::Translate);
        assert_eq!(*ended.lock().unwrap(), 0);
        emit_pointer(&handle, PointerSignal::Up, pointer(172.0, 50.0, 1, false));
        assert_eq!(*ended.lock().unwrap(), 1);
    }
}

mod set_gizmo_pivot {
    use super::*;

    #[test]
    fn selects_the_rotate_and_scale_pivot_mode() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Rotate);
        set_gizmo_custom_pivot(&context.state, 12.0, 18.0);
        set_gizmo_pivot(&context.state, GizmoPivot::Custom);
        update_gizmo(&context.state);
        let handle_root = child(&get_gizmo_root(&context.overlay), "GizmoHandleRoot");
        let transform = node_transform(&handle_root);
        assert_eq!(transform.x, 112.0);
        assert_eq!(transform.y, 68.0);
    }
}

mod set_gizmo_selection_outline_color {
    use super::*;

    #[test]
    fn accepts_packed_rgba_outline_color() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_selection_outline_color(&context.state, 0x12345680);
        update_gizmo(&context.state);
        let outline = child(&get_gizmo_root(&context.overlay), "GizmoSelectionOutline");
        let guard = outline.read().unwrap();
        let shape = guard.as_any().downcast_ref::<Shape>().unwrap();
        assert!(shape.data.commands.iter().any(
            |token| matches!(token, ShapeCommandToken::Number(value) if *value == 0x123456 as f64)
        ));
        assert!(shape.data.commands.iter().any(|token| {
            matches!(token, ShapeCommandToken::Number(value) if (*value - 0x80 as f64 / 0xff as f64).abs() < f64::EPSILON)
        }));
    }
}

mod set_gizmo_selection_outline_enabled {
    use super::*;

    #[test]
    fn toggles_the_selection_outline_independently_of_the_tool_mode() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::None);
        set_gizmo_selection_outline_enabled(&context.state, false);
        update_gizmo(&context.state);
        let outline = child(&get_gizmo_root(&context.overlay), "GizmoSelectionOutline");
        assert!(!node_transform(&outline).visible);
    }
}

mod set_gizmo_snap_rotation {
    use super::*;

    #[test]
    fn sets_degree_snapping_and_accepts_zero_as_off() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Rotate);
        set_gizmo_snap_rotation(&context.state, 15.0);
        assert_f32_close(rotation_delta(&context, 22.0), 15.0);
        set_gizmo_snap_rotation(&context.state, 0.0);
        assert_f32_close(rotation_delta(&context, 22.0), 22.0);
    }
}

mod set_gizmo_snap_scale {
    use super::*;

    #[test]
    fn sets_multiplier_snapping_and_accepts_zero_as_off() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Scale);
        set_gizmo_snap_scale(&context.state, 0.25);
        assert_f32_close(scale_delta(&context, 1.4), 1.5);
        set_gizmo_snap_scale(&context.state, 0.0);
        assert_f32_close(scale_delta(&context, 1.4), 1.4);
    }
}

mod set_gizmo_snap_translate {
    use super::*;

    #[test]
    fn sets_world_unit_translation_snapping_and_accepts_zero_as_off() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_snap_translate(&context.state, 10.0);
        assert_f32_close(translation_delta(&context, 13.0), 10.0);
        set_gizmo_snap_translate(&context.state, 0.0);
        assert_f32_close(translation_delta(&context, 13.0), 13.0);
    }

    #[test]
    fn treats_invalid_grid_increments_as_disabled() {
        for step in [-10.0, f32::NAN, f32::INFINITY] {
            let context = create_test_context(&[create_test_node()]);
            set_gizmo_snap_translate(&context.state, step);
            assert_f32_close(translation_delta(&context, -5.0), -5.0);
        }
    }
}

mod set_gizmo_space {
    use super::*;

    #[test]
    fn changes_the_coordinate_space() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_space(&context.state, GizmoSpace::Local);
        assert_eq!(get_gizmo_space(&context.state), GizmoSpace::Local);
    }
}

mod update_gizmo {
    use super::*;

    #[test]
    fn combines_multi_selection_bounds_and_keeps_handles_in_screen_space_units() {
        let first = create_test_node();
        let second = create_test_node();
        let context = create_test_context(&[first.clone(), second.clone()]);
        set_features(
            &context.features_by_node,
            &first,
            features(0.0, 0.0, 10.0, 10.0),
        );
        set_features(
            &context.features_by_node,
            &second,
            features(20.0, 20.0, 10.0, 10.0),
        );
        update_gizmo(&context.state);
        let handle_root = child(&get_gizmo_root(&context.overlay), "GizmoHandleRoot");
        let transform = node_transform(&handle_root);
        assert_f32_close(transform.x, 115.0);
        assert_f32_close(transform.y, 65.0);

        context.camera.write().unwrap().zoom = 2.0;
        update_gizmo(&context.state);
        let transform = node_transform(&handle_root);
        assert_eq!(transform.scale_x, 1.0);
        assert_eq!(transform.scale_y, 1.0);
        assert!(shape_contains_number(
            &get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle"),
            72.0
        ));
    }

    #[test]
    fn emits_rotation_scale_and_translation_without_mutating_selected_nodes() {
        let gestures = [
            (
                GizmoMode::Translate,
                "GizmoTranslateXYHandle",
                (2.0, -3.0),
                (6.0, 0.0),
            ),
            (
                GizmoMode::Rotate,
                "GizmoRotateHandle",
                (10.0, 0.0),
                (0.0, 10.0),
            ),
            (
                GizmoMode::Scale,
                "GizmoScaleNortheastHandle",
                (10.0, 0.0),
                (15.0, 0.0),
            ),
        ];
        for (mode, name, start, end) in gestures {
            let node = create_test_node();
            let context = create_test_context(&[node.clone()]);
            set_gizmo_mode(&context.state, mode);
            update_gizmo(&context.state);
            let before = node_transform(&node);
            let handle = get_gizmo_handle(&context.overlay, name);
            emit_pointer(
                &handle,
                PointerSignal::Down,
                projected_pointer(&context.camera, start.0, start.1),
            );
            emit_pointer(
                &handle,
                PointerSignal::Move,
                projected_pointer(&context.camera, end.0, end.1),
            );
            emit_pointer(
                &handle,
                PointerSignal::Up,
                projected_pointer(&context.camera, end.0, end.1),
            );
            let after = node_transform(&node);
            assert_same_transform(before, after);
        }
    }

    #[test]
    fn keeps_outline_in_none_mode_cancels_the_active_bracket_and_hides_an_empty_selection() {
        let context = create_test_context(&[create_test_node()]);
        let ended = Arc::new(Mutex::new(0usize));
        connect_count(&get_gizmo_signals(&context.state).on_transform_end, &ended);
        let handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");
        emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));
        set_gizmo_mode(&context.state, GizmoMode::None);
        update_gizmo(&context.state);
        let root = get_gizmo_root(&context.overlay);
        assert!(node_transform(&root).visible);
        assert!(!node_transform(&child(&root, "GizmoHandleRoot")).visible);
        assert!(node_transform(&child(&root, "GizmoSelectionOutline")).visible);
        assert_eq!(*ended.lock().unwrap(), 1);

        select_all_nodes(&context.selection.read().unwrap(), &[]);
        update_gizmo(&context.state);
        assert!(!node_transform(&root).visible);
    }

    #[test]
    fn normalizes_rotation_across_the_negative_positive_angle_seam() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Rotate);
        let values = Arc::new(Mutex::new(Vec::<f32>::new()));
        connect_values(&get_gizmo_signals(&context.state).on_rotate, &values);
        let handle = get_gizmo_handle(&context.overlay, "GizmoRotateHandle");
        let radius = 52.0;
        let start = 170.0 * std::f32::consts::PI / 180.0;
        let current = -170.0 * std::f32::consts::PI / 180.0;
        emit_pointer(
            &handle,
            PointerSignal::Down,
            pointer(
                100.0 + start.cos() * radius,
                50.0 + start.sin() * radius,
                1,
                false,
            ),
        );
        emit_pointer(
            &handle,
            PointerSignal::Move,
            pointer(
                100.0 + current.cos() * radius,
                50.0 + current.sin() * radius,
                1,
                false,
            ),
        );
        assert_f32_close_steps(*values.lock().unwrap().last().unwrap(), 20.0, 16.0);
    }

    #[test]
    fn orients_world_and_local_handles_against_camera_rotation() {
        let node = create_test_node();
        let context = create_test_context(&[node.clone()]);
        set_features(
            &context.features_by_node,
            &node,
            TestNodeFeatures {
                bounds: create_rectangle(0.0, 0.0, 10.0, 10.0),
                origin_x: 5.0,
                origin_y: 5.0,
                rotation: 30.0,
            },
        );
        context.camera.write().unwrap().rotation = 10.0 * std::f32::consts::PI / 180.0;
        let handle_root = child(&get_gizmo_root(&context.overlay), "GizmoHandleRoot");
        set_gizmo_space(&context.state, GizmoSpace::World);
        update_gizmo(&context.state);
        assert_eq!(node_transform(&handle_root).rotation, 0.0);
        set_gizmo_space(&context.state, GizmoSpace::Local);
        update_gizmo(&context.state);
        assert_f32_close(node_transform(&handle_root).rotation, 20.0);
    }

    #[test]
    fn places_edge_and_corner_scale_handles_on_combined_bounds() {
        let node = create_test_node();
        let context = create_test_context(&[node.clone()]);
        set_features(
            &context.features_by_node,
            &node,
            features(-20.0, -10.0, 40.0, 20.0),
        );
        set_gizmo_mode(&context.state, GizmoMode::Scale);
        update_gizmo(&context.state);

        for (name, x, y) in [
            ("GizmoScaleEastHandle", 20.0, 0.0),
            ("GizmoScaleWestHandle", -20.0, 0.0),
            ("GizmoScaleNorthHandle", 0.0, -10.0),
            ("GizmoScaleSouthHandle", 0.0, 10.0),
            ("GizmoScaleNortheastHandle", 20.0, -10.0),
            ("GizmoScaleSouthwestHandle", -20.0, 10.0),
        ] {
            let transform = node_transform(&get_gizmo_handle(&context.overlay, name));
            assert_f32_close(transform.x, x);
            assert_f32_close(transform.y, y);
        }
    }

    #[test]
    fn skips_selected_nodes_without_bounds_and_supports_all_pivot_policies() {
        let unavailable = create_test_node();
        let available = create_test_node();
        let context = create_test_context(&[unavailable.clone(), available.clone()]);
        remove_features(&context.features_by_node, &unavailable);
        set_features(
            &context.features_by_node,
            &available,
            TestNodeFeatures {
                bounds: create_rectangle(20.0, 30.0, 10.0, 20.0),
                origin_x: 40.0,
                origin_y: 50.0,
                rotation: 0.0,
            },
        );
        set_gizmo_mode(&context.state, GizmoMode::Rotate);
        set_gizmo_pivot(&context.state, GizmoPivot::Origin);
        update_gizmo(&context.state);
        let handle_root = child(&get_gizmo_root(&context.overlay), "GizmoHandleRoot");
        assert_eq!(node_transform(&handle_root).x, 140.0);
        assert_eq!(node_transform(&handle_root).y, 100.0);
        set_gizmo_pivot(&context.state, GizmoPivot::Custom);
        set_gizmo_custom_pivot(&context.state, -25.0, 12.0);
        update_gizmo(&context.state);
        assert_eq!(node_transform(&handle_root).x, 75.0);
        assert_eq!(node_transform(&handle_root).y, 62.0);
        set_gizmo_pivot(&context.state, GizmoPivot::Center);
        update_gizmo(&context.state);
        assert_eq!(node_transform(&handle_root).x, 125.0);
        assert_eq!(node_transform(&handle_root).y, 90.0);
    }

    #[test]
    fn supports_axis_uniform_and_degenerate_scale_gestures() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Scale);
        let values = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
        connect_pairs(&get_gizmo_signals(&context.state).on_scale, &values);
        let x_handle = get_gizmo_handle(&context.overlay, "GizmoScaleEastHandle");
        emit_pointer(
            &x_handle,
            PointerSignal::Down,
            pointer(172.0, 50.0, 1, false),
        );
        emit_pointer(
            &x_handle,
            PointerSignal::Move,
            pointer(208.0, 50.0, 1, false),
        );
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (1.5, 1.0));
        emit_pointer(&x_handle, PointerSignal::Up, pointer(208.0, 50.0, 1, false));
        emit_pointer(
            &x_handle,
            PointerSignal::Down,
            pointer(172.0, 50.0, 1, false),
        );
        emit_pointer(
            &x_handle,
            PointerSignal::Move,
            pointer(208.0, 50.0, 1, true),
        );
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (1.5, 1.5));
        emit_pointer(&x_handle, PointerSignal::Up, pointer(208.0, 50.0, 1, false));

        for name in [
            "GizmoScaleEastHandle",
            "GizmoScaleNorthHandle",
            "GizmoScaleNortheastHandle",
        ] {
            let handle = get_gizmo_handle(&context.overlay, name);
            emit_pointer(&handle, PointerSignal::Down, pointer(100.0, 50.0, 1, false));
            emit_pointer(&handle, PointerSignal::Move, pointer(120.0, 70.0, 1, false));
            assert_pair_close(*values.lock().unwrap().last().unwrap(), (1.0, 1.0));
            emit_pointer(&handle, PointerSignal::Up, pointer(120.0, 70.0, 1, false));
        }
    }

    #[test]
    fn supports_free_and_axis_translation_and_ignores_other_pointer_ids() {
        let context = create_test_context(&[create_test_node()]);
        let values = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
        connect_pairs(&get_gizmo_signals(&context.state).on_translate, &values);
        let y_handle = get_gizmo_handle(&context.overlay, "GizmoTranslateYHandle");
        emit_pointer(
            &y_handle,
            PointerSignal::Down,
            pointer(100.0, -22.0, 1, false),
        );
        emit_pointer(
            &y_handle,
            PointerSignal::Move,
            pointer(113.0, -34.0, 2, false),
        );
        assert!(values.lock().unwrap().is_empty());
        emit_pointer(
            &y_handle,
            PointerSignal::Move,
            pointer(113.0, -34.0, 1, false),
        );
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (0.0, -12.0));
        emit_pointer(
            &y_handle,
            PointerSignal::Up,
            pointer(113.0, -34.0, 1, false),
        );
        let xy_handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXYHandle");
        emit_pointer(
            &xy_handle,
            PointerSignal::Down,
            pointer(100.0, 50.0, 1, false),
        );
        emit_pointer(
            &xy_handle,
            PointerSignal::Move,
            pointer(108.0, 61.0, 1, false),
        );
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (8.0, 11.0));
    }

    #[test]
    fn cancels_an_active_bracket_when_switching_directly_between_transform_modes() {
        let context = create_test_context(&[create_test_node()]);
        let ended = Arc::new(Mutex::new(0usize));
        connect_count(&get_gizmo_signals(&context.state).on_transform_end, &ended);
        let handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");
        emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));

        set_gizmo_mode(&context.state, GizmoMode::Rotate);
        update_gizmo(&context.state);

        assert_eq!(*ended.lock().unwrap(), 1);
        assert_eq!(get_gizmo_mode(&context.state), GizmoMode::Rotate);
    }

    #[test]
    fn emits_rotation_deltas_in_degrees_only_and_applies_degree_snapping() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Rotate);
        set_gizmo_snap_rotation(&context.state, 15.0);
        let values = Arc::new(Mutex::new(Vec::<f32>::new()));
        connect_values(&get_gizmo_signals(&context.state).on_rotate, &values);
        let handle = get_gizmo_handle(&context.overlay, "GizmoRotateHandle");
        emit_pointer(&handle, PointerSignal::Down, pointer(152.0, 50.0, 1, false));
        emit_pointer(
            &handle,
            PointerSignal::Move,
            pointer(100.0, 102.0, 1, false),
        );
        assert_f32_close(*values.lock().unwrap().last().unwrap(), 90.0);
    }

    #[test]
    fn emits_snapped_translation_deltas_constrained_to_world_and_local_axes() {
        let node = create_test_node();
        let context = create_test_context(&[node.clone()]);
        set_features(
            &context.features_by_node,
            &node,
            TestNodeFeatures {
                bounds: create_rectangle(0.0, 0.0, 0.0, 0.0),
                origin_x: 0.0,
                origin_y: 0.0,
                rotation: 90.0,
            },
        );
        set_gizmo_snap_translate(&context.state, 10.0);
        update_gizmo(&context.state);
        let values = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
        connect_pairs(&get_gizmo_signals(&context.state).on_translate, &values);
        let handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");

        emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));
        emit_pointer(&handle, PointerSignal::Move, pointer(185.0, 74.0, 1, false));
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (10.0, 0.0));
        emit_pointer(&handle, PointerSignal::Up, pointer(185.0, 74.0, 1, false));

        set_gizmo_space(&context.state, GizmoSpace::Local);
        update_gizmo(&context.state);
        emit_pointer(
            &handle,
            PointerSignal::Down,
            pointer(100.0, 122.0, 1, false),
        );
        emit_pointer(
            &handle,
            PointerSignal::Move,
            pointer(100.0, 135.0, 1, false),
        );
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (0.0, 10.0));
    }

    #[test]
    fn keeps_world_space_handles_screen_aligned_while_emitting_document_world_deltas() {
        let context = create_test_context(&[create_test_node()]);
        context.camera.write().unwrap().rotation = std::f32::consts::PI * 0.5;
        update_gizmo(&context.state);
        let values = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
        connect_pairs(&get_gizmo_signals(&context.state).on_translate, &values);
        let handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");

        emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));
        emit_pointer(&handle, PointerSignal::Move, pointer(182.0, 50.0, 1, false));

        assert_pair_close(*values.lock().unwrap().last().unwrap(), (0.0, 10.0));
    }

    #[test]
    fn pins_each_world_gesture_through_identity_and_transformed_cameras() {
        let cases = [
            (
                GizmoMode::Translate,
                "GizmoTranslateXYHandle",
                (2.0, -3.0),
                (6.0, 0.0),
                vec![4.0, 3.0],
            ),
            (
                GizmoMode::Rotate,
                "GizmoRotateHandle",
                (10.0, 0.0),
                (0.0, 10.0),
                vec![90.0],
            ),
            (
                GizmoMode::Scale,
                "GizmoScaleNortheastHandle",
                (10.0, 0.0),
                (15.0, 0.0),
                vec![1.5, 1.5],
            ),
        ];
        for (mode, handle, start, end, expected) in cases {
            let identity = run_world_gesture(mode, handle, start, end, false);
            let transformed = run_world_gesture(mode, handle, start, end, true);
            assert_vec_close(&identity, &expected);
            assert_vec_close(&transformed, &expected);
            assert_vec_close(&transformed, &identity);
        }
    }

    #[test]
    fn snaps_the_moved_selection_position_to_the_grid_in_world_and_local_axes() {
        let node = create_test_node();
        let context = create_test_context(&[node.clone()]);
        set_features(
            &context.features_by_node,
            &node,
            TestNodeFeatures {
                bounds: create_rectangle(-13.0, 13.0, 0.0, 0.0),
                origin_x: -13.0,
                origin_y: 13.0,
                rotation: 90.0,
            },
        );
        set_gizmo_snap_translate(&context.state, 10.0);
        {
            let mut camera = context.camera.write().unwrap();
            camera.x = 25.0;
            camera.y = -40.0;
            camera.zoom = 2.5;
        }
        update_gizmo(&context.state);
        let values = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
        connect_pairs(&get_gizmo_signals(&context.state).on_translate, &values);
        let xy_handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXYHandle");
        emit_pointer(
            &xy_handle,
            PointerSignal::Down,
            projected_pointer(&context.camera, -13.0, 13.0),
        );
        emit_pointer(
            &xy_handle,
            PointerSignal::Move,
            projected_pointer(&context.camera, -15.0, 17.0),
        );
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (-7.0, 7.0));
        emit_pointer(
            &xy_handle,
            PointerSignal::Up,
            projected_pointer(&context.camera, -15.0, 17.0),
        );

        set_gizmo_space(&context.state, GizmoSpace::Local);
        update_gizmo(&context.state);
        let x_handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");
        emit_pointer(
            &x_handle,
            PointerSignal::Down,
            projected_pointer(&context.camera, -13.0, 13.0),
        );
        emit_pointer(
            &x_handle,
            PointerSignal::Move,
            projected_pointer(&context.camera, -13.0, 17.0),
        );
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (0.0, 7.0));
    }

    #[test]
    fn supports_center_active_origin_and_custom_world_pivots() {
        let first = create_test_node();
        let second = create_test_node();
        let context = create_test_context(&[first.clone(), second.clone()]);
        set_features(
            &context.features_by_node,
            &first,
            TestNodeFeatures {
                bounds: create_rectangle(0.0, 0.0, 10.0, 10.0),
                origin_x: 2.0,
                origin_y: 3.0,
                rotation: 0.0,
            },
        );
        set_features(
            &context.features_by_node,
            &second,
            TestNodeFeatures {
                bounds: create_rectangle(20.0, 20.0, 10.0, 10.0),
                origin_x: 40.0,
                origin_y: 50.0,
                rotation: 0.0,
            },
        );
        let handle_root = child(&get_gizmo_root(&context.overlay), "GizmoHandleRoot");
        set_gizmo_mode(&context.state, GizmoMode::Rotate);
        set_gizmo_pivot(&context.state, GizmoPivot::Origin);
        update_gizmo(&context.state);
        assert_pair_close(
            (
                node_transform(&handle_root).x,
                node_transform(&handle_root).y,
            ),
            (140.0, 100.0),
        );
        set_gizmo_pivot(&context.state, GizmoPivot::Custom);
        set_gizmo_custom_pivot(&context.state, -25.0, 12.0);
        update_gizmo(&context.state);
        assert_pair_close(
            (
                node_transform(&handle_root).x,
                node_transform(&handle_root).y,
            ),
            (75.0, 62.0),
        );
        set_gizmo_pivot(&context.state, GizmoPivot::Center);
        update_gizmo(&context.state);
        assert_pair_close(
            (
                node_transform(&handle_root).x,
                node_transform(&handle_root).y,
            ),
            (115.0, 65.0),
        );
        set_gizmo_mode(&context.state, GizmoMode::Translate);
        set_gizmo_pivot(&context.state, GizmoPivot::Custom);
        update_gizmo(&context.state);
        assert_pair_close(
            (
                node_transform(&handle_root).x,
                node_transform(&handle_root).y,
            ),
            (115.0, 65.0),
        );
    }

    #[test]
    fn supports_runtime_outline_visibility_and_packed_rgba_color() {
        let context = create_test_context(&[create_test_node()]);
        let outline = child(&get_gizmo_root(&context.overlay), "GizmoSelectionOutline");
        set_gizmo_selection_outline_enabled(&context.state, false);
        update_gizmo(&context.state);
        assert!(!node_transform(&outline).visible);
        set_gizmo_selection_outline_color(&context.state, 0x12345680);
        set_gizmo_selection_outline_enabled(&context.state, true);
        update_gizmo(&context.state);
        assert!(node_transform(&outline).visible);
        assert!(shape_contains_number(&outline, 0x123456 as f64));
    }

    #[test]
    fn supports_y_axis_scale_and_ignores_pointer_traffic_from_another_identity() {
        let context = create_test_context(&[create_test_node()]);
        set_gizmo_mode(&context.state, GizmoMode::Scale);
        let values = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
        connect_pairs(&get_gizmo_signals(&context.state).on_scale, &values);
        let handle = get_gizmo_handle(&context.overlay, "GizmoScaleNorthHandle");
        emit_pointer(
            &handle,
            PointerSignal::Down,
            pointer(100.0, -22.0, 1, false),
        );
        emit_pointer(
            &handle,
            PointerSignal::Move,
            pointer(100.0, -58.0, 2, false),
        );
        assert!(values.lock().unwrap().is_empty());
        emit_pointer(
            &handle,
            PointerSignal::Move,
            pointer(100.0, -58.0, 1, false),
        );
        assert_pair_close(*values.lock().unwrap().last().unwrap(), (1.0, 1.5));
    }
}

#[derive(Clone, Copy)]
enum PointerSignal {
    Down,
    Move,
    Up,
}

fn assert_f32_close(actual: f32, expected: f32) {
    // The pinned source uses toBeCloseTo(..., 8), whose original absolute bound is 5e-9.
    let bound = 5e-9_f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        (actual - expected).abs() <= bound,
        "{actual} != {expected} within {bound}"
    );
}

fn assert_f32_close_steps(actual: f32, expected: f32, operation_count: f32) {
    // The pinned source uses toBeCloseTo(..., 8), whose original absolute bound is 5e-9. This
    // angle-seam path accumulates sixteen public-f32 projection/trigonometry operations.
    let bound = 5e-9_f32.max(operation_count * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        (actual - expected).abs() <= bound,
        "{actual} != {expected} within {bound}"
    );
}

fn assert_pair_close(actual: (f32, f32), expected: (f32, f32)) {
    assert_f32_close(actual.0, expected.0);
    assert_f32_close(actual.1, expected.1);
}

fn assert_vec_close(actual: &[f32], expected: &[f32]) {
    assert_eq!(actual.len(), expected.len());
    for (actual, expected) in actual.iter().zip(expected) {
        // The pinned source rounds the transform parity values to eight decimal places. The
        // projected gesture path accumulates at most thirty-two public-f32 matrix/trig operations.
        assert_f32_close_steps(*actual, *expected, 32.0);
    }
}

fn assert_same_transform(a: NodeTransform, b: NodeTransform) {
    assert_eq!(a.pivot_x, b.pivot_x);
    assert_eq!(a.pivot_y, b.pivot_y);
    assert_eq!(a.rotation, b.rotation);
    assert_eq!(a.scale_x, b.scale_x);
    assert_eq!(a.scale_y, b.scale_y);
    assert_eq!(a.skew_x, b.skew_x);
    assert_eq!(a.skew_y, b.skew_y);
    assert_eq!(a.x, b.x);
    assert_eq!(a.y, b.y);
}

fn child(parent: &NodeRef, name: &str) -> NodeRef {
    return get_node_child_by_name(parent, name).unwrap();
}

fn connect_count(signal: &Signal<()>, count: &Arc<Mutex<usize>>) {
    let count = count.clone();
    connect_signal(
        signal,
        Arc::new(move |_: &()| *count.lock().unwrap() += 1),
        None,
    );
}

fn connect_pairs(signal: &Signal<(f32, f32)>, values: &Arc<Mutex<Vec<(f32, f32)>>>) {
    let values = values.clone();
    connect_signal(
        signal,
        Arc::new(move |value: &(f32, f32)| values.lock().unwrap().push(*value)),
        None,
    );
}

fn connect_values(signal: &Signal<f32>, values: &Arc<Mutex<Vec<f32>>>) {
    let values = values.clone();
    connect_signal(
        signal,
        Arc::new(move |value: &f32| values.lock().unwrap().push(*value)),
        None,
    );
}

fn create_test_context(nodes: &[NodeRef]) -> TestContext {
    let camera = Arc::new(RwLock::new(create_camera_2d()));
    let overlay = create_scene2d();
    let selection = Arc::new(RwLock::new(create_selection_state()));
    select_all_nodes(&selection.read().unwrap(), nodes);
    let features_by_node: FeatureMap = Arc::new(RwLock::new(
        nodes
            .iter()
            .map(|node| (node.clone(), features(0.0, 0.0, 0.0, 0.0)))
            .collect(),
    ));
    let bounds_map = features_by_node.clone();
    let origin_map = features_by_node.clone();
    let rotation_map = features_by_node.clone();
    let feature_adapter = GizmoNode2DFeatures {
        get_world_bounds_rectangle: Arc::new(move |out: &mut Rectangle, node: &NodeRef| {
            let map = bounds_map.read().unwrap();
            let Some((_, value)) = map
                .iter()
                .find(|(candidate, _)| Arc::ptr_eq(candidate, node))
            else {
                return false;
            };
            *out = value.bounds.clone();
            return true;
        }),
        get_world_origin: Arc::new(move |out: &mut Vector2, node: &NodeRef| {
            let map = origin_map.read().unwrap();
            let value = &map
                .iter()
                .find(|(candidate, _)| Arc::ptr_eq(candidate, node))
                .unwrap()
                .1;
            out.x = value.origin_x;
            out.y = value.origin_y;
        }),
        get_world_rotation: Arc::new(move |node: &NodeRef| {
            let map = rotation_map.read().unwrap();
            return map
                .iter()
                .find(|(candidate, _)| Arc::ptr_eq(candidate, node))
                .unwrap()
                .1
                .rotation;
        }),
    };
    let state = create_gizmo_state(&GizmoCreateOptions {
        camera: camera.clone(),
        features: feature_adapter,
        overlay_scene: overlay.clone(),
        selection: selection.clone(),
        viewport_height: 100.0,
        viewport_width: 200.0,
    });
    update_gizmo(&state);
    return TestContext {
        camera,
        features_by_node,
        overlay,
        selection,
        state,
    };
}

fn create_test_node() -> NodeRef {
    let node = create_display_object();
    node.write().unwrap().name = Some("GizmoTestNode".to_string());
    return node;
}

fn emit_pointer(node: &NodeRef, signal: PointerSignal, data: PointerEventData) {
    let signals = enable_interaction_signals(node);
    let signal = {
        let signals = signals.read().unwrap();
        match signal {
            PointerSignal::Down => signals.on_pointer_down.clone(),
            PointerSignal::Move => signals.on_pointer_move.clone(),
            PointerSignal::Up => signals.on_pointer_up.clone(),
        }
    };
    emit_signal(&signal, &data);
}

fn features(x: f32, y: f32, width: f32, height: f32) -> TestNodeFeatures {
    return TestNodeFeatures {
        bounds: create_rectangle(x, y, width, height),
        origin_x: x + width * 0.5,
        origin_y: y + height * 0.5,
        rotation: 0.0,
    };
}

fn get_gizmo_handle(overlay: &Ref<Scene2D>, name: &str) -> NodeRef {
    let handle_root = child(&get_gizmo_root(overlay), "GizmoHandleRoot");
    return child(&handle_root, name);
}

fn get_gizmo_root(overlay: &Ref<Scene2D>) -> NodeRef {
    let root: NodeRef = overlay.read().unwrap().root.clone();
    return child(&root, "GizmoRoot");
}

fn node_transform(node: &NodeRef) -> NodeTransform {
    let node: Node2DRef = as_node2d_ref(node).unwrap();
    let node = node.read().unwrap();
    let fields = node.node2d_fields();
    return NodeTransform {
        pivot_x: fields.pivot_x,
        pivot_y: fields.pivot_y,
        rotation: fields.rotation,
        scale_x: fields.scale_x,
        scale_y: fields.scale_y,
        skew_x: fields.skew_x,
        skew_y: fields.skew_y,
        visible: fields.visible,
        x: fields.x,
        y: fields.y,
    };
}

fn pointer(x: f32, y: f32, pointer_id: i32, shift_key: bool) -> PointerEventData {
    return PointerEventData {
        alt_key: false,
        button: 0,
        buttons: 1,
        ctrl_key: false,
        current_target: None,
        delta_x: 0.0,
        delta_y: 0.0,
        local_x: x,
        local_y: y,
        meta_key: false,
        pointer_id,
        pointer_type: PointerType::Mouse,
        shift_key,
        target: None,
        world_x: x,
        world_y: y,
        x,
        y,
    };
}

fn projected_pointer(camera: &Ref<Camera2D>, world_x: f32, world_y: f32) -> PointerEventData {
    let mut overlay = flight_geometry::create_vector2(0.0, 0.0);
    project_camera_2d_point(
        &camera.read().unwrap(),
        200.0,
        100.0,
        world_x,
        world_y,
        &mut overlay,
    );
    let mut data = pointer(overlay.x, overlay.y, 1, false);
    data.world_x = world_x;
    data.world_y = world_y;
    return data;
}

fn remove_features(map: &FeatureMap, node: &NodeRef) {
    map.write()
        .unwrap()
        .retain(|(candidate, _)| !Arc::ptr_eq(candidate, node));
}

fn rotation_delta(context: &TestContext, degrees: f32) -> f32 {
    let values = Arc::new(Mutex::new(Vec::<f32>::new()));
    connect_values(&get_gizmo_signals(&context.state).on_rotate, &values);
    let handle = get_gizmo_handle(&context.overlay, "GizmoRotateHandle");
    let radians = degrees * std::f32::consts::PI / 180.0;
    emit_pointer(&handle, PointerSignal::Down, pointer(152.0, 50.0, 1, false));
    emit_pointer(
        &handle,
        PointerSignal::Move,
        pointer(
            100.0 + radians.cos() * 52.0,
            50.0 + radians.sin() * 52.0,
            1,
            false,
        ),
    );
    emit_pointer(&handle, PointerSignal::Up, pointer(100.0, 50.0, 1, false));
    let value = *values.lock().unwrap().last().unwrap();
    return value;
}

fn run_world_gesture(
    mode: GizmoMode,
    handle_name: &str,
    start: (f32, f32),
    end: (f32, f32),
    transformed_camera: bool,
) -> Vec<f32> {
    let node = create_test_node();
    let context = create_test_context(&[node.clone()]);
    set_gizmo_mode(&context.state, mode);
    if transformed_camera {
        let mut camera = context.camera.write().unwrap();
        camera.x = 12.0;
        camera.y = -7.0;
        camera.zoom = 2.25;
        camera.rotation = 35.0 * std::f32::consts::PI / 180.0;
        drop(camera);
        update_gizmo(&context.state);
    }
    let began = Arc::new(Mutex::new(0usize));
    let ended = Arc::new(Mutex::new(0usize));
    let signals = get_gizmo_signals(&context.state);
    connect_count(&signals.on_transform_begin, &began);
    connect_count(&signals.on_transform_end, &ended);
    let one = Arc::new(Mutex::new(Vec::<f32>::new()));
    let two = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
    match mode {
        GizmoMode::Translate => connect_pairs(&signals.on_translate, &two),
        GizmoMode::Rotate => connect_values(&signals.on_rotate, &one),
        GizmoMode::Scale => connect_pairs(&signals.on_scale, &two),
        GizmoMode::None => unreachable!(),
    }
    let before = node_transform(&node);
    let handle = get_gizmo_handle(&context.overlay, handle_name);
    emit_pointer(
        &handle,
        PointerSignal::Down,
        projected_pointer(&context.camera, start.0, start.1),
    );
    emit_pointer(
        &handle,
        PointerSignal::Move,
        projected_pointer(&context.camera, end.0, end.1),
    );
    emit_pointer(
        &handle,
        PointerSignal::Up,
        projected_pointer(&context.camera, end.0, end.1),
    );
    assert_eq!(*began.lock().unwrap(), 1);
    assert_eq!(*ended.lock().unwrap(), 1);
    assert_same_transform(before, node_transform(&node));
    let result = match mode {
        GizmoMode::Rotate => vec![*one.lock().unwrap().last().unwrap()],
        GizmoMode::Scale | GizmoMode::Translate => {
            let value = *two.lock().unwrap().last().unwrap();
            vec![value.0, value.1]
        }
        GizmoMode::None => unreachable!(),
    };
    dispose_gizmo_state(&context.state);
    return result;
}

fn scale_delta(context: &TestContext, scale: f32) -> f32 {
    let values = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
    connect_pairs(&get_gizmo_signals(&context.state).on_scale, &values);
    let handle = get_gizmo_handle(&context.overlay, "GizmoScaleEastHandle");
    emit_pointer(&handle, PointerSignal::Down, pointer(110.0, 50.0, 1, false));
    emit_pointer(
        &handle,
        PointerSignal::Move,
        pointer(100.0 + 10.0 * scale, 50.0, 1, false),
    );
    emit_pointer(&handle, PointerSignal::Up, pointer(100.0, 50.0, 1, false));
    let value = values.lock().unwrap().last().unwrap().0;
    return value;
}

fn set_features(map: &FeatureMap, node: &NodeRef, value: TestNodeFeatures) {
    let mut map = map.write().unwrap();
    if let Some((_, existing)) = map
        .iter_mut()
        .find(|(candidate, _)| Arc::ptr_eq(candidate, node))
    {
        *existing = value;
    } else {
        map.push((node.clone(), value));
    }
}

fn shape_contains_number(node: &NodeRef, expected: f64) -> bool {
    let guard = node.read().unwrap();
    let shape = guard.as_any().downcast_ref::<Shape>().unwrap();
    return shape
        .data
        .commands
        .iter()
        .any(|token| matches!(token, ShapeCommandToken::Number(value) if *value == expected));
}

fn translation_delta(context: &TestContext, delta_x: f32) -> f32 {
    let values = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
    connect_pairs(&get_gizmo_signals(&context.state).on_translate, &values);
    let handle = get_gizmo_handle(&context.overlay, "GizmoTranslateXHandle");
    emit_pointer(&handle, PointerSignal::Down, pointer(172.0, 50.0, 1, false));
    emit_pointer(
        &handle,
        PointerSignal::Move,
        pointer(172.0 + delta_x, 50.0, 1, false),
    );
    emit_pointer(&handle, PointerSignal::Up, pointer(100.0, 50.0, 1, false));
    let value = values.lock().unwrap().last().unwrap().0;
    return value;
}
