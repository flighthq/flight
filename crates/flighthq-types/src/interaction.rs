use crate::input::{KeyboardEventData, PointerEventData};
use flighthq_signals::Signal;

// ---------------------------------------------------------------------------
// InteractionSignals
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
pub struct InteractionSignals {
    pub on_click: Signal<PointerEventData>,
    pub on_context_menu: Signal<PointerEventData>,
    pub on_double_click: Signal<PointerEventData>,
    pub on_key_down: Signal<KeyboardEventData>,
    pub on_key_up: Signal<KeyboardEventData>,
    pub on_pointer_cancel: Signal<PointerEventData>,
    pub on_pointer_down: Signal<PointerEventData>,
    pub on_pointer_move: Signal<PointerEventData>,
    pub on_pointer_out: Signal<PointerEventData>,
    pub on_pointer_over: Signal<PointerEventData>,
    pub on_pointer_roll_out: Signal<PointerEventData>,
    pub on_pointer_roll_over: Signal<PointerEventData>,
    pub on_pointer_up: Signal<PointerEventData>,
    pub on_release_outside: Signal<PointerEventData>,
    pub on_wheel: Signal<PointerEventData>,
}

// ---------------------------------------------------------------------------
// HitTestFunction
// ---------------------------------------------------------------------------

/// Tests whether a point `(x, y)` hits a node. `shape_flag` requests exact
/// shape testing instead of bounds testing.
pub type HitTestFunction = Box<dyn Fn(u64, f32, f32, bool) -> bool + Send + Sync>;

// ---------------------------------------------------------------------------
// InteractionPointerState
// ---------------------------------------------------------------------------

/// Per-pointer runtime state tracked by an `InteractionManager`.
#[derive(Clone, Debug, Default)]
pub struct InteractionPointerState {
    /// Node id of the last click target (for double-click detection).
    pub last_click_target_id: Option<u64>,
    pub last_click_time: f64,
    /// Node id of the node that received pointer-down.
    pub pointer_down_target_id: Option<u64>,
    /// Node id of the node currently under the pointer.
    pub pointer_over_target_id: Option<u64>,
}

// ---------------------------------------------------------------------------
// InteractionManager
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct InteractionPointerOptions {
    pub alt_key: bool,
    pub buttons: u32,
    pub ctrl_key: bool,
    pub meta_key: bool,
    pub pointer_id: Option<i32>,
    pub pointer_type: Option<crate::input::PointerType>,
    pub shift_key: bool,
}

/// Manages pointer and keyboard event dispatch over a scene graph.
#[derive(Debug, Default)]
pub struct InteractionManager {
    pub double_click_delay: f64,
    pub enabled: bool,
    pub pointer_captures: std::collections::HashMap<i32, u64>,
    pub pointer_states: std::collections::HashMap<i32, InteractionPointerState>,
    /// Root node id this manager dispatches events into.
    pub root_id: u64,
    pub tracked_subscribers_only: bool,
}

#[derive(Clone, Debug, Default)]
pub struct InteractionManagerOptions {
    pub enabled: bool,
    pub tracked_subscribers_only: bool,
}
