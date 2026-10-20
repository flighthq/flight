/// The kind of guard violation detected during a flow stack transition.
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum FlowGuardKind {
    DuplicateStatePush = 0,
    TransitionDuringTransition = 1,
}

/// A single state in a flow stack, with optional lifecycle callbacks and
/// transparency flags.
///
/// Lifecycle: `on_enter` when pushed, `on_exit` when popped or replaced,
/// `on_pause`/`on_resume` when covered/uncovered by another state, and
/// `on_update` every frame while active.
#[derive(Clone, Debug, Default)]
pub struct FlowState {
    pub name: Option<String>,
    pub render_below: bool,
    pub update_below: bool,
    pub on_enter: Option<fn()>,
    pub on_exit: Option<fn()>,
    pub on_pause: Option<fn()>,
    pub on_resume: Option<fn()>,
    pub on_update: Option<fn(f32)>,
}

/// A stack of `FlowState`s driving a push/pop lifecycle. The active state is
/// always the top of the stack (last element of `states`).
#[derive(Clone, Debug, Default)]
pub struct FlowStack {
    pub states: Vec<FlowState>,
}
