use flight_entity::allocate_entity;

use crate::flow_guards::report_flow_guard;
use crate::types::{FlowGuardKind, FlowGuardStateRef, FlowStack, FlowState};
use flight_log::LogStateRef;

pub fn create_flow_stack() -> FlowStack {
    let mut out: FlowStack = allocate_entity();
    initialize_flow_stack(&mut out);
    return out;
}

/// Initialize a flow stack to its empty state, keeping the allocated runtime slot.
pub fn initialize_flow_stack(out: &mut FlowStack) {
    out.states = Vec::new();
}

/// Empty the stack, exiting every state top-to-bottom so each unwinds in reverse of the order it
/// entered. No `on_pause`/`on_resume` fire; after this the stack has depth 0.
pub fn clear_flow_stack(stack: &mut FlowStack) {
    let len = stack.states.len();
    for i in (0..len).rev() {
        if let Some(on_exit) = stack.states[i].on_exit.clone() {
            on_exit();
        }
    }
    stack.states.clear();
}

/// The active top of the stack, or None when the stack is empty.
pub fn get_active_flow_state(stack: &FlowStack) -> Option<&FlowState> {
    return stack.states.last();
}

/// The number of states on the stack.
pub fn get_flow_stack_depth(stack: &FlowStack) -> usize {
    return stack.states.len();
}

/// Fill `out` (cleared first) with the render-visible states in draw order, bottom-to-top: the
/// active top plus the contiguous run beneath it reachable through `render_below`.
// D9b: out comes first.
// flight-lint: allow(conform-params) D9b: out parameter is first
pub fn get_flow_stack_visible_states<'a>(out: &mut Vec<&'a FlowState>, stack: &'a FlowStack) {
    out.clear();
    let states = &stack.states;
    let top = states.len() as i32 - 1;
    if top < 0 {
        return;
    }
    let mut lowest = top as usize;
    while lowest > 0 && states[lowest].render_below.unwrap_or(false) {
        lowest -= 1;
    }
    for i in lowest..=top as usize {
        out.push(&states[i]);
    }
}

/// Pop the active top, exiting it and resuming the state it uncovers. None on an empty stack.
pub fn pop_flow_state(stack: &mut FlowStack) -> Option<FlowState> {
    if stack.states.is_empty() {
        return None;
    }
    let popped = stack.states.pop().unwrap();
    if let Some(on_exit) = popped.on_exit.clone() {
        on_exit();
    }
    if let Some(revealed) = stack.states.last() {
        if let Some(on_resume) = revealed.on_resume.clone() {
            on_resume();
        }
    }
    return Some(popped);
}

/// Push `state` onto the stack: pause the previous top, push, then enter the new state.
// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
// flight-lint: allow(conform-params) D5: explicit guard state, log state and operation time replace hidden globals and the clock
pub fn push_flow_state(
    stack: &mut FlowStack,
    state: FlowState,
    guards: &FlowGuardStateRef,
    log_state: &LogStateRef,
    now_ms: f64,
) {
    let depth = {
        let mut guard_state = guards.write().unwrap();
        let depth = guard_state.transition_depth;
        guard_state.transition_depth += 1;
        depth
    };
    if depth > 0 {
        report_flow_guard(guards, log_state, now_ms, FlowGuardKind::TransitionDuringTransition);
    }
    if let Some(ref name) = state.name {
        let duplicate = stack
            .states
            .iter()
            .any(|existing| existing.name.as_ref() == Some(name));
        if duplicate {
            report_flow_guard(guards, log_state, now_ms, FlowGuardKind::DuplicateStatePush);
        }
    }
    let previous_on_pause = stack.states.last().and_then(|s| s.on_pause.clone());
    let on_enter = state.on_enter.clone();
    if let Some(on_pause) = previous_on_pause {
        on_pause();
    }
    stack.states.push(state);
    if let Some(on_enter) = on_enter {
        on_enter();
    }
    guards.write().unwrap().transition_depth -= 1;
}

/// Swap the active top for `state` in place; the state beneath is not paused or resumed.
// flight-lint: allow(f64) D1: operation time is a millisecond timestamp
// flight-lint: allow(conform-params) D5: explicit guard state, log state and operation time replace hidden globals and the clock
pub fn replace_flow_state(
    stack: &mut FlowStack,
    state: FlowState,
    guards: &FlowGuardStateRef,
    log_state: &LogStateRef,
    now_ms: f64,
) {
    let depth = {
        let mut guard_state = guards.write().unwrap();
        let depth = guard_state.transition_depth;
        guard_state.transition_depth += 1;
        depth
    };
    if depth > 0 {
        report_flow_guard(guards, log_state, now_ms, FlowGuardKind::TransitionDuringTransition);
    }
    if !stack.states.is_empty() {
        let previous_top = stack.states.pop().unwrap();
        if let Some(on_exit) = previous_top.on_exit.clone() {
            on_exit();
        }
    }
    let on_enter = state.on_enter.clone();
    stack.states.push(state);
    if let Some(on_enter) = on_enter {
        on_enter();
    }
    guards.write().unwrap().transition_depth -= 1;
}

/// Tick one frame: the active top always updates; each visited state with `update_below` also ticks
/// the state immediately beneath it, until a visited state does not set `update_below`.
pub fn update_flow_stack(stack: &FlowStack, delta_time: f32) {
    let states = &stack.states;
    let mut index = states.len() as i32 - 1;
    if index < 0 {
        return;
    }
    if let Some(on_update) = states[index as usize].on_update.clone() {
        on_update(delta_time);
    }
    while index > 0 && states[index as usize].update_below.unwrap_or(false) {
        index -= 1;
        if let Some(on_update) = states[index as usize].on_update.clone() {
            on_update(delta_time);
        }
    }
}
