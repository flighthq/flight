use std::sync::Arc;

use flight_entity::{Ref, allocate_entity};

use crate::flow_guards::report_flow_guard;
use crate::types::{FlowGuardKind, FlowGuardStateRef, FlowStack, FlowState};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::types::{FlowGuardState, FlowGuardStateRef};
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

pub fn create_flow_stack() -> Ref<FlowStack> {
    let mut out: FlowStack = allocate_entity();
    initialize_flow_stack(&mut out);
    return Ref::new(std::sync::RwLock::new(out));
}

/// Initialize a flow stack to its empty state, keeping the allocated runtime slot.
pub fn initialize_flow_stack(out: &mut FlowStack) {
    out.states = Vec::new();
}

/// Empty the stack, exiting every state top-to-bottom. Callbacks run after the stack write lock is
/// released, so they may re-enter other flow operations.
pub fn clear_flow_stack(stack: &Ref<FlowStack>) {
    let states = {
        let mut current = stack.write().unwrap();
        let states = current.states.clone();
        current.states.clear();
        states
    };
    for state in states.iter().rev() {
        let on_exit = state.read().unwrap().on_exit.clone();
        if let Some(on_exit) = on_exit {
            on_exit();
        }
    }
}

/// The active top of the stack, or None when the stack is empty.
pub fn get_active_flow_state(stack: &Ref<FlowStack>) -> Option<Ref<FlowState>> {
    return stack.read().unwrap().states.last().cloned();
}

/// The number of states on the stack.
pub fn get_flow_stack_depth(stack: &Ref<FlowStack>) -> usize {
    return stack.read().unwrap().states.len();
}

/// Fill `out` (cleared first) with the render-visible states bottom-to-top.
// D9b: out comes first.
// flight-lint: allow(conform-params) D9b: out parameter is first
pub fn get_flow_stack_visible_states(out: &mut Vec<Ref<FlowState>>, stack: &Ref<FlowStack>) {
    out.clear();
    let states = stack.read().unwrap();
    let top = states.states.len() as i32 - 1;
    if top < 0 {
        return;
    }
    let mut lowest = top as usize;
    while lowest > 0
        && states.states[lowest]
            .read()
            .unwrap()
            .render_below
            .unwrap_or(false)
    {
        lowest -= 1;
    }
    for index in lowest..=top as usize {
        out.push(states.states[index].clone());
    }
}

/// Pop the active top, exiting it and resuming the revealed state. None on an empty stack.
pub fn pop_flow_state(stack: &Ref<FlowStack>) -> Option<Ref<FlowState>> {
    let popped = {
        let mut current = stack.write().unwrap();
        current.states.pop()
    };
    let Some(popped) = popped else {
        return None;
    };
    let on_exit = popped.read().unwrap().on_exit.clone();
    if let Some(on_exit) = on_exit {
        on_exit();
    }
    let revealed = stack.read().unwrap().states.last().cloned();
    if let Some(revealed) = revealed {
        let on_resume = revealed.read().unwrap().on_resume.clone();
        if let Some(on_resume) = on_resume {
            on_resume();
        }
    }
    return Some(popped);
}

/// Push a shared state onto the stack: pause the previous top, push, then enter. Lifecycle callbacks
/// run with no stack or guard lock held, so a callback may re-enter push/replace on the same stack.
// flight-lint: allow(conform-params) D5: callback state is the shared FlowGuardState; the source stack remains the first argument
pub fn push_flow_state(stack: &Ref<FlowStack>, state: Ref<FlowState>, guards: &FlowGuardStateRef) {
    let depth = {
        let mut guard_state = guards.write().unwrap();
        let depth = guard_state.transition_depth;
        guard_state.transition_depth += 1;
        depth
    };
    if depth > 0 {
        report_flow_guard(guards, FlowGuardKind::TransitionDuringTransition);
    }
    let duplicate = stack
        .read()
        .unwrap()
        .states
        .iter()
        .any(|existing| Arc::ptr_eq(existing, &state));
    if duplicate {
        report_flow_guard(guards, FlowGuardKind::DuplicateStatePush);
    }
    let previous_top = stack.read().unwrap().states.last().cloned();
    let previous_on_pause =
        previous_top.and_then(|previous| previous.read().unwrap().on_pause.clone());
    let on_enter = state.read().unwrap().on_enter.clone();
    if let Some(on_pause) = previous_on_pause {
        on_pause();
    }
    stack.write().unwrap().states.push(state);
    if let Some(on_enter) = on_enter {
        on_enter();
    }
    guards.write().unwrap().transition_depth -= 1;
}

/// Swap the active top for a shared state in place; the state beneath is untouched and callbacks run
/// with no lock held.
// flight-lint: allow(conform-params) D5: callback state is the shared FlowGuardState; the source stack remains the first argument
pub fn replace_flow_state(
    stack: &Ref<FlowStack>,
    state: Ref<FlowState>,
    guards: &FlowGuardStateRef,
) {
    let depth = {
        let mut guard_state = guards.write().unwrap();
        let depth = guard_state.transition_depth;
        guard_state.transition_depth += 1;
        depth
    };
    if depth > 0 {
        report_flow_guard(guards, FlowGuardKind::TransitionDuringTransition);
    }
    let previous_top = {
        let mut current = stack.write().unwrap();
        if current.states.is_empty() {
            None
        } else {
            current.states.pop()
        }
    };
    if let Some(previous_top) = previous_top {
        let on_exit = previous_top.read().unwrap().on_exit.clone();
        if let Some(on_exit) = on_exit {
            on_exit();
        }
    }
    let on_enter = state.read().unwrap().on_enter.clone();
    stack.write().unwrap().states.push(state);
    if let Some(on_enter) = on_enter {
        on_enter();
    }
    guards.write().unwrap().transition_depth -= 1;
}

/// Tick one frame: the active top updates; each visited state with `update_below` also ticks the
/// state beneath it. Callbacks run with no lock held.
pub fn update_flow_stack(stack: &Ref<FlowStack>, delta_time: f32) {
    let states = stack.read().unwrap().states.clone();
    let mut index = states.len() as i32 - 1;
    if index < 0 {
        return;
    }
    loop {
        let state = &states[index as usize];
        let (on_update, update_below) = {
            let borrowed = state.read().unwrap();
            (
                borrowed.on_update.clone(),
                borrowed.update_below.unwrap_or(false),
            )
        };
        if let Some(on_update) = on_update {
            on_update(delta_time);
        }
        if index <= 0 || !update_below {
            break;
        }
        index -= 1;
    }
}

// ============================================================================
// D18 sugar: extension methods on the shared entity handle delegate to the contract
// ============================================================================

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
