//! flight-compiler: nullable-options

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::flow_guards::report_flow_guard;
use crate::flow_transitions::run_flow_transition;
use crate::flow_types::{FlowCallback, FlowStack, FlowState};
use crate::types::{FlowGuardKind, FlowGuardState};

/// Shared caller-owned flow-guard state.
pub type FlowGuardStateRef = Ref<FlowGuardState>;

pub fn create_flow_stack() -> Ref<FlowStack> {
    let mut out: FlowStack = allocate_entity();
    initialize_flow_stack(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Initialize a flow stack to its empty state, keeping the allocated runtime slot.
pub fn initialize_flow_stack(out: &mut FlowStack) {
    out.states = Vec::new();
}

/// Empty the stack, exiting every state top-to-bottom. Callbacks run after the stack write lock is
/// released, so they may re-enter other flow operations.
pub fn clear_flow_stack(stack: &Ref<FlowStack>) {
    // Exit top-to-bottom while the states are still on the stack, so an `on_exit` that queries the
    // stack sees it as it stood; empty it only after every exit has run. No lock is held across a
    // callback, and each index is re-read so a callback that shrinks the stack is skipped past.
    let mut index = stack.read().unwrap().states.len();
    while index > 0 {
        index -= 1;
        let maybe_on_exit = {
            let current = stack.read().unwrap();
            if index < current.states.len() {
                current.states[index].read().unwrap().on_exit.clone()
            } else {
                None
            }
        };
        let callback = maybe_on_exit.unwrap_or(Arc::new(no_flow_callback));
        callback();
    }
    stack.write().unwrap().states.clear();
}

/// The active top of the stack, or None when the stack is empty.
pub fn get_active_flow_state(stack: &Ref<FlowStack>) -> Option<Ref<FlowState>> {
    let current = stack.read().unwrap();
    if current.states.is_empty() {
        return None;
    }
    return Some(current.states[current.states.len() - 1].clone());
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

fn get_flow_state_on_pause(state: Option<Ref<FlowState>>) -> FlowCallback {
    if let Some(previous) = state {
        return previous
            .read()
            .unwrap()
            .on_pause
            .clone()
            .unwrap_or(Arc::new(no_flow_callback));
    }
    return Arc::new(no_flow_callback);
}

fn no_flow_callback() {}

fn no_flow_update_callback(delta_time: f32) {
    if delta_time.is_nan() {
        return;
    }
}

/// Pop the active top, exiting it and resuming the revealed state. None on an empty stack.
pub fn pop_flow_state(stack: &Ref<FlowStack>) -> Option<Ref<FlowState>> {
    let popped: Ref<FlowState>;
    let maybe_popped = take_top_flow_state(stack);
    if let Some(value) = maybe_popped {
        popped = value;
    } else {
        return None;
    }
    let maybe_on_exit = popped.read().unwrap().on_exit.clone();
    let exit_callback = maybe_on_exit.unwrap_or(Arc::new(no_flow_callback));
    exit_callback();
    let maybe_revealed = {
        let current = stack.read().unwrap();
        if current.states.is_empty() {
            None
        } else {
            Some(current.states[current.states.len() - 1].clone())
        }
    };
    if let Some(revealed_state) = maybe_revealed {
        let maybe_on_resume = revealed_state.read().unwrap().on_resume.clone();
        let resume_callback = maybe_on_resume.unwrap_or(Arc::new(no_flow_callback));
        resume_callback();
    }
    return Some(popped);
}

/// Portable push behavior: pause the previous top, push, then enter. Target-native wrappers own the
/// balanced unwind scope and pass the depth they observed.
// flight-lint: allow(conform-params) D5: callback state is the shared FlowGuardState; the source stack remains the first argument
pub fn push_flow_state(stack: &Ref<FlowStack>, state: Ref<FlowState>, guards: &FlowGuardStateRef) {
    let transition_stack = stack.clone();
    let transition_guards = guards.clone();
    run_flow_transition(
        guards,
        Arc::new(move |depth| {
            push_flow_state_core(&transition_stack, state.clone(), &transition_guards, depth);
        }),
    );
}

fn push_flow_state_core(
    stack: &Ref<FlowStack>,
    state: Ref<FlowState>,
    guards: &FlowGuardStateRef,
    depth: u32,
) {
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
    let previous_top = {
        let current = stack.read().unwrap();
        if current.states.is_empty() {
            None
        } else {
            Some(current.states[current.states.len() - 1].clone())
        }
    };
    let previous_on_pause = get_flow_state_on_pause(previous_top);
    let maybe_on_enter = state.read().unwrap().on_enter.clone();
    previous_on_pause();
    stack.write().unwrap().states.push(state);
    let enter_callback = maybe_on_enter.unwrap_or(Arc::new(no_flow_callback));
    enter_callback();
}

/// Portable replace behavior: swap the active top in place without touching the state beneath.
// flight-lint: allow(conform-params) D5: callback state is the shared FlowGuardState; the source stack remains the first argument
pub fn replace_flow_state(
    stack: &Ref<FlowStack>,
    state: Ref<FlowState>,
    guards: &FlowGuardStateRef,
) {
    let transition_stack = stack.clone();
    let transition_guards = guards.clone();
    run_flow_transition(
        guards,
        Arc::new(move |depth| {
            replace_flow_state_core(&transition_stack, state.clone(), &transition_guards, depth);
        }),
    );
}

fn replace_flow_state_core(
    stack: &Ref<FlowStack>,
    state: Ref<FlowState>,
    guards: &FlowGuardStateRef,
    depth: u32,
) {
    if depth > 0 {
        report_flow_guard(guards, FlowGuardKind::TransitionDuringTransition);
    }
    let maybe_previous_top = take_top_flow_state(stack);
    if let Some(previous_state) = maybe_previous_top {
        let maybe_on_exit = previous_state.read().unwrap().on_exit.clone();
        let exit_callback = maybe_on_exit.unwrap_or(Arc::new(no_flow_callback));
        exit_callback();
    }
    let maybe_on_enter = state.read().unwrap().on_enter.clone();
    stack.write().unwrap().states.push(state);
    let enter_callback = maybe_on_enter.unwrap_or(Arc::new(no_flow_callback));
    enter_callback();
}

// Removes and returns the last state while retaining the identity of the caller-owned `states`
// vector/array. Rebuilding through clear/push is portable to both targets; direct Vec::pop has no
// compiler lowering.
fn take_top_flow_state(stack: &Ref<FlowStack>) -> Option<Ref<FlowState>> {
    let mut current = stack.write().unwrap();
    if current.states.is_empty() {
        return None;
    }
    let top = current.states.len() - 1;
    let mut previous: Vec<Ref<FlowState>> = Vec::new();
    for state in current.states.iter() {
        previous.push(state.clone());
    }
    let popped = previous[top].clone();
    current.states.clear();
    for item in previous.iter() {
        if current.states.len() >= top {
            break;
        }
        current.states.push(item.clone());
    }
    return Some(popped);
}

/// Tick one frame: the active top updates; each visited state with `update_below` also ticks the
/// state beneath it. Callbacks run with no lock held.
pub fn update_flow_stack(stack: &Ref<FlowStack>, delta_time: f32) {
    let states = stack.read().unwrap().states.to_vec();
    let mut index = states.len() as i32 - 1;
    if index < 0 {
        return;
    }
    loop {
        let state = &states[index as usize];
        let (maybe_on_update, update_below) = {
            let borrowed = state.read().unwrap();
            (
                borrowed.on_update.clone(),
                borrowed.update_below.unwrap_or(false),
            )
        };
        let callback = maybe_on_update.unwrap_or(Arc::new(no_flow_update_callback));
        callback(delta_time);
        if index <= 0 || !update_below {
            break;
        }
        index -= 1;
    }
}
