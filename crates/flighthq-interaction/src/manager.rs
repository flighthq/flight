//! [`InteractionManager`] and all interaction-dispatch free functions.
//!
//! The manager owns per-pointer state (over/down targets, double-click
//! tracking), pointer captures, and the per-node [`InteractionSignals`]. In the
//! TS port the signals lived on each node's runtime; the Rust scene graph node
//! has no runtime slot for a cross-kind subsystem, so the manager owns a
//! `NodeId`-keyed signal map instead. Dispatch therefore takes both the manager
//! and the [`DisplayObjectArena`] it operates over.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;

use flighthq_displayobject::DisplayObjectArena;
use flighthq_geometry::inverse_matrix_transform_point_xy;
use flighthq_node::NodeId;
use flighthq_signals::{SignalConnectOptions, SlotGuard, SlotId, connect_signal, emit_signal};
use flighthq_types::geometry::Vector2Like;
use flighthq_types::input::{
    InputKeyboardData, InputPointerData, InputSignals, KeyboardEventData, PointerEventData,
    PointerType,
};
use flighthq_types::interaction::{
    InteractionManagerOptions, InteractionPointerOptions, InteractionSignals,
};

use crate::hit_tests::{compute_world_matrix, find_graph_hit_target};
use crate::signals::create_interaction_signals;

/// Manages pointer and keyboard event dispatch over a [`DisplayObjectArena`].
///
/// Unlike the types-crate placeholder, this manager owns the per-node
/// [`InteractionSignals`] map, which dispatch reads to deliver events.
pub struct InteractionManager {
    pub double_click_delay: f64,
    pub enabled: bool,
    pub pointer_captures: HashMap<i32, NodeId>,
    pub pointer_states: HashMap<i32, InteractionPointerState>,
    /// Root node id this manager dispatches events into.
    pub root: NodeId,
    pub tracked_subscribers_only: bool,
    signals: HashMap<NodeId, InteractionSignals>,
    /// Per-signal-name count of subscribers connected through
    /// [`connect_interaction_signal`]. Shared so once-slots can decrement it.
    subscriber_counts: Arc<Mutex<HashMap<&'static str, usize>>>,
}

/// Per-pointer runtime state tracked by an [`InteractionManager`].
///
/// Mirrors the types-crate `InteractionPointerState` but keyed by [`NodeId`]
/// rather than the placeholder `u64`, matching the arena-based graph model.
#[derive(Clone, Debug, Default)]
pub struct InteractionPointerState {
    /// Node of the last click target (for double-click detection).
    pub last_click_target_id: Option<NodeId>,
    pub last_click_time: f64,
    /// Node that received pointer-down.
    pub pointer_down_target_id: Option<NodeId>,
    /// Node currently under the pointer.
    pub pointer_over_target_id: Option<NodeId>,
}

/// Allocates a new [`InteractionManager`] rooted at `root`.
pub fn create_interaction_manager(
    root: NodeId,
    options: InteractionManagerOptions,
) -> InteractionManager {
    InteractionManager {
        double_click_delay: 500.0,
        enabled: options.enabled,
        pointer_captures: HashMap::new(),
        pointer_states: HashMap::new(),
        root,
        tracked_subscribers_only: options.tracked_subscribers_only,
        signals: HashMap::new(),
        subscriber_counts: Arc::new(Mutex::new(HashMap::new())),
    }
}

/// Captures pointer `pointer_id` to `target`.
///
/// While captured, all pointer events for that pointer are routed directly to
/// `target` without hit-testing, regardless of the pointer position.
pub fn capture_interaction_pointer(
    manager: &mut InteractionManager,
    pointer_id: i32,
    target: NodeId,
) {
    manager.pointer_captures.insert(pointer_id, target);
}

/// Connects an [`InputSignals`] source's signals to `manager` and returns
/// guards that disconnect all wired slots when dropped.
///
/// `coord_scale` scales pointer coordinates from screen space to scene space;
/// pass `1.0` when no scaling is needed. The manager and arena are accessed
/// from the input callbacks, so both are shared behind `Arc<Mutex<...>>`.
pub fn connect_input_to_interaction(
    input: &InputSignals,
    manager: Arc<Mutex<InteractionManager>>,
    arena: Arc<Mutex<DisplayObjectArena>>,
    coord_scale: f32,
) -> Vec<SlotGuard<InputPointerData>> {
    // Pointer signals all carry `InputPointerData`. Keyboard signals carry a
    // different payload type, so they are wired by the companion
    // `connect_keyboard_input_to_interaction`; the caller drops both guard sets
    // to disconnect everything.
    let mut guards: Vec<SlotGuard<InputPointerData>> = Vec::new();

    let m = Arc::clone(&manager);
    let a = Arc::clone(&arena);
    guards.push(connect_signal(
        &input.on_pointer_down,
        Arc::new(move |d: &InputPointerData| {
            let mut mgr = m.lock().unwrap();
            let ar = a.lock().unwrap();
            dispatch_interaction_pointer_down(
                &mut mgr,
                &ar,
                d.x * coord_scale,
                d.y * coord_scale,
                d.button,
                Some(&pointer_options_from_input(d)),
            );
        }),
        SignalConnectOptions::default(),
    ));

    let m = Arc::clone(&manager);
    let a = Arc::clone(&arena);
    guards.push(connect_signal(
        &input.on_pointer_move,
        Arc::new(move |d: &InputPointerData| {
            let mut mgr = m.lock().unwrap();
            let ar = a.lock().unwrap();
            dispatch_interaction_pointer_move(
                &mut mgr,
                &ar,
                d.x * coord_scale,
                d.y * coord_scale,
                d.button,
                Some(&pointer_options_from_input(d)),
            );
        }),
        SignalConnectOptions::default(),
    ));

    let m = Arc::clone(&manager);
    let a = Arc::clone(&arena);
    guards.push(connect_signal(
        &input.on_pointer_up,
        Arc::new(move |d: &InputPointerData| {
            let mut mgr = m.lock().unwrap();
            let ar = a.lock().unwrap();
            dispatch_interaction_pointer_up(
                &mut mgr,
                &ar,
                d.x * coord_scale,
                d.y * coord_scale,
                d.button,
                0.0,
                Some(&pointer_options_from_input(d)),
            );
        }),
        SignalConnectOptions::default(),
    ));

    let m = Arc::clone(&manager);
    let a = Arc::clone(&arena);
    guards.push(connect_signal(
        &input.on_pointer_cancel,
        Arc::new(move |d: &InputPointerData| {
            let mut mgr = m.lock().unwrap();
            let ar = a.lock().unwrap();
            dispatch_interaction_pointer_cancel(
                &mut mgr,
                &ar,
                d.x * coord_scale,
                d.y * coord_scale,
                Some(&pointer_options_from_input(d)),
            );
        }),
        SignalConnectOptions::default(),
    ));

    let m = Arc::clone(&manager);
    let a = Arc::clone(&arena);
    guards.push(connect_signal(
        &input.on_wheel,
        Arc::new(move |d: &InputPointerData| {
            let mut mgr = m.lock().unwrap();
            let ar = a.lock().unwrap();
            dispatch_interaction_wheel(
                &mut mgr,
                &ar,
                d.x * coord_scale,
                d.y * coord_scale,
                d.delta_x,
                d.delta_y,
                Some(&pointer_options_from_input(d)),
            );
        }),
        SignalConnectOptions::default(),
    ));

    guards
}

/// Connects keyboard input signals into `manager` and returns guards that
/// disconnect when dropped. Kept separate from
/// [`connect_input_to_interaction`] because keyboard signals carry a different
/// payload type than pointer signals.
pub fn connect_keyboard_input_to_interaction(
    input: &InputSignals,
    manager: Arc<Mutex<InteractionManager>>,
    arena: Arc<Mutex<DisplayObjectArena>>,
) -> Vec<SlotGuard<InputKeyboardData>> {
    let mut guards = Vec::new();

    let m = Arc::clone(&manager);
    let a = Arc::clone(&arena);
    guards.push(connect_signal(
        &input.on_key_down,
        Arc::new(move |d: &InputKeyboardData| {
            let mut mgr = m.lock().unwrap();
            let ar = a.lock().unwrap();
            dispatch_interaction_key_down(
                &mut mgr,
                &ar,
                &d.key,
                d.key_code,
                Some(&keyboard_event_from_input(d)),
            );
        }),
        SignalConnectOptions::default(),
    ));

    let m = Arc::clone(&manager);
    let a = Arc::clone(&arena);
    guards.push(connect_signal(
        &input.on_key_up,
        Arc::new(move |d: &InputKeyboardData| {
            let mut mgr = m.lock().unwrap();
            let ar = a.lock().unwrap();
            dispatch_interaction_key_up(
                &mut mgr,
                &ar,
                &d.key,
                d.key_code,
                Some(&keyboard_event_from_input(d)),
            );
        }),
        SignalConnectOptions::default(),
    ));

    guards
}

/// Connects `callback` to the named keyboard interaction signal on `target`,
/// tracking the subscription in `manager` for efficient dispatch.
///
/// Returns a guard whose drop disconnects the slot and decrements the tracked
/// subscriber count.
pub fn connect_interaction_keyboard_signal(
    manager: &mut InteractionManager,
    target: NodeId,
    name: &'static str,
    callback: Arc<dyn Fn(&KeyboardEventData) + Send + Sync>,
    options: SignalConnectOptions,
) -> SlotGuard<KeyboardEventData> {
    increment_count(&manager.subscriber_counts, name);
    let counts = Arc::clone(&manager.subscriber_counts);
    let signals = enable_interaction_signals(manager, target);
    let signal = keyboard_signal_by_name(signals, name);
    if options.once {
        let cb = Arc::clone(&callback);
        connect_signal(
            signal,
            Arc::new(move |d: &KeyboardEventData| {
                cb(d);
                decrement_count(&counts, name);
            }),
            options,
        )
    } else {
        connect_signal(signal, callback, options)
    }
}

/// Connects `callback` to the named pointer interaction signal on `target`,
/// tracking the subscription in `manager` for efficient dispatch.
///
/// Returns a guard whose drop disconnects the slot and decrements the tracked
/// subscriber count. If the same logical slot is connected twice the counts
/// reflect both connections.
pub fn connect_interaction_signal(
    manager: &mut InteractionManager,
    target: NodeId,
    name: &'static str,
    callback: Arc<dyn Fn(&PointerEventData) + Send + Sync>,
    options: SignalConnectOptions,
) -> SlotGuard<PointerEventData> {
    increment_count(&manager.subscriber_counts, name);
    let counts = Arc::clone(&manager.subscriber_counts);
    let signals = enable_interaction_signals(manager, target);
    let signal = pointer_signal_by_name(signals, name);
    if options.once {
        let cb = Arc::clone(&callback);
        connect_signal(
            signal,
            Arc::new(move |d: &PointerEventData| {
                cb(d);
                decrement_count(&counts, name);
            }),
            options,
        )
    } else {
        connect_signal(signal, callback, options)
    }
}

/// Disconnects the slot identified by `slot_id` from the named pointer signal on
/// `target` and decrements the tracked subscriber count.
pub fn disconnect_interaction_signal(
    manager: &mut InteractionManager,
    target: NodeId,
    name: &'static str,
    slot_id: SlotId,
) {
    let Some(signals) = manager.signals.get(&target) else {
        return;
    };
    let signal = pointer_signal_by_name(signals, name);
    if flighthq_signals::is_slot_connected(signal, slot_id) {
        flighthq_signals::disconnect_signal(signal, slot_id);
        decrement_count(&manager.subscriber_counts, name);
    }
}

/// Dispatches a context-menu event at world-space `(x, y)`.
pub fn dispatch_interaction_context_menu(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    x: f32,
    y: f32,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    dispatch_pointer_signal_at(
        manager,
        arena,
        ON_CONTEXT_MENU,
        x,
        y,
        button,
        0.0,
        0.0,
        options,
    );
}

/// Dispatches a key-down event into the scene graph rooted at `manager.root`.
pub fn dispatch_interaction_key_down(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    key: &str,
    key_code: u32,
    modifiers: Option<&KeyboardEventData>,
) {
    dispatch_keyboard_signal(manager, arena, ON_KEY_DOWN, key, key_code, modifiers);
}

/// Dispatches a key-up event into the scene graph rooted at `manager.root`.
pub fn dispatch_interaction_key_up(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    key: &str,
    key_code: u32,
    modifiers: Option<&KeyboardEventData>,
) {
    dispatch_keyboard_signal(manager, arena, ON_KEY_UP, key, key_code, modifiers);
}

/// Dispatches a pointer-cancel event at world-space `(x, y)`.
///
/// Clears the pointer-down target, the pointer-over target, and any capture for
/// the pointer identified in `options`.
pub fn dispatch_interaction_pointer_cancel(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    x: f32,
    y: f32,
    options: Option<&InteractionPointerOptions>,
) {
    if !is_pointer_signal_needed(manager, arena, &CANCEL_SIGNAL_NAMES) {
        return;
    }

    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let captured = manager.pointer_captures.get(&pointer_id).copied();
    let (old_target, down_target) = {
        let state = get_pointer_state(manager, pointer_id);
        let old = state.pointer_over_target_id;
        let down = state.pointer_down_target_id;
        state.pointer_down_target_id = None;
        state.pointer_over_target_id = None;
        (old, down)
    };
    let target = captured.or(down_target).or(old_target);
    manager.pointer_captures.remove(&pointer_id);

    let data = build_pointer_data(arena, target, target, x, y, -1, 0.0, 0.0, options);
    if let Some(t) = target {
        emit_interaction_pointer_signal(manager, arena, t, ON_POINTER_CANCEL, &data);
    }
    if let Some(ot) = old_target {
        dispatch_pointer_rollover_change(manager, arena, Some(ot), None, &data);
    }
}

/// Dispatches a pointer-down event at world-space `(x, y)`.
pub fn dispatch_interaction_pointer_down(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    x: f32,
    y: f32,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    if !is_pointer_signal_needed(manager, arena, &DOWN_SIGNAL_NAMES) {
        return;
    }

    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let Some(target) = find_interaction_target(manager, arena, x, y, pointer_id) else {
        return;
    };

    get_pointer_state(manager, pointer_id).pointer_down_target_id = Some(target);
    let data = build_pointer_data(
        arena,
        Some(target),
        Some(target),
        x,
        y,
        button,
        0.0,
        0.0,
        options,
    );
    emit_interaction_pointer_signal(manager, arena, target, ON_POINTER_DOWN, &data);
}

/// Dispatches a pointer-move event at world-space `(x, y)`.
///
/// Computes over/out/roll-over/roll-out transitions relative to the previous
/// pointer position.
pub fn dispatch_interaction_pointer_move(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    x: f32,
    y: f32,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    if !is_pointer_signal_needed(manager, arena, &MOVE_SIGNAL_NAMES) {
        return;
    }

    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let old_target = get_pointer_state(manager, pointer_id).pointer_over_target_id;
    let target = find_interaction_target(manager, arena, x, y, pointer_id);
    if target.is_none() && old_target.is_none() {
        return;
    }

    get_pointer_state(manager, pointer_id).pointer_over_target_id = target;
    let data = build_pointer_data(arena, target, target, x, y, button, 0.0, 0.0, options);

    if target != old_target {
        dispatch_pointer_rollover_change(manager, arena, old_target, target, &data);
    }

    if let Some(t) = target {
        emit_interaction_pointer_signal(manager, arena, t, ON_POINTER_MOVE, &data);
    }
}

/// Dispatches a pointer-up event at world-space `(x, y)`.
///
/// Emits click, double-click, and release-outside as appropriate relative to
/// the pointer-down target. `time` is the event timestamp in milliseconds.
pub fn dispatch_interaction_pointer_up(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    x: f32,
    y: f32,
    button: i32,
    time: f64,
    options: Option<&InteractionPointerOptions>,
) {
    if !is_pointer_signal_needed(manager, arena, &UP_SIGNAL_NAMES) {
        return;
    }

    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let down_target = get_pointer_state(manager, pointer_id).pointer_down_target_id;
    let target = find_interaction_target(manager, arena, x, y, pointer_id);
    get_pointer_state(manager, pointer_id).pointer_down_target_id = None;

    let data_target = target.or(down_target);
    let data = build_pointer_data(
        arena,
        data_target,
        data_target,
        x,
        y,
        button,
        0.0,
        0.0,
        options,
    );

    if let Some(t) = target {
        emit_interaction_pointer_signal(manager, arena, t, ON_POINTER_UP, &data);
    }

    let Some(down_target) = down_target else {
        return;
    };

    if target == Some(down_target) {
        let t = down_target;
        emit_interaction_pointer_signal(manager, arena, t, ON_CLICK, &data);
        let state = get_pointer_state(manager, pointer_id);
        if state.last_click_target_id == Some(t)
            && time - state.last_click_time <= manager.double_click_delay
        {
            emit_interaction_pointer_signal(manager, arena, t, ON_DOUBLE_CLICK, &data);
            let state = get_pointer_state(manager, pointer_id);
            state.last_click_target_id = None;
            state.last_click_time = f64::NEG_INFINITY;
        } else {
            let state = get_pointer_state(manager, pointer_id);
            state.last_click_target_id = Some(t);
            state.last_click_time = time;
        }
    } else {
        emit_interaction_pointer_signal(manager, arena, down_target, ON_RELEASE_OUTSIDE, &data);
    }
}

/// Dispatches a wheel event at world-space `(x, y)`.
pub fn dispatch_interaction_wheel(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    x: f32,
    y: f32,
    delta_x: f32,
    delta_y: f32,
    options: Option<&InteractionPointerOptions>,
) {
    dispatch_pointer_signal_at(manager, arena, ON_WHEEL, x, y, 0, delta_x, delta_y, options);
}

/// Lazily initializes and returns the [`InteractionSignals`] for `target`.
pub fn enable_interaction_signals(
    manager: &mut InteractionManager,
    target: NodeId,
) -> &mut InteractionSignals {
    manager
        .signals
        .entry(target)
        .or_insert_with(create_interaction_signals)
}

/// Returns the [`InteractionSignals`] for `target`, or `None` if never enabled.
pub fn get_interaction_signals(
    manager: &InteractionManager,
    target: NodeId,
) -> Option<&InteractionSignals> {
    manager.signals.get(&target)
}

/// Releases the pointer capture for `pointer_id`, if any.
pub fn release_interaction_pointer(manager: &mut InteractionManager, pointer_id: i32) {
    manager.pointer_captures.remove(&pointer_id);
}

// ---------------------------------------------------------------------------
// Internal dispatch helpers (loose, kept after the public API)
// ---------------------------------------------------------------------------

fn build_pointer_data(
    arena: &DisplayObjectArena,
    target: Option<NodeId>,
    current_target: Option<NodeId>,
    x: f32,
    y: f32,
    button: i32,
    delta_x: f32,
    delta_y: f32,
    options: Option<&InteractionPointerOptions>,
) -> PointerEventData {
    let buttons = options
        .map(|o| o.buttons)
        .filter(|&b| b != 0)
        .unwrap_or(if button >= 0 { 1u32 << button } else { 0 });
    let mut data = PointerEventData {
        alt_key: options.map(|o| o.alt_key).unwrap_or(false),
        button,
        buttons,
        ctrl_key: options.map(|o| o.ctrl_key).unwrap_or(false),
        current_target_id: current_target.map(node_to_u64),
        delta_x,
        delta_y,
        local_x: x,
        local_y: y,
        meta_key: options.map(|o| o.meta_key).unwrap_or(false),
        pointer_id: options.and_then(|o| o.pointer_id).unwrap_or(0),
        pointer_type: options
            .and_then(|o| o.pointer_type)
            .unwrap_or(PointerType::Mouse),
        shift_key: options.map(|o| o.shift_key).unwrap_or(false),
        target_id: target.map(node_to_u64),
        world_x: x,
        world_y: y,
        x,
        y,
    };
    if let Some(ct) = current_target {
        set_pointer_data_local_position(&mut data, arena, ct);
    }
    data
}

fn decrement_count(counts: &Arc<Mutex<HashMap<&'static str, usize>>>, name: &'static str) {
    let mut map = counts.lock().unwrap();
    let entry = map.get(name).copied().unwrap_or(0);
    if entry <= 1 {
        map.remove(name);
    } else {
        map.insert(name, entry - 1);
    }
}

fn dispatch_keyboard_signal(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    name: &'static str,
    key: &str,
    key_code: u32,
    modifiers: Option<&KeyboardEventData>,
) {
    if !manager.enabled || !has_interaction_signal_subscriber(manager, arena, name) {
        return;
    }
    let data = KeyboardEventData {
        alt_key: modifiers.map(|m| m.alt_key).unwrap_or(false),
        ctrl_key: modifiers.map(|m| m.ctrl_key).unwrap_or(false),
        key: key.to_string(),
        key_code,
        meta_key: modifiers.map(|m| m.meta_key).unwrap_or(false),
        shift_key: modifiers.map(|m| m.shift_key).unwrap_or(false),
    };
    emit_interaction_keyboard_signal(manager, arena, manager.root, name, &data);
}

fn dispatch_pointer_rollover_change(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    old_target: Option<NodeId>,
    target: Option<NodeId>,
    data: &PointerEventData,
) {
    if let Some(ot) = old_target {
        emit_interaction_pointer_signal(manager, arena, ot, ON_POINTER_OUT, data);
    }

    let old_chain = old_target
        .map(|t| interaction_chain(arena, t, manager.root))
        .unwrap_or_default();
    let new_chain = target
        .map(|t| interaction_chain(arena, t, manager.root))
        .unwrap_or_default();

    for &node in &old_chain {
        if !new_chain.contains(&node) {
            let d = with_current_target(arena, data, node, node);
            emit_interaction_pointer_signal_direct(manager, node, ON_POINTER_ROLL_OUT, &d);
        }
    }

    for i in (0..new_chain.len()).rev() {
        let node = new_chain[i];
        if !old_chain.contains(&node) {
            let d = with_current_target(arena, data, node, node);
            emit_interaction_pointer_signal_direct(manager, node, ON_POINTER_ROLL_OVER, &d);
        }
    }

    if let Some(t) = target {
        emit_interaction_pointer_signal(manager, arena, t, ON_POINTER_OVER, data);
    }
}

fn dispatch_pointer_signal_at(
    manager: &mut InteractionManager,
    arena: &DisplayObjectArena,
    name: &'static str,
    x: f32,
    y: f32,
    button: i32,
    delta_x: f32,
    delta_y: f32,
    options: Option<&InteractionPointerOptions>,
) {
    if !is_pointer_signal_needed(manager, arena, &[name]) {
        return;
    }
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let Some(target) = find_interaction_target(manager, arena, x, y, pointer_id) else {
        return;
    };
    let data = build_pointer_data(
        arena,
        Some(target),
        Some(target),
        x,
        y,
        button,
        delta_x,
        delta_y,
        options,
    );
    emit_interaction_pointer_signal(manager, arena, target, name, &data);
}

/// Bubbles a pointer signal from `target` up to the manager root, updating the
/// current-target each step.
///
/// Cross-node cancellation (a slot calling `cancel_signal` to stop the bubble at
/// the next ancestor) is not supported: the Rust signal model only exposes
/// cancellation within a single emit pass, with no post-emit query. Cancellation
/// within one node still stops that node's remaining slots.
fn emit_interaction_pointer_signal(
    manager: &InteractionManager,
    arena: &DisplayObjectArena,
    target: NodeId,
    name: &'static str,
    data: &PointerEventData,
) {
    let mut current = Some(target);
    while let Some(node) = current {
        let d = with_current_target(arena, data, target, node);
        emit_interaction_pointer_signal_direct(manager, node, name, &d);
        if node == manager.root {
            break;
        }
        current = arena[node].spatial.hierarchy.parent;
    }
}

fn emit_interaction_pointer_signal_direct(
    manager: &InteractionManager,
    target: NodeId,
    name: &'static str,
    data: &PointerEventData,
) {
    if let Some(signals) = manager.signals.get(&target) {
        emit_signal(pointer_signal_by_name(signals, name), data);
    }
}

fn emit_interaction_keyboard_signal(
    manager: &InteractionManager,
    arena: &DisplayObjectArena,
    target: NodeId,
    name: &'static str,
    data: &KeyboardEventData,
) {
    let mut current = Some(target);
    while let Some(node) = current {
        if let Some(signals) = manager.signals.get(&node) {
            emit_signal(keyboard_signal_by_name(signals, name), data);
        }
        if node == manager.root {
            break;
        }
        current = arena[node].spatial.hierarchy.parent;
    }
}

fn find_interaction_target(
    manager: &InteractionManager,
    arena: &DisplayObjectArena,
    x: f32,
    y: f32,
    pointer_id: i32,
) -> Option<NodeId> {
    if !manager.enabled {
        return None;
    }
    if let Some(&captured) = manager.pointer_captures.get(&pointer_id) {
        return Some(captured);
    }
    find_graph_hit_target(arena, manager.root, x, y, false)
}

fn get_pointer_state(
    manager: &mut InteractionManager,
    pointer_id: i32,
) -> &mut InteractionPointerState {
    manager
        .pointer_states
        .entry(pointer_id)
        .or_insert_with(|| InteractionPointerState {
            last_click_target_id: None,
            last_click_time: f64::NEG_INFINITY,
            pointer_down_target_id: None,
            pointer_over_target_id: None,
        })
}

fn has_interaction_signal_subscriber(
    manager: &InteractionManager,
    arena: &DisplayObjectArena,
    name: &'static str,
) -> bool {
    if manager
        .subscriber_counts
        .lock()
        .unwrap()
        .get(name)
        .copied()
        .unwrap_or(0)
        > 0
    {
        return true;
    }
    if manager.tracked_subscribers_only {
        return false;
    }
    has_subscriber_in_graph(manager, arena, manager.root, name)
}

fn has_subscriber_in_graph(
    manager: &InteractionManager,
    arena: &DisplayObjectArena,
    source: NodeId,
    name: &'static str,
) -> bool {
    if let Some(signals) = manager.signals.get(&source) {
        let pointer_has = pointer_signal_by_name_opt(signals, name)
            .map(|s| s.has_listeners())
            .unwrap_or(false);
        let keyboard_has = keyboard_signal_by_name_opt(signals, name)
            .map(|s| s.has_listeners())
            .unwrap_or(false);
        if pointer_has || keyboard_has {
            return true;
        }
    }
    let children = &arena[source].spatial.hierarchy.children;
    for &child in children {
        if has_subscriber_in_graph(manager, arena, child, name) {
            return true;
        }
    }
    false
}

fn increment_count(counts: &Arc<Mutex<HashMap<&'static str, usize>>>, name: &'static str) {
    let mut map = counts.lock().unwrap();
    *map.entry(name).or_insert(0) += 1;
}

fn interaction_chain(arena: &DisplayObjectArena, target: NodeId, root: NodeId) -> Vec<NodeId> {
    let mut out = Vec::new();
    let mut current = Some(target);
    while let Some(node) = current {
        out.push(node);
        if node == root {
            break;
        }
        current = arena[node].spatial.hierarchy.parent;
    }
    out
}

fn is_pointer_signal_needed(
    manager: &InteractionManager,
    arena: &DisplayObjectArena,
    names: &[&'static str],
) -> bool {
    if !manager.enabled {
        return false;
    }
    names
        .iter()
        .any(|&name| has_interaction_signal_subscriber(manager, arena, name))
}

fn keyboard_event_from_input(d: &InputKeyboardData) -> KeyboardEventData {
    KeyboardEventData {
        alt_key: d.alt_key,
        ctrl_key: d.ctrl_key,
        key: d.key.clone(),
        key_code: d.key_code,
        meta_key: d.meta_key,
        shift_key: d.shift_key,
    }
}

fn keyboard_signal_by_name<'a>(
    signals: &'a InteractionSignals,
    name: &str,
) -> &'a flighthq_signals::Signal<KeyboardEventData> {
    keyboard_signal_by_name_opt(signals, name).expect("keyboard signal name")
}

fn keyboard_signal_by_name_opt<'a>(
    signals: &'a InteractionSignals,
    name: &str,
) -> Option<&'a flighthq_signals::Signal<KeyboardEventData>> {
    match name {
        ON_KEY_DOWN => Some(&signals.on_key_down),
        ON_KEY_UP => Some(&signals.on_key_up),
        _ => None,
    }
}

fn node_to_u64(id: NodeId) -> u64 {
    // Encode the generational slot-map key as a stable u64 for the public
    // PointerEventData payload (which addresses nodes by id, not by NodeId).
    use slotmap::Key;
    id.data().as_ffi()
}

fn pointer_options_from_input(d: &InputPointerData) -> InteractionPointerOptions {
    InteractionPointerOptions {
        alt_key: d.alt_key,
        buttons: d.buttons,
        ctrl_key: d.ctrl_key,
        meta_key: d.meta_key,
        pointer_id: Some(d.pointer_id),
        pointer_type: Some(d.pointer_type),
        shift_key: d.shift_key,
    }
}

fn pointer_signal_by_name<'a>(
    signals: &'a InteractionSignals,
    name: &str,
) -> &'a flighthq_signals::Signal<PointerEventData> {
    pointer_signal_by_name_opt(signals, name).expect("pointer signal name")
}

fn pointer_signal_by_name_opt<'a>(
    signals: &'a InteractionSignals,
    name: &str,
) -> Option<&'a flighthq_signals::Signal<PointerEventData>> {
    match name {
        ON_CLICK => Some(&signals.on_click),
        ON_CONTEXT_MENU => Some(&signals.on_context_menu),
        ON_DOUBLE_CLICK => Some(&signals.on_double_click),
        ON_POINTER_CANCEL => Some(&signals.on_pointer_cancel),
        ON_POINTER_DOWN => Some(&signals.on_pointer_down),
        ON_POINTER_MOVE => Some(&signals.on_pointer_move),
        ON_POINTER_OUT => Some(&signals.on_pointer_out),
        ON_POINTER_OVER => Some(&signals.on_pointer_over),
        ON_POINTER_ROLL_OUT => Some(&signals.on_pointer_roll_out),
        ON_POINTER_ROLL_OVER => Some(&signals.on_pointer_roll_over),
        ON_POINTER_UP => Some(&signals.on_pointer_up),
        ON_RELEASE_OUTSIDE => Some(&signals.on_release_outside),
        ON_WHEEL => Some(&signals.on_wheel),
        _ => None,
    }
}

fn set_pointer_data_local_position(
    data: &mut PointerEventData,
    arena: &DisplayObjectArena,
    current_target: NodeId,
) {
    let world = compute_world_matrix(arena, current_target);
    let mut point = Vector2Like::default();
    inverse_matrix_transform_point_xy(&mut point, &world, data.world_x, data.world_y);
    data.local_x = point.x;
    data.local_y = point.y;
}

fn with_current_target(
    arena: &DisplayObjectArena,
    data: &PointerEventData,
    target: NodeId,
    current_target: NodeId,
) -> PointerEventData {
    let mut out = data.clone();
    out.target_id = Some(node_to_u64(target));
    out.current_target_id = Some(node_to_u64(current_target));
    set_pointer_data_local_position(&mut out, arena, current_target);
    out
}

const ON_CLICK: &str = "onClick";
const ON_CONTEXT_MENU: &str = "onContextMenu";
const ON_DOUBLE_CLICK: &str = "onDoubleClick";
const ON_KEY_DOWN: &str = "onKeyDown";
const ON_KEY_UP: &str = "onKeyUp";
const ON_POINTER_CANCEL: &str = "onPointerCancel";
const ON_POINTER_DOWN: &str = "onPointerDown";
const ON_POINTER_MOVE: &str = "onPointerMove";
const ON_POINTER_OUT: &str = "onPointerOut";
const ON_POINTER_OVER: &str = "onPointerOver";
const ON_POINTER_ROLL_OUT: &str = "onPointerRollOut";
const ON_POINTER_ROLL_OVER: &str = "onPointerRollOver";
const ON_POINTER_UP: &str = "onPointerUp";
const ON_RELEASE_OUTSIDE: &str = "onReleaseOutside";
const ON_WHEEL: &str = "onWheel";

const CANCEL_SIGNAL_NAMES: [&str; 3] = [ON_POINTER_CANCEL, ON_POINTER_OUT, ON_POINTER_ROLL_OUT];
const DOWN_SIGNAL_NAMES: [&str; 5] = [
    ON_CLICK,
    ON_DOUBLE_CLICK,
    ON_POINTER_CANCEL,
    ON_POINTER_DOWN,
    ON_RELEASE_OUTSIDE,
];
const MOVE_SIGNAL_NAMES: [&str; 5] = [
    ON_POINTER_MOVE,
    ON_POINTER_OUT,
    ON_POINTER_OVER,
    ON_POINTER_ROLL_OUT,
    ON_POINTER_ROLL_OVER,
];
const UP_SIGNAL_NAMES: [&str; 4] = [ON_CLICK, ON_DOUBLE_CLICK, ON_POINTER_UP, ON_RELEASE_OUTSIDE];

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    use flighthq_displayobject::{add_display_object_child, create_display_object};
    use flighthq_types::display_object_kind;

    use crate::hit_tests::{HitTestFn, hit_test_graph_local_bounds, register_hit_test_point};

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    fn bounds_hit(arena: &DisplayObjectArena, id: NodeId, x: f32, y: f32, _shape: bool) -> bool {
        hit_test_graph_local_bounds(arena, id, x, y)
    }

    fn set_bounds(arena: &mut DisplayObjectArena, id: NodeId, w: f32, h: f32) {
        let b = &mut arena[id].spatial.bounds.local;
        b.x = 0.0;
        b.y = 0.0;
        b.width = w;
        b.height = h;
    }

    fn opts() -> InteractionManagerOptions {
        InteractionManagerOptions {
            enabled: true,
            tracked_subscribers_only: false,
        }
    }

    /// Builds root→child scene, child sized 100x100, registers the bounds hit
    /// test for the display object kind. Returns (arena, manager, root, child).
    fn hit_scene() -> (DisplayObjectArena, InteractionManager, NodeId, NodeId) {
        register_hit_test_point(display_object_kind(), bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let child = create_display_object(&mut arena);
        set_bounds(&mut arena, child, 100.0, 100.0);
        add_display_object_child(&mut arena, root, child);
        let manager = create_interaction_manager(root, opts());
        (arena, manager, root, child)
    }

    fn counter() -> (Arc<AtomicU32>, Arc<dyn Fn(&PointerEventData) + Send + Sync>) {
        let c = Arc::new(AtomicU32::new(0));
        let cc = Arc::clone(&c);
        (
            c,
            Arc::new(move |_: &PointerEventData| {
                cc.fetch_add(1, Ordering::SeqCst);
            }),
        )
    }

    // create_interaction_manager

    #[test]
    fn create_interaction_manager_defaults() {
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let m = create_interaction_manager(root, opts());
        assert!(m.enabled);
        assert_eq!(m.double_click_delay, 500.0);
        assert!(m.pointer_captures.is_empty());
        assert!(m.pointer_states.is_empty());
        assert!(!m.tracked_subscribers_only);
    }

    #[test]
    fn create_interaction_manager_disabled() {
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let m = create_interaction_manager(
            root,
            InteractionManagerOptions {
                enabled: false,
                tracked_subscribers_only: false,
            },
        );
        assert!(!m.enabled);
    }

    // capture / release

    #[test]
    fn capture_interaction_pointer_routes_to_captured_target() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_move,
            cb,
            Default::default(),
        );
        capture_interaction_pointer(&mut m, 3, child);
        dispatch_interaction_pointer_move(
            &mut m,
            &arena,
            500.0,
            500.0,
            0,
            Some(&InteractionPointerOptions {
                pointer_id: Some(3),
                ..Default::default()
            }),
        );
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn release_interaction_pointer_stops_capture() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_move,
            cb,
            Default::default(),
        );
        capture_interaction_pointer(&mut m, 3, child);
        release_interaction_pointer(&mut m, 3);
        dispatch_interaction_pointer_move(
            &mut m,
            &arena,
            500.0,
            500.0,
            0,
            Some(&InteractionPointerOptions {
                pointer_id: Some(3),
                ..Default::default()
            }),
        );
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }

    // dispatch_interaction_pointer_down

    #[test]
    fn dispatch_interaction_pointer_down_fires_on_hit_target() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_down,
            cb,
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn dispatch_interaction_pointer_down_no_hit_does_not_panic() {
        register_hit_test_point(display_object_kind(), bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let mut m = create_interaction_manager(root, opts());
        let (_count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, root).on_pointer_down,
            cb,
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
    }

    #[test]
    fn dispatch_interaction_pointer_down_disabled_manager_does_nothing() {
        register_hit_test_point(display_object_kind(), bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let child = create_display_object(&mut arena);
        set_bounds(&mut arena, child, 100.0, 100.0);
        add_display_object_child(&mut arena, root, child);
        let mut m = create_interaction_manager(
            root,
            InteractionManagerOptions {
                enabled: false,
                tracked_subscribers_only: false,
            },
        );
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_down,
            cb,
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn dispatch_interaction_pointer_down_passes_local_coordinates_and_metadata() {
        register_hit_test_point(display_object_kind(), bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let child = create_display_object(&mut arena);
        arena[child].spatial.transform.x = 10.0;
        arena[child].spatial.transform.y = 20.0;
        set_bounds(&mut arena, child, 100.0, 100.0);
        add_display_object_child(&mut arena, root, child);
        let mut m = create_interaction_manager(root, opts());

        let local = Arc::new(Mutex::new((0.0f32, 0.0f32)));
        let pid = Arc::new(AtomicU32::new(0));
        let local_c = Arc::clone(&local);
        let pid_c = Arc::clone(&pid);
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_down,
            Arc::new(move |d: &PointerEventData| {
                *local_c.lock().unwrap() = (d.local_x, d.local_y);
                pid_c.store(d.pointer_id as u32, Ordering::SeqCst);
            }),
            Default::default(),
        );
        dispatch_interaction_pointer_down(
            &mut m,
            &arena,
            30.0,
            40.0,
            0,
            Some(&InteractionPointerOptions {
                pointer_id: Some(7),
                pointer_type: Some(PointerType::Pen),
                ..Default::default()
            }),
        );
        assert_eq!(*local.lock().unwrap(), (20.0, 20.0));
        assert_eq!(pid.load(Ordering::SeqCst), 7);
    }

    #[test]
    fn dispatch_interaction_pointer_down_bubbles_to_ancestor_with_ancestor_local() {
        register_hit_test_point(display_object_kind(), bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let parent = create_display_object(&mut arena);
        let child = create_display_object(&mut arena);
        arena[parent].spatial.transform.x = 10.0;
        arena[parent].spatial.transform.y = 20.0;
        arena[child].spatial.transform.x = 5.0;
        arena[child].spatial.transform.y = 7.0;
        set_bounds(&mut arena, child, 100.0, 100.0);
        add_display_object_child(&mut arena, root, parent);
        add_display_object_child(&mut arena, parent, child);
        let mut m = create_interaction_manager(root, opts());

        let local = Arc::new(Mutex::new((0.0f32, 0.0f32)));
        let local_c = Arc::clone(&local);
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, parent).on_pointer_down,
            Arc::new(move |d: &PointerEventData| {
                *local_c.lock().unwrap() = (d.local_x, d.local_y);
            }),
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 25.0, 37.0, 0, None);
        assert_eq!(*local.lock().unwrap(), (15.0, 17.0));
    }

    // dispatch_interaction_pointer_up: click / double-click / release-outside

    #[test]
    fn dispatch_interaction_pointer_up_fires_click_on_same_target() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_click,
            cb,
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        dispatch_interaction_pointer_up(&mut m, &arena, 50.0, 50.0, 0, 0.0, None);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn dispatch_interaction_pointer_up_fires_double_click_within_delay() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_double_click,
            cb,
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        dispatch_interaction_pointer_up(&mut m, &arena, 50.0, 50.0, 0, 1000.0, None);
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        dispatch_interaction_pointer_up(&mut m, &arena, 50.0, 50.0, 0, 1200.0, None);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn dispatch_interaction_pointer_up_double_click_tracked_per_pointer() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_double_click,
            cb,
            Default::default(),
        );
        let p1 = InteractionPointerOptions {
            pointer_id: Some(1),
            ..Default::default()
        };
        let p2 = InteractionPointerOptions {
            pointer_id: Some(2),
            ..Default::default()
        };
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, Some(&p1));
        dispatch_interaction_pointer_up(&mut m, &arena, 50.0, 50.0, 0, 1000.0, Some(&p1));
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, Some(&p2));
        dispatch_interaction_pointer_up(&mut m, &arena, 50.0, 50.0, 0, 1200.0, Some(&p2));
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, Some(&p1));
        dispatch_interaction_pointer_up(&mut m, &arena, 50.0, 50.0, 0, 1300.0, Some(&p1));
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn dispatch_interaction_pointer_up_fires_release_outside() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_release_outside,
            cb,
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        dispatch_interaction_pointer_up(&mut m, &arena, 500.0, 500.0, 0, 0.0, None);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    // dispatch_interaction_pointer_move: over/out order

    #[test]
    fn dispatch_interaction_pointer_move_over_and_roll_over_order() {
        let (arena, mut m, _root, child) = hit_scene();
        let order = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let o1 = Arc::clone(&order);
        let o2 = Arc::clone(&order);
        let signals = enable_interaction_signals(&mut m, child);
        let _g1 = connect_signal(
            &signals.on_pointer_over,
            Arc::new(move |_: &PointerEventData| o1.lock().unwrap().push("over")),
            Default::default(),
        );
        let _g2 = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_roll_over,
            Arc::new(move |_: &PointerEventData| o2.lock().unwrap().push("rollOver")),
            Default::default(),
        );
        dispatch_interaction_pointer_move(&mut m, &arena, 50.0, 50.0, 0, None);
        assert_eq!(*order.lock().unwrap(), vec!["rollOver", "over"]);
    }

    #[test]
    fn dispatch_interaction_pointer_move_out_and_roll_out_order() {
        let (arena, mut m, _root, child) = hit_scene();
        let order = Arc::new(Mutex::new(Vec::<&'static str>::new()));
        let o1 = Arc::clone(&order);
        let o2 = Arc::clone(&order);
        let _g1 = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_out,
            Arc::new(move |_: &PointerEventData| o1.lock().unwrap().push("out")),
            Default::default(),
        );
        let _g2 = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_roll_out,
            Arc::new(move |_: &PointerEventData| o2.lock().unwrap().push("rollOut")),
            Default::default(),
        );
        dispatch_interaction_pointer_move(&mut m, &arena, 50.0, 50.0, 0, None);
        dispatch_interaction_pointer_move(&mut m, &arena, 500.0, 500.0, 0, None);
        assert_eq!(*order.lock().unwrap(), vec!["out", "rollOut"]);
    }

    // dispatch_interaction_wheel

    #[test]
    fn dispatch_interaction_wheel_delivers_delta() {
        let (arena, mut m, _root, child) = hit_scene();
        let dy = Arc::new(Mutex::new(0.0f32));
        let dyc = Arc::clone(&dy);
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_wheel,
            Arc::new(move |d: &PointerEventData| *dyc.lock().unwrap() = d.delta_y),
            Default::default(),
        );
        dispatch_interaction_wheel(&mut m, &arena, 50.0, 50.0, 0.0, -120.0, None);
        assert_eq!(*dy.lock().unwrap(), -120.0);
    }

    // dispatch_interaction_context_menu

    #[test]
    fn dispatch_interaction_context_menu_fires_on_hit_target() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_context_menu,
            cb,
            Default::default(),
        );
        dispatch_interaction_context_menu(&mut m, &arena, 50.0, 50.0, 2, None);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    // dispatch_interaction_pointer_cancel

    #[test]
    fn dispatch_interaction_pointer_cancel_fires_on_active_target() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_cancel,
            cb,
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        dispatch_interaction_pointer_cancel(&mut m, &arena, 60.0, 60.0, None);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn dispatch_interaction_pointer_cancel_clears_capture() {
        let (arena, mut m, _root, child) = hit_scene();
        let (count, cb) = counter();
        let (count_move, cb_move) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_cancel,
            cb,
            Default::default(),
        );
        let _g2 = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_move,
            cb_move,
            Default::default(),
        );
        let p3 = InteractionPointerOptions {
            pointer_id: Some(3),
            ..Default::default()
        };
        capture_interaction_pointer(&mut m, 3, child);
        dispatch_interaction_pointer_cancel(&mut m, &arena, 500.0, 500.0, Some(&p3));
        dispatch_interaction_pointer_move(&mut m, &arena, 500.0, 500.0, 0, Some(&p3));
        assert_eq!(count.load(Ordering::SeqCst), 1);
        assert_eq!(count_move.load(Ordering::SeqCst), 0);
    }

    // keyboard dispatch

    #[test]
    fn dispatch_interaction_key_down_fires_on_root() {
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let mut m = create_interaction_manager(root, opts());
        let got = Arc::new(Mutex::new(String::new()));
        let gc = Arc::clone(&got);
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, root).on_key_down,
            Arc::new(move |d: &KeyboardEventData| *gc.lock().unwrap() = d.key.clone()),
            Default::default(),
        );
        dispatch_interaction_key_down(&mut m, &arena, "a", 65, None);
        assert_eq!(*got.lock().unwrap(), "a");
    }

    #[test]
    fn dispatch_interaction_key_up_fires_on_root() {
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let mut m = create_interaction_manager(root, opts());
        let got = Arc::new(AtomicU32::new(0));
        let gc = Arc::clone(&got);
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, root).on_key_up,
            Arc::new(move |d: &KeyboardEventData| gc.store(d.key_code, Ordering::SeqCst)),
            Default::default(),
        );
        dispatch_interaction_key_up(&mut m, &arena, "a", 65, None);
        assert_eq!(got.load(Ordering::SeqCst), 65);
    }

    // enable / get signals

    #[test]
    fn enable_interaction_signals_returns_same_signals() {
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let mut m = create_interaction_manager(root, opts());
        // Connecting through the first enable must remain visible after a second
        // enable returns the existing signals rather than recreating them.
        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, root).on_pointer_down,
            cb,
            Default::default(),
        );
        assert!(
            enable_interaction_signals(&mut m, root)
                .on_pointer_down
                .has_listeners()
        );
        assert!(get_interaction_signals(&m, root).is_some());
        let _ = count;
    }

    #[test]
    fn get_interaction_signals_none_before_enable() {
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let m = create_interaction_manager(root, opts());
        assert!(get_interaction_signals(&m, root).is_none());
    }

    // tracked subscribers

    #[test]
    fn connect_interaction_signal_tracked_subscribers_only_skips_graph_scan() {
        let kind = display_object_kind();
        register_hit_test_point(kind, bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        set_bounds(&mut arena, root, 100.0, 100.0);
        let mut m = create_interaction_manager(
            root,
            InteractionManagerOptions {
                enabled: true,
                tracked_subscribers_only: true,
            },
        );
        let (count, cb) = counter();
        // Direct connection is invisible to tracked-only dispatch.
        let _direct = connect_signal(
            &enable_interaction_signals(&mut m, root).on_pointer_down,
            cb,
            Default::default(),
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        assert_eq!(count.load(Ordering::SeqCst), 0);

        // Tracked connection makes dispatch fire (both slots).
        let (_c2, cb2) = counter();
        let _tracked =
            connect_interaction_signal(&mut m, root, ON_POINTER_DOWN, cb2, Default::default());
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn connect_interaction_signal_once_clears_tracked_count() {
        let kind = display_object_kind();
        register_hit_test_point(kind, bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        set_bounds(&mut arena, root, 100.0, 100.0);
        let mut m = create_interaction_manager(
            root,
            InteractionManagerOptions {
                enabled: true,
                tracked_subscribers_only: true,
            },
        );
        let (count, cb) = counter();
        let _g = connect_interaction_signal(
            &mut m,
            root,
            ON_POINTER_DOWN,
            cb,
            SignalConnectOptions {
                once: true,
                priority: 0,
            },
        );
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    // connect_input_to_interaction

    #[test]
    fn connect_input_to_interaction_routes_pointer_down() {
        use flighthq_types::input::InputSignals;

        register_hit_test_point(display_object_kind(), bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let child = create_display_object(&mut arena);
        set_bounds(&mut arena, child, 100.0, 100.0);
        add_display_object_child(&mut arena, root, child);
        let mut m = create_interaction_manager(root, opts());

        let (count, cb) = counter();
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, child).on_pointer_down,
            cb,
            Default::default(),
        );

        let input = InputSignals::default();
        let manager = Arc::new(Mutex::new(m));
        let arena = Arc::new(Mutex::new(arena));
        let _guards =
            connect_input_to_interaction(&input, Arc::clone(&manager), Arc::clone(&arena), 1.0);

        let data = InputPointerData {
            x: 50.0,
            y: 50.0,
            ..Default::default()
        };
        emit_signal(&input.on_pointer_down, &data);
        assert_eq!(count.load(Ordering::SeqCst), 1);

        // Dropping the guards disconnects, so further input is ignored.
        drop(_guards);
        emit_signal(&input.on_pointer_down, &data);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn connect_keyboard_input_routes_key_down() {
        use flighthq_types::input::{InputKeyboardData, InputSignals};

        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        let mut m = create_interaction_manager(root, opts());

        let got = Arc::new(Mutex::new(String::new()));
        let gc = Arc::clone(&got);
        let _g = connect_signal(
            &enable_interaction_signals(&mut m, root).on_key_down,
            Arc::new(move |d: &KeyboardEventData| *gc.lock().unwrap() = d.key.clone()),
            Default::default(),
        );

        let input = InputSignals::default();
        let manager = Arc::new(Mutex::new(m));
        let arena = Arc::new(Mutex::new(arena));
        let _guards =
            connect_keyboard_input_to_interaction(&input, Arc::clone(&manager), Arc::clone(&arena));

        let data = InputKeyboardData {
            key: "a".to_string(),
            key_code: 97,
            ..Default::default()
        };
        emit_signal(&input.on_key_down, &data);
        assert_eq!(*got.lock().unwrap(), "a");
    }

    #[test]
    fn disconnect_interaction_signal_removes_tracked_cost() {
        let kind = display_object_kind();
        register_hit_test_point(kind, bounds_hit as HitTestFn);
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        set_bounds(&mut arena, root, 100.0, 100.0);
        let mut m = create_interaction_manager(
            root,
            InteractionManagerOptions {
                enabled: true,
                tracked_subscribers_only: true,
            },
        );
        let (count, cb) = counter();
        let guard =
            connect_interaction_signal(&mut m, root, ON_POINTER_DOWN, cb, Default::default());
        let id = guard.id();
        std::mem::forget(guard); // keep the slot connected, disconnect explicitly below
        disconnect_interaction_signal(&mut m, root, ON_POINTER_DOWN, id);
        dispatch_interaction_pointer_down(&mut m, &arena, 50.0, 50.0, 0, None);
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }
}
