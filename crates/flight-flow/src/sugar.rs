//! D18 sugar: extension methods on the shared flow handles. Every method delegates to the free-function
//! contract and keeps the caller-owned guard state visible, so a method call cannot hide it.

use std::sync::Arc;

use flight_entity::Ref;

use crate::flow::*;
use crate::flow_guards::{disable_flow_guards, enable_flow_guards};
use crate::flow_types::{FlowStack, FlowState};

#[cfg(test)]
mod flow_guard_state_sugar_tests {
    use super::*;
    use crate::types::FlowGuardState;
    use std::sync::RwLock;

    fn guard_state() -> FlowGuardStateRef {
        return Arc::new(RwLock::new(FlowGuardState {
            enabled: false,
            transition_depth: 0,
            context: None,
        }));
    }

    fn log_state() -> flight_log::LogStateRef {
        return Arc::new(RwLock::new(flight_log::create_log_state()));
    }

    #[test]
    fn guard_enable_matches_the_free_function() {
        let via_method = guard_state();
        let via_free = guard_state();
        let state = log_state();
        via_method.enable_guards(&state, Arc::new(|| 0.0));
        enable_flow_guards(via_free.clone(), state.clone(), Arc::new(|| 0.0));
        assert_eq!(
            via_method.read().unwrap().enabled,
            via_free.read().unwrap().enabled
        );
    }

    #[test]
    fn guard_disable_matches_the_free_function() {
        let via_method = guard_state();
        let via_free = guard_state();
        let state = log_state();
        enable_flow_guards(via_method.clone(), state.clone(), Arc::new(|| 0.0));
        enable_flow_guards(via_free.clone(), state.clone(), Arc::new(|| 0.0));
        via_method.disable_guards();
        disable_flow_guards(via_free.clone());
        assert_eq!(
            via_method.read().unwrap().enabled,
            via_free.read().unwrap().enabled
        );
    }
}

#[cfg(test)]
mod flow_stack_sugar_tests {
    use super::*;
    use crate::types::FlowGuardState;
    use std::sync::{Arc, Mutex, RwLock};

    fn guard_state() -> FlowGuardStateRef {
        return Arc::new(RwLock::new(FlowGuardState {
            enabled: false,
            transition_depth: 0,
            context: None,
        }));
    }

    fn plain(name: &str) -> Ref<FlowState> {
        return Arc::new(RwLock::new(FlowState {
            name: Some(name.to_string()),
            on_enter: None,
            on_exit: None,
            on_pause: None,
            on_resume: None,
            on_update: None,
            render_below: None,
            update_below: None,
        }));
    }

    #[test]
    fn flow_stack_new_matches_create_flow_stack() {
        let via_new = FlowStack::new();
        let via_free = create_flow_stack();
        assert_eq!(via_new.stack_depth(), via_free.stack_depth());
    }

    #[test]
    fn flow_stack_active_state_matches_the_free_function() {
        let stack = create_flow_stack();
        let guards = guard_state();
        stack.push_state(plain("A"), &guards);
        assert!(Arc::ptr_eq(
            &stack.active_state().unwrap(),
            &get_active_flow_state(&stack).unwrap()
        ));
    }

    #[test]
    fn flow_stack_clear_matches_the_free_function() {
        let stack = create_flow_stack();
        let other = create_flow_stack();
        let guards = guard_state();
        stack.push_state(plain("A"), &guards);
        other.push_state(plain("A"), &guards);
        stack.clear_stack();
        clear_flow_stack(&other);
        assert_eq!(stack.stack_depth(), other.stack_depth());
    }

    #[test]
    fn flow_stack_depth_matches_the_free_function() {
        let stack = create_flow_stack();
        let guards = guard_state();
        stack.push_state(plain("A"), &guards);
        assert_eq!(stack.stack_depth(), get_flow_stack_depth(&stack));
    }

    #[test]
    fn flow_stack_pop_matches_the_free_function() {
        let stack = create_flow_stack();
        let other = create_flow_stack();
        let guards = guard_state();
        stack.push_state(plain("A"), &guards);
        other.push_state(plain("A"), &guards);
        assert_eq!(
            stack.pop_state().unwrap().read().unwrap().name,
            pop_flow_state(&other).unwrap().read().unwrap().name
        );
    }

    #[test]
    fn flow_stack_push_matches_the_free_function() {
        let stack = create_flow_stack();
        let other = create_flow_stack();
        let guards = guard_state();
        stack.push_state(plain("A"), &guards);
        push_flow_state(&other, plain("A"), &guards);
        assert_eq!(stack.stack_depth(), other.stack_depth());
    }

    #[test]
    fn flow_stack_replace_matches_the_free_function() {
        let stack = create_flow_stack();
        let other = create_flow_stack();
        let guards = guard_state();
        stack.push_state(plain("A"), &guards);
        other.push_state(plain("A"), &guards);
        stack.replace_state(plain("B"), &guards);
        replace_flow_state(&other, plain("B"), &guards);
        assert_eq!(
            stack.active_state().unwrap().read().unwrap().name,
            get_active_flow_state(&other).unwrap().read().unwrap().name
        );
    }

    #[test]
    fn flow_stack_update_matches_the_free_function() {
        let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let stack = create_flow_stack();
        let other = create_flow_stack();
        let guards = guard_state();
        let mut state = FlowState {
            name: Some("A".to_string()),
            on_enter: None,
            on_exit: None,
            on_pause: None,
            on_resume: None,
            on_update: None,
            render_below: None,
            update_below: None,
        };
        let update_log = log.clone();
        state.on_update = Some(Arc::new(move |_dt: f32| {
            update_log.lock().unwrap().push("tick".to_string())
        }));
        let state = Arc::new(RwLock::new(state));
        stack.push_state(state.clone(), &guards);
        other.push_state(state, &guards);
        stack.update_stack(0.5);
        update_flow_stack(&other, 0.5);
        assert_eq!(*log.lock().unwrap(), vec!["tick", "tick"]);
    }

    #[test]
    fn flow_stack_visible_states_matches_the_free_function() {
        let stack = create_flow_stack();
        let guards = guard_state();
        stack.push_state(plain("A"), &guards);
        let mut via_method = Vec::new();
        let mut via_free = Vec::new();
        stack.visible_states(&mut via_method);
        get_flow_stack_visible_states(&mut via_free, &stack);
        assert_eq!(via_method.len(), via_free.len());
        assert!(Arc::ptr_eq(&via_method[0], &via_free[0]));
    }
}

/// Sugar for the shared guard state handle; delegates to the contract.
pub trait FlowGuardStateMethods {
    fn disable_guards(&self);
    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    fn enable_guards(
        &self,
        log_state: &flight_log::LogStateRef,
        clock: Arc<dyn Fn() -> f64 + Send + Sync>,
    );
}

impl FlowGuardStateMethods for FlowGuardStateRef {
    fn disable_guards(&self) {
        disable_flow_guards(self.clone());
    }

    // flight-lint: allow(f64) D1: the injected clock returns millisecond operation time
    fn enable_guards(
        &self,
        log_state: &flight_log::LogStateRef,
        clock: Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        enable_flow_guards(self.clone(), log_state.clone(), clock);
    }
}

/// Sugar for the shared FlowStack handle (TS `FlowStack` object). Rust entity operations take the
/// shared `Ref<FlowStack>` handle, so methods live on that handle rather than on the value type.
pub trait FlowStackMethods {
    fn active_state(&self) -> Option<Ref<FlowState>>;
    fn clear_stack(&self);
    fn pop_state(&self) -> Option<Ref<FlowState>>;
    fn push_state(&self, state: Ref<FlowState>, guards: &FlowGuardStateRef);
    fn replace_state(&self, state: Ref<FlowState>, guards: &FlowGuardStateRef);
    fn stack_depth(&self) -> usize;
    fn update_stack(&self, delta_time: f32);
    fn visible_states(&self, out: &mut Vec<Ref<FlowState>>);
}

impl FlowStackMethods for Ref<FlowStack> {
    fn active_state(&self) -> Option<Ref<FlowState>> {
        return get_active_flow_state(self);
    }
    fn clear_stack(&self) {
        clear_flow_stack(self);
    }
    fn pop_state(&self) -> Option<Ref<FlowState>> {
        return pop_flow_state(self);
    }
    fn push_state(&self, state: Ref<FlowState>, guards: &FlowGuardStateRef) {
        push_flow_state(self, state, guards);
    }
    fn replace_state(&self, state: Ref<FlowState>, guards: &FlowGuardStateRef) {
        replace_flow_state(self, state, guards);
    }
    fn stack_depth(&self) -> usize {
        return get_flow_stack_depth(self);
    }
    fn update_stack(&self, delta_time: f32) {
        update_flow_stack(self, delta_time);
    }
    fn visible_states(&self, out: &mut Vec<Ref<FlowState>>) {
        get_flow_stack_visible_states(out, self);
    }
}

impl FlowStack {
    pub fn new() -> Ref<FlowStack> {
        return create_flow_stack();
    }
}
