use flight_entity::Ref;
use flight_gui::contract::*;
use flight_interaction::contract::{
    HitArea, InteractionSignalName, get_node_interaction_state, is_node_hit_test_enabled,
};
use flight_scene2d::Node2DRef;
use flight_signals::{create_signal, emit_signal};
use std::sync::{Arc, RwLock};

mod clamp_gui_value {
    use super::*;
    #[test]
    fn clamps_finite_values_and_normalizes_reversed_bounds() {
        assert_eq!(clamp_gui_value(8.0, 0.0, 5.0), 5.0);
        assert_eq!(clamp_gui_value(2.0, 5.0, 0.0), 2.0);
        assert_eq!(clamp_gui_value(f32::NAN, 2.0, 5.0), 2.0);
    }
}
mod configure_gui_hit_area {
    use super::*;
    #[test]
    fn restores_a_caller_hit_area_on_disposal() {
        let target: Node2DRef = create_gui_test_node(None, None);
        let area: Node2DRef = create_gui_test_node(None, None);
        let node: flight_node::NodeRef = target.clone();
        let runtime = create_gui_controller_runtime((), None);
        let controller = create_gui_controller(runtime.clone());
        configure_gui_hit_area(&runtime, &target, &area);
        let state = get_node_interaction_state(&node).unwrap();
        {
            let guard = state.read().unwrap();
            let Some(HitArea::Node(found)) = &guard.hit_area else {
                panic!("node hit area");
            };
            assert!(std::ptr::addr_eq(Arc::as_ptr(found), Arc::as_ptr(&area)));
        }
        dispose_gui_controller(&controller, &|| {});
        assert!(state.read().unwrap().hit_area.is_none());
    }
    #[test]
    fn preserves_the_original_node_area_identity_and_restores_it_after_nested_cleanup_in_reverse_order()
     {
        let target: Node2DRef = create_gui_test_node(None, None);
        let first: Node2DRef = create_gui_test_node(None, None);
        let second: Node2DRef = create_gui_test_node(None, None);
        let original: Node2DRef = create_gui_test_node(None, None);
        let node: flight_node::NodeRef = target.clone();
        flight_interaction::contract::set_node_hit_area(
            &node,
            Some(HitArea::Node(original.clone())),
        );
        let runtime = create_gui_controller_runtime((), None);
        let controller = create_gui_controller(runtime.clone());
        configure_gui_hit_area(&runtime, &target, &first);
        configure_gui_hit_area(&runtime, &target, &second);
        dispose_gui_controller(&controller, &|| {});
        let state = get_node_interaction_state(&node).unwrap();
        let state = state.read().unwrap();
        let Some(HitArea::Node(found)) = &state.hit_area else {
            panic!("original area");
        };
        assert!(std::ptr::addr_eq(
            Arc::as_ptr(found),
            Arc::as_ptr(&original)
        ));
    }
}
mod connect_gui_interaction {
    use super::*;
    #[test]
    fn connects_input_and_restores_hit_test_state() {
        let target: Node2DRef = create_gui_test_node(None, None);
        let runtime = create_gui_controller_runtime((), None);
        let controller = create_gui_controller(runtime.clone());
        let calls = Arc::new(RwLock::new(0));
        let retained = calls.clone();
        connect_gui_interaction(
            &runtime,
            &target,
            InteractionSignalName::OnClick,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| *retained.write().unwrap() += 1),
            }),
        );
        emit_gui_pointer(&target, InteractionSignalName::OnClick, None);
        assert_eq!(*calls.read().unwrap(), 1);
        dispose_gui_controller(&controller, &|| {});
        let node: flight_node::NodeRef = target;
        assert!(!is_node_hit_test_enabled(&node));
    }
}
mod connect_gui_signal {
    use super::*;
    #[test]
    fn disconnects_a_generic_signal_on_disposal() {
        let signal = Arc::new(RwLock::new(create_signal::<()>()));
        let runtime = create_gui_controller_runtime((), None);
        let controller = create_gui_controller(runtime.clone());
        let calls = Arc::new(RwLock::new(0));
        let copy = calls.clone();
        connect_gui_signal(
            &runtime,
            &signal,
            Arc::new(move |_| *copy.write().unwrap() += 1),
        );
        dispose_gui_controller(&controller, &|| {});
        emit_signal(&signal.read().unwrap(), &());
        assert_eq!(*calls.read().unwrap(), 0);
    }
}
mod create_gui_controller {
    use super::*;
    #[test]
    fn stores_the_supplied_runtime() {
        let runtime = create_gui_controller_runtime(4, None);
        let controller = create_gui_controller(runtime);
        assert_eq!(
            get_gui_controller_runtime(&controller)
                .read()
                .unwrap()
                .fields,
            4
        );
    }
}
mod create_gui_controller_runtime {
    use super::*;
    #[test]
    fn starts_undisposed_with_no_transition() {
        let runtime = create_gui_controller_runtime((), None);
        let runtime = runtime.read().unwrap();
        assert!(!runtime.disposed);
        assert!(runtime.transition.is_none());
    }
}
mod dispose_gui_controller {
    use super::*;
    #[test]
    fn runs_clear_once() {
        let runtime = create_gui_controller_runtime((), None);
        let controller = create_gui_controller(runtime);
        let clears = Arc::new(RwLock::new(0));
        dispose_gui_controller(&controller, &|| *clears.write().unwrap() += 1);
        dispose_gui_controller(&controller, &|| *clears.write().unwrap() += 1);
        assert_eq!(*clears.read().unwrap(), 1);
    }
    #[test]
    fn releases_the_runtime_before_lifo_cleanups_and_clear_reenter_it() {
        let runtime = create_gui_controller_runtime((), None);
        let controller = create_gui_controller(runtime.clone());
        let seen = Arc::new(RwLock::new(Vec::new()));
        for value in [1, 2] {
            let retained_runtime = runtime.clone();
            let seen = seen.clone();
            let cleanup = Arc::new(move || {
                assert!(retained_runtime.try_write().is_ok());
                assert_eq!(retained_runtime.read().unwrap().cleanups.len(), 2);
                seen.write().unwrap().push(value);
            });
            runtime.write().unwrap().cleanups.push(cleanup);
        }
        dispose_gui_controller(&controller, &|| {
            assert!(runtime.read().unwrap().disposed);
            seen.write().unwrap().push(3);
        });
        assert_eq!(*seen.read().unwrap(), [2, 1, 3]);
    }
}
mod get_gui_controller_runtime {
    use super::*;
    #[test]
    fn returns_the_exact_runtime_identity() {
        let runtime = create_gui_controller_runtime((), None);
        let controller = create_gui_controller(runtime.clone());
        assert!(Arc::ptr_eq(
            &get_gui_controller_runtime(&controller),
            &runtime
        ));
    }
}
mod get_gui_length {
    use super::*;
    #[test]
    fn reads_the_requested_bounded_axis() {
        let node: Node2DRef = create_gui_test_node(Some(30.0), Some(40.0));
        assert_eq!(
            [
                get_gui_length(&node, GuiOrientation::Horizontal),
                get_gui_length(&node, GuiOrientation::Vertical)
            ],
            [30.0, 40.0]
        );
    }
}
mod get_gui_orientation_string {
    use super::*;
    #[test]
    fn returns_the_exact_declared_orientation_names() {
        assert_eq!(
            get_gui_orientation_string(GuiOrientation::Horizontal),
            "horizontal"
        );
        assert_eq!(
            get_gui_orientation_string(GuiOrientation::Vertical),
            "vertical"
        );
    }
}
mod get_gui_position {
    use super::*;
    #[test]
    fn reads_the_requested_transform_axis() {
        let node = create_gui_test_node(None, None);
        {
            let mut node = node.write().unwrap();
            node.x = 3.0;
            node.y = 4.0;
        }
        let handle: Node2DRef = node;
        assert_eq!(
            [
                get_gui_position(&handle, GuiOrientation::Horizontal),
                get_gui_position(&handle, GuiOrientation::Vertical)
            ],
            [3.0, 4.0]
        );
    }
}
mod initialize_gui_controller {
    use super::*;
    #[test]
    fn adopts_the_supplied_state_without_replacing_uid_binding_or_entity_id() {
        let mut out: GuiController<i32> = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&out);
        let uid = flight_entity::get_entity_uid(&mut out);
        flight_entity::attach_entity_binding(&mut out, Box::new(47_u32));
        let runtime = create_gui_controller_runtime(4, None);
        initialize_gui_controller(&mut out, runtime.clone());
        assert_eq!(flight_entity::get_entity_id(&out), id);
        assert_eq!(flight_entity::get_entity_uid(&mut out), uid);
        assert!(Arc::ptr_eq(&get_gui_controller_runtime(&out), &runtime));
        assert_eq!(
            flight_entity::get_entity_binding_as::<u32, _>(&out),
            Some(&47_u32)
        );
    }
}
mod parse_gui_orientation {
    use super::*;
    #[test]
    fn accepts_only_the_exact_declared_names() {
        assert_eq!(
            parse_gui_orientation("horizontal"),
            Some(GuiOrientation::Horizontal)
        );
        assert_eq!(
            parse_gui_orientation("vertical"),
            Some(GuiOrientation::Vertical)
        );
        assert_eq!(parse_gui_orientation("Horizontal"), None);
    }
}
mod set_gui_position {
    use super::*;
    #[test]
    fn sets_one_axis() {
        let runtime = create_gui_controller_runtime((), None);
        let node = create_gui_test_node(None, None);
        let handle: Node2DRef = node.clone();
        set_gui_position(&runtime, Some(&handle), GuiOrientation::Vertical, 5.0);
        assert_eq!(node.read().unwrap().y, 5.0);
    }
}
mod set_gui_scale {
    use super::*;
    #[test]
    fn sets_one_scale_axis() {
        let runtime = create_gui_controller_runtime((), None);
        let node = create_gui_test_node(None, None);
        let handle: Node2DRef = node.clone();
        set_gui_scale(&runtime, Some(&handle), GuiOrientation::Horizontal, 0.5);
        assert_eq!(node.read().unwrap().scale_x, 0.5);
    }
}
mod set_gui_visible {
    use super::*;
    #[test]
    fn sets_visibility_directly_by_default() {
        let runtime = create_gui_controller_runtime((), None);
        let node = create_gui_test_node(None, None);
        let handle: Node2DRef = node.clone();
        set_gui_visible(&runtime, Some(&handle), false);
        assert!(!node.read().unwrap().visible);
    }
}
mod set_gui_visual_property {
    use super::*;
    #[test]
    fn offers_intermediate_writes_to_an_opt_in_transition() {
        let node = create_gui_test_node(None, None);
        let handle: Node2DRef = node.clone();
        let runtime = create_gui_controller_runtime(
            (),
            Some(Arc::new(GuiTransitionDescriptor {
                run: Arc::new(|request| (request.apply)(Some(GuiTransitionValue::Number(0.5)))),
            })),
        );
        set_gui_visual_property(
            &runtime,
            Some(&handle),
            GuiTransitionProperty::Alpha,
            GuiTransitionValue::Number(0.0),
        );
        assert_eq!(node.read().unwrap().alpha, 0.5);
    }
    #[test]
    fn permits_guard_free_reentry_retained_applies_and_source_type_checks_even_after_disposal() {
        let node = create_gui_test_node(None, None);
        let handle: Node2DRef = node.clone();
        let requests: Ref<Vec<GuiTransitionRequest>> = Arc::new(RwLock::new(Vec::new()));
        let retained = requests.clone();
        let runtime = create_gui_controller_runtime(
            (),
            Some(Arc::new(GuiTransitionDescriptor {
                run: Arc::new(move |request| retained.write().unwrap().push(request.clone())),
            })),
        );
        set_gui_visual_property(
            &runtime,
            Some(&handle),
            GuiTransitionProperty::X,
            GuiTransitionValue::Number(8.0),
        );
        let request = requests.read().unwrap()[0].clone();
        assert_eq!(request.property, "x");
        assert!(std::ptr::addr_eq(
            Arc::as_ptr(&request.target),
            Arc::as_ptr(&handle)
        ));
        (request.apply)(Some(GuiTransitionValue::Boolean(false)));
        assert_eq!(node.read().unwrap().x, 0.0);
        let controller = create_gui_controller(runtime);
        dispose_gui_controller(&controller, &|| {});
        (request.apply)(Some(GuiTransitionValue::Number(3.0)));
        assert_eq!(node.read().unwrap().x, 3.0);
        (request.apply)(None);
        assert_eq!(node.read().unwrap().x, 8.0);
    }
}
mod snap_gui_value {
    use super::*;
    #[test]
    fn preserves_the_source_rounded_grid_index_at_f32_boundaries() {
        assert_eq!(snap_gui_value(0.49999997, 0.0, Some(1.0)), 0.0);
        assert_eq!(snap_gui_value(-2.0_f32.powi(-25), -1.0, Some(2.0)), -1.0);
    }
    #[test]
    fn snaps_around_the_minimum() {
        assert_eq!(snap_gui_value(3.1, 1.0, Some(2.0)), 3.0);
        assert_eq!(snap_gui_value(3.1, 1.0, None), 3.1);
        assert_eq!(snap_gui_value(-1.0, 0.0, Some(2.0)), 0.0);
    }
}
