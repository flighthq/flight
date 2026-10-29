//! flight-compiler: target-native

use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_flow::contract::*;

fn guard_state() -> FlowGuardStateRef {
    return Arc::new(RwLock::new(FlowGuardState {
        enabled: false,
        transition_depth: 0,
        context: None,
    }));
}

fn panicking_on_enter() -> Ref<FlowState> {
    return Arc::new(RwLock::new(FlowState {
        name: Some("panics".to_string()),
        on_enter: Some(Arc::new(|| panic!("on_enter failed"))),
        on_exit: None,
        on_pause: None,
        on_resume: None,
        on_update: None,
        render_below: None,
        update_below: None,
    }));
}

#[test]
fn push_restores_transition_depth_when_a_callback_panics() {
    let stack = create_flow_stack();
    let guards = guard_state();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        push_flow_state(&stack, panicking_on_enter(), &guards);
    }));
    assert!(result.is_err());
    assert_eq!(guards.read().unwrap().transition_depth, 0);
}

#[test]
fn replace_restores_transition_depth_when_a_callback_panics() {
    let stack = create_flow_stack();
    let guards = guard_state();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        replace_flow_state(&stack, panicking_on_enter(), &guards);
    }));
    assert!(result.is_err());
    assert_eq!(guards.read().unwrap().transition_depth, 0);
}
