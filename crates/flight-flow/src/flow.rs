//! flight-compiler: target-native

use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Ref, allocate_entity};

use crate::flow_guards::report_flow_guard;
use crate::types::{FlowGuardKind, FlowGuardState};

/// Shared caller-owned flow-guard state.
pub type FlowGuardStateRef = Ref<FlowGuardState>;

/// A lifecycle callback stored on a flow state (D9 stored capturing form).
pub type FlowCallback = Arc<dyn Fn() + Send + Sync>;

/// A per-frame update callback stored on a flow state.
pub type FlowUpdateCallback = Arc<dyn Fn(f32) + Send + Sync>;

/// A single application state in a flow stack. Plain data: callers construct it with a literal
/// (TS `FlowState` does not extend Entity). The stack stores it behind `Ref`, matching TS object
/// identity and enabling real re-entrant transitions.
#[derive(Clone)]
pub struct FlowState {
    pub name: Option<String>,
    pub on_enter: Option<FlowCallback>,
    pub on_exit: Option<FlowCallback>,
    pub on_pause: Option<FlowCallback>,
    pub on_resume: Option<FlowCallback>,
    pub on_update: Option<FlowUpdateCallback>,
    pub render_below: Option<bool>,
    pub update_below: Option<bool>,
}

/// The flow-state stack (TS `FlowStack` extends Entity). `states` is ordered bottom-to-top, so the
/// last element is the active top; each state is a shared `Ref`, so duplicate detection is
/// `Arc::ptr_eq` exactly as TS compares object references.
#[derive(Clone)]
pub struct FlowStack {
    pub states: Vec<Ref<FlowState>>,
    runtime: EntityRuntimeSlot,
}

flight_entity::impl_entity!(FlowStack);

impl Default for FlowStack {
    fn default() -> Self {
        return FlowStack {
            states: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

// Holds one level of `transition_depth` for the length of a push or replace. Releasing it in `Drop`
// is what keeps the depth balanced when a lifecycle callback panics: the unwind still runs the
// decrement, so later transitions are not reported as nested (the TS source's try/finally).
struct FlowTransition<'a> {
    depth: u32,
    guards: &'a FlowGuardStateRef,
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

// Opens one transition level on `guards` and returns the depth it found, held until the returned
// value drops.
fn begin_flow_transition(guards: &FlowGuardStateRef) -> FlowTransition<'_> {
    let mut guard_state = guards.write().unwrap();
    let depth = guard_state.transition_depth;
    guard_state.transition_depth += 1;
    return FlowTransition { depth, guards };
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
        let on_exit = {
            let current = stack.read().unwrap();
            if index < current.states.len() {
                current.states[index].read().unwrap().on_exit.clone()
            } else {
                None
            }
        };
        if let Some(on_exit) = on_exit {
            on_exit();
        }
    }
    stack.write().unwrap().states.clear();
}

// Closes one transition level. Runs from `Drop`, so it also runs while a callback panic unwinds; a
// poisoned lock is still released rather than abandoning the depth.
fn end_flow_transition(guards: &FlowGuardStateRef) {
    let mut guard_state = guards
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    guard_state.transition_depth -= 1;
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
#[allow(clippy::question_mark)] // let-else is portable to the generated TypeScript; `?` is not
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
    let transition = begin_flow_transition(guards);
    let depth = transition.depth;
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
    drop(transition);
}

/// Swap the active top for a shared state in place; the state beneath is untouched and callbacks run
/// with no lock held.
// flight-lint: allow(conform-params) D5: callback state is the shared FlowGuardState; the source stack remains the first argument
pub fn replace_flow_state(
    stack: &Ref<FlowStack>,
    state: Ref<FlowState>,
    guards: &FlowGuardStateRef,
) {
    let transition = begin_flow_transition(guards);
    let depth = transition.depth;
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
    drop(transition);
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

impl Drop for FlowTransition<'_> {
    fn drop(&mut self) {
        end_flow_transition(self.guards);
    }
}
