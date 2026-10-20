use std::cell::Cell;

use crate::FlowGuardKind;
use crate::FlowStack;
use crate::FlowState;
use crate::report_flow_guard;

/// Empty the stack, exiting every state top-to-bottom (`on_exit` on the active
/// top first, down to the bottom) so each unwinds in reverse of the order it
/// entered. No `on_pause`/`on_resume` fire — the whole stack is being torn
/// down, not layered. After this the stack has depth 0.
pub fn clear_flow_stack(stack: &mut FlowStack) {
    let len = stack.states.len();
    for i in (0..len).rev() {
        if let Some(on_exit) = stack.states[i].on_exit {
            on_exit();
        }
    }
    stack.states.clear();
}

/// Allocate and return a new, empty flow-state stack.
pub fn create_flow_stack() -> FlowStack {
    let mut out = FlowStack::default();
    initialize_flow_stack(&mut out);
    return out;
}

/// The active top of the stack — the state currently receiving `on_update` — or
/// `None` if the stack is empty.
pub fn get_active_flow_state(stack: &FlowStack) -> Option<&FlowState> {
    return stack.states.last();
}

/// The number of states on the stack.
pub fn get_flow_stack_depth(stack: &FlowStack) -> usize {
    return stack.states.len();
}

/// Fill `out` (cleared first) with the render-visible states in draw order,
/// bottom-to-top: the active top plus the contiguous run of states beneath it
/// reachable through `render_below`. Walking down from the top, each state that
/// sets `render_below` keeps the one beneath it visible; the walk stops at the
/// first opaque state (no `render_below`), which is itself visible but hides
/// everything below it. The caller draws `out` front-to-back (index 0 first) so
/// higher states paint over lower ones. `out` is empty for an empty stack.
pub fn get_flow_stack_visible_states<'a>(stack: &'a FlowStack, out: &mut Vec<&'a FlowState>) {
    out.clear();
    let states = &stack.states;
    let top = states.len() as i32 - 1;
    if top < 0 {
        return;
    }
    let mut lowest = top as usize;
    while lowest > 0 && states[lowest].render_below {
        lowest -= 1;
    }
    for i in lowest..=top as usize {
        out.push(&states[i]);
    }
}

/// Initialize a flow stack to its empty default state.
pub fn initialize_flow_stack(out: &mut FlowStack) {
    out.states = Vec::new();
}

/// Pop the active top off the stack, exiting it (`on_exit`) and resuming the
/// state it uncovers (`on_resume`) — the mirror of `push_flow_state`. Returns
/// the popped state, or `None` if the stack was empty.
pub fn pop_flow_state(stack: &mut FlowStack) -> Option<FlowState> {
    if stack.states.is_empty() {
        return None;
    }
    let popped = stack.states.pop().unwrap();
    if let Some(on_exit) = popped.on_exit {
        on_exit();
    }
    if let Some(revealed) = stack.states.last() {
        if let Some(on_resume) = revealed.on_resume {
            on_resume();
        }
    }
    return Some(popped);
}

/// Push `state` onto the stack, making it the active top. The previous top (if
/// any) is paused first (`on_pause`), then `state` is pushed and entered
/// (`on_enter`) — pause-then-enter, so the outgoing state is suspended before
/// the incoming one starts.
pub fn push_flow_state(stack: &mut FlowStack, state: FlowState) {
    TRANSITION_DEPTH.with(|d| {
        if d.get() > 0 {
            report_flow_guard(FlowGuardKind::TransitionDuringTransition);
        }
    });
    // Duplicate-state check: compare by name when both have one.
    if let Some(ref name) = state.name {
        for existing in &stack.states {
            if let Some(ref existing_name) = existing.name {
                if existing_name == name {
                    report_flow_guard(FlowGuardKind::DuplicateStatePush);
                    break;
                }
            }
        }
    }
    let previous_on_pause = stack.states.last().and_then(|s| s.on_pause);
    let on_enter = state.on_enter;
    TRANSITION_DEPTH.with(|d| d.set(d.get() + 1));
    if let Some(on_pause) = previous_on_pause {
        on_pause();
    }
    stack.states.push(state);
    if let Some(on_enter) = on_enter {
        on_enter();
    }
    TRANSITION_DEPTH.with(|d| d.set(d.get() - 1));
}

/// Swap the active top for `state` in place, keeping the stack depth the same.
/// The current top (if any) exits (`on_exit`) and `state` enters (`on_enter`);
/// the state beneath is NOT paused or resumed, because it stays covered
/// throughout — replace swaps the top layer, it does not uncover the one below.
/// On an empty stack this is just a push-and-enter.
pub fn replace_flow_state(stack: &mut FlowStack, state: FlowState) {
    TRANSITION_DEPTH.with(|d| {
        if d.get() > 0 {
            report_flow_guard(FlowGuardKind::TransitionDuringTransition);
        }
    });
    if !stack.states.is_empty() {
        let previous_top = stack.states.pop().unwrap();
        TRANSITION_DEPTH.with(|d| d.set(d.get() + 1));
        if let Some(on_exit) = previous_top.on_exit {
            on_exit();
        }
        TRANSITION_DEPTH.with(|d| d.set(d.get() - 1));
    }
    let on_enter = state.on_enter;
    stack.states.push(state);
    TRANSITION_DEPTH.with(|d| d.set(d.get() + 1));
    if let Some(on_enter) = on_enter {
        on_enter();
    }
    TRANSITION_DEPTH.with(|d| d.set(d.get() - 1));
}

/// Tick the stack for one frame (`delta_time` is in seconds). The active top
/// always updates (`on_update(delta_time)`); then, walking downward, each
/// visited state that sets `update_below` also ticks the state immediately
/// beneath it, continuing the chain until a visited state does not set
/// `update_below`. An opaque overlay (no `update_below`) freezes everything
/// below it. A no-op on an empty stack.
pub fn update_flow_stack(stack: &FlowStack, delta_time: f32) {
    let states = &stack.states;
    let mut index = states.len() as i32 - 1;
    if index < 0 {
        return;
    }
    if let Some(on_update) = states[index as usize].on_update {
        on_update(delta_time);
    }
    while index > 0 && states[index as usize].update_below {
        index -= 1;
        if let Some(on_update) = states[index as usize].on_update {
            on_update(delta_time);
        }
    }
}

thread_local! {
    static TRANSITION_DEPTH: Cell<u32> = const { Cell::new(0) };
}
