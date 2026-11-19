//! flight-compiler: target-native

use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};

use flight_entity::{Ref, UnknownValue};
use flight_input::PointerType;

use flight_node::{NodeRef, for_each_node_child, get_node_parent};
use flight_signals::{
    SignalConnectOptions, SignalSlot, SlotId, connect_signal, connect_signal_tracked,
    create_signal, disconnect_signal, disconnect_signal_connection, emit_signal, has_signal_slots,
    is_slot_connected,
};

use crate::hit_tests::{
    HitTestContext, create_hit_test_context, find_graph_hit_target, find_graph_hit_target_precise,
};
use crate::node_interaction_state::get_node_cursor;
use crate::types::{
    AnyInteractionSignalSlot, CursorBackend, InteractionDispatchLayer,
    InteractionDispatchLayerEntry, InteractionDispatchLayerOptions, InteractionManager,
    InteractionManagerOptions, InteractionPointerOptions, InteractionPointerState,
    InteractionSignalName, InteractionSignals, InteractionTrackedSignalSlots, KeyboardEventData,
    PointerEventData, create_interaction_manager_options,
};

const CANCEL_SIGNAL_NAMES: &[InteractionSignalName] = &[
    InteractionSignalName::OnPointerCancel,
    InteractionSignalName::OnPointerOut,
    InteractionSignalName::OnPointerRollOut,
];

const DOWN_SIGNAL_NAMES: &[InteractionSignalName] = &[
    InteractionSignalName::OnClick,
    InteractionSignalName::OnDoubleClick,
    InteractionSignalName::OnPointerCancel,
    InteractionSignalName::OnPointerDoubleClick,
    InteractionSignalName::OnPointerDown,
    InteractionSignalName::OnReleaseOutside,
];

const MOVE_SIGNAL_NAMES: &[InteractionSignalName] = &[
    InteractionSignalName::OnPointerDoubleClick,
    InteractionSignalName::OnPointerMove,
    InteractionSignalName::OnPointerOut,
    InteractionSignalName::OnPointerOver,
    InteractionSignalName::OnPointerRollOut,
    InteractionSignalName::OnPointerRollOver,
];

const UP_SIGNAL_NAMES: &[InteractionSignalName] = &[
    InteractionSignalName::OnClick,
    InteractionSignalName::OnDoubleClick,
    InteractionSignalName::OnPointerDoubleClick,
    InteractionSignalName::OnPointerUp,
    InteractionSignalName::OnReleaseOutside,
];

// One event a dispatch delivers after the manager is unlocked.
enum InteractionDelivery {
    Cursor {
        backend: Arc<dyn CursorBackend>,
        cursor: Option<String>,
    },
    Keyboard {
        name: InteractionSignalName,
        data: KeyboardEventData,
    },
    Pointer {
        target: NodeRef,
        name: InteractionSignalName,
        data: PointerEventData,
        bubble: bool,
    },
}

// What one dispatch decided while the manager was locked: its state is already updated, and these
// deliveries run afterwards, in order, with the lock released.
struct InteractionDispatchPlan {
    deliveries: Vec<InteractionDelivery>,
    layers: Option<Vec<InteractionDispatchLayer>>,
    root: NodeRef,
}

// What hit testing needs, captured under a short read lock so registered hit tests run unlocked.
struct InteractionTargeting {
    captured: Option<NodeRef>,
    enabled: bool,
    hit_test_ctx: HitTestContext,
    precise: bool,
    root: NodeRef,
}

fn create_interaction_dispatch_plan(manager: &InteractionManager) -> InteractionDispatchPlan {
    return InteractionDispatchPlan {
        deliveries: Vec::new(),
        layers: manager
            .dispatch_layers
            .as_ref()
            .map(|entries| entries.iter().map(|entry| entry.layer.clone()).collect()),
        root: manager.root.clone(),
    };
}

/// Creates a manager for `root` (TS `createInteractionManager`). `None` selects the default
/// options. The manager is returned as the shared handle the input and focus connectors retain.
pub fn create_interaction_manager(
    root: NodeRef,
    options: Option<&InteractionManagerOptions>,
) -> Ref<InteractionManager> {
    let defaults = create_interaction_manager_options();
    let options = options.unwrap_or(&defaults);
    let mut out = InteractionManager {
        cursor_backend: None,
        cursor_target: None,
        dispatch_layers: None,
        double_click_delay: 500.0,
        double_click_distance: 4.0,
        enabled: true,
        hit_test_ctx: create_hit_test_context(),
        pointer_captures: HashMap::new(),
        pointer_states: HashMap::new(),
        precise: false,
        root: root.clone(),
        spatial_index: None,
        signal_subscriber_counts: HashMap::new(),
        suppress_touch_hover: true,
        tracked_signal_slots: HashMap::new(),
        tracked_subscribers_only: false,
    };
    initialize_interaction_manager(&mut out, root, options);
    return Arc::new(RwLock::new(out));
}

pub fn create_interaction_signals() -> InteractionSignals {
    return InteractionSignals {
        on_click: create_signal(),
        on_context_menu: create_signal(),
        on_double_click: create_signal(),
        on_focus_in: create_signal(),
        on_focus_out: create_signal(),
        on_key_down: create_signal(),
        on_key_up: create_signal(),
        on_pointer_cancel: create_signal(),
        on_pointer_double_click: create_signal(),
        on_pointer_down: create_signal(),
        on_pointer_move: create_signal(),
        on_pointer_out: create_signal(),
        on_pointer_over: create_signal(),
        on_pointer_roll_out: create_signal(),
        on_pointer_roll_over: create_signal(),
        on_pointer_up: create_signal(),
        on_release_outside: create_signal(),
        on_wheel: create_signal(),
    };
}

pub fn initialize_interaction_manager(
    out: &mut InteractionManager,
    root: NodeRef,
    options: &InteractionManagerOptions,
) {
    out.cursor_backend = options.cursor_backend.clone();
    out.cursor_target = None;
    out.dispatch_layers = None;
    out.double_click_delay = options.double_click_delay.unwrap_or(500.0);
    out.double_click_distance = options.double_click_distance.unwrap_or(4.0);
    out.enabled = options.enabled.unwrap_or(true);
    out.pointer_captures = HashMap::new();
    out.pointer_states = HashMap::new();
    out.precise = options.precise.unwrap_or(false);
    out.root = root;
    out.spatial_index = options.spatial_index.clone();
    out.suppress_touch_hover = options.suppress_touch_hover.unwrap_or(true);
    out.signal_subscriber_counts = HashMap::new();
    out.tracked_signal_slots = HashMap::new();
    out.tracked_subscribers_only = options.tracked_subscribers_only.unwrap_or(false);
}

pub fn initialize_interaction_signals(out: &mut InteractionSignals) {
    out.on_click = create_signal();
    out.on_context_menu = create_signal();
    out.on_double_click = create_signal();
    out.on_focus_in = create_signal();
    out.on_focus_out = create_signal();
    out.on_key_down = create_signal();
    out.on_key_up = create_signal();
    out.on_pointer_cancel = create_signal();
    out.on_pointer_double_click = create_signal();
    out.on_pointer_down = create_signal();
    out.on_pointer_move = create_signal();
    out.on_pointer_out = create_signal();
    out.on_pointer_over = create_signal();
    out.on_pointer_roll_out = create_signal();
    out.on_pointer_roll_over = create_signal();
    out.on_pointer_up = create_signal();
    out.on_release_outside = create_signal();
    out.on_wheel = create_signal();
}

// The cursor the backend should show for `target`, captured with the backend for delivery once
// the manager is unlocked; `None` when there is no backend.
fn capture_interaction_cursor(
    manager: &InteractionManager,
    target: Option<&NodeRef>,
) -> Option<InteractionDelivery> {
    let backend = manager.cursor_backend.clone()?;
    let cursor = resolve_interaction_cursor(target, &manager.root);
    return Some(InteractionDelivery::Cursor { backend, cursor });
}

pub fn capture_interaction_pointer(
    manager: &mut InteractionManager,
    pointer_id: i32,
    target: NodeRef,
) {
    manager.pointer_captures.insert(pointer_id, target);
}

fn capture_interaction_targeting(
    manager: &InteractionManager,
    pointer_id: i32,
) -> InteractionTargeting {
    return InteractionTargeting {
        captured: manager.pointer_captures.get(&pointer_id).cloned(),
        enabled: manager.enabled,
        hit_test_ctx: manager.hit_test_ctx.clone(),
        precise: manager.precise,
        root: manager.root.clone(),
    };
}

fn chain_contains(chain: &[NodeRef], node: &NodeRef) -> bool {
    return chain.iter().any(|n| Arc::ptr_eq(n, node));
}

// flight-lint: allow(conform-params) D5: manager is Arc<RwLock> for shared capture by signal slots; returns dispose closure
// flight-lint: allow(contract-vocabulary) D5: RwLock is required for shared mutable access from signal slot callbacks
// flight-lint: allow(hashmap-iteration) D5: pointer state reset on dispose visits all entries; iteration order is irrelevant
pub fn connect_input_to_interaction(
    input: &crate::types::InteractionInputSource,
    manager: Ref<InteractionManager>,
    coord_scale: f64,
) -> Arc<dyn Fn() + Send + Sync> {
    let sx = move |v: f64| -> f64 {
        return v * coord_scale;
    };

    let mgr = manager.clone();
    let on_key_down: Arc<dyn Fn(&flight_input::InputKeyboardData) + Send + Sync> =
        Arc::new(move |data| {
            let modifiers = KeyboardEventData {
                alt_key: data.alt_key,
                ctrl_key: data.ctrl_key,
                key: data.key.clone(),
                key_code: data.key_code,
                meta_key: data.meta_key,
                shift_key: data.shift_key,
            };
            dispatch_interaction_key_down(&mgr, &data.key, data.key_code, Some(&modifiers));
        });

    let mgr = manager.clone();
    let on_key_up: Arc<dyn Fn(&flight_input::InputKeyboardData) + Send + Sync> =
        Arc::new(move |data| {
            let modifiers = KeyboardEventData {
                alt_key: data.alt_key,
                ctrl_key: data.ctrl_key,
                key: data.key.clone(),
                key_code: data.key_code,
                meta_key: data.meta_key,
                shift_key: data.shift_key,
            };
            dispatch_interaction_key_up(&mgr, &data.key, data.key_code, Some(&modifiers));
        });

    let mgr = manager.clone();
    let on_pointer_cancel: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> =
        Arc::new(move |data| {
            let opts = input_pointer_to_options(data);
            dispatch_interaction_pointer_cancel(&mgr, sx(data.x), sx(data.y), Some(&opts));
        });

    let mgr = manager.clone();
    let on_pointer_down: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> =
        Arc::new(move |data| {
            let opts = input_pointer_to_options(data);
            dispatch_interaction_pointer_down(
                &mgr,
                sx(data.x),
                sx(data.y),
                data.button,
                Some(&opts),
            );
        });

    let mgr = manager.clone();
    let on_pointer_move: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> =
        Arc::new(move |data| {
            let opts = input_pointer_to_options(data);
            dispatch_interaction_pointer_move(
                &mgr,
                sx(data.x),
                sx(data.y),
                data.button,
                Some(&opts),
            );
        });

    let mgr = manager.clone();
    let on_pointer_up: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> =
        Arc::new(move |data| {
            let opts = input_pointer_to_options(data);
            dispatch_interaction_pointer_up(
                &mgr,
                sx(data.x),
                sx(data.y),
                data.button,
                Some(data.time_stamp),
                Some(&opts),
            );
        });

    let mgr = manager.clone();
    let on_wheel: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> =
        Arc::new(move |data| {
            let opts = input_pointer_to_options(data);
            dispatch_interaction_wheel(
                &mgr,
                sx(data.x),
                sx(data.y),
                data.delta_x,
                data.delta_y,
                Some(&opts),
            );
        });

    // Only the registrations are retained: tracked connections reach the input signals weakly, so
    // the disposer never keeps the input manager alive, and the input lock is held only to connect.
    let source = input.read().unwrap();
    let connections = [
        connect_signal_tracked(&source.on_key_down, on_key_down, None),
        connect_signal_tracked(&source.on_key_up, on_key_up, None),
        connect_signal_tracked(&source.on_pointer_cancel, on_pointer_cancel, None),
        connect_signal_tracked(&source.on_pointer_down, on_pointer_down, None),
        connect_signal_tracked(&source.on_pointer_move, on_pointer_move, None),
        connect_signal_tracked(&source.on_pointer_up, on_pointer_up, None),
        connect_signal_tracked(&source.on_wheel, on_wheel, None),
    ];
    drop(source);

    return Arc::new(move || {
        for connection in &connections {
            disconnect_signal_connection(connection);
        }
        let mut m = manager.write().unwrap();
        for state in m.pointer_states.values_mut() {
            reset_interaction_click_state(state);
        }
    });
}

pub fn connect_interaction_dispatch_layer(
    manager: &mut InteractionManager,
    layer: InteractionDispatchLayer,
    options: &InteractionDispatchLayerOptions,
) {
    let entry = InteractionDispatchLayerEntry {
        layer,
        priority: options.priority.unwrap_or(0),
    };
    if manager.dispatch_layers.is_none() {
        manager.dispatch_layers = Some(Vec::new());
    }
    let layers = manager.dispatch_layers.as_mut().unwrap();
    layers.push(entry);
    layers.sort_by(|a, b| a.priority.cmp(&b.priority));
}

/// Connects `slot` to `target`'s `name` signal and counts it as a manager subscriber (TS
/// `connectInteractionSignal`). Connecting the same slot `Arc` to the same target and name while
/// it is still connected returns the existing registration without counting it twice. A `once`
/// connection stops being tracked and counted after its first call. The signal connection is made
/// under the manager lock and the signal group's read lock, never the node's, and nothing is
/// dropped under any of them.
/// `name` must be a pointer signal, since `slot` takes `PointerEventData`.
// flight-lint: allow(conform-params) D4: returns the SlotId disconnect_interaction_signal takes, since a C caller cannot reproduce an Arc identity
pub fn connect_interaction_signal(
    manager: &Ref<InteractionManager>,
    target: &NodeRef,
    name: InteractionSignalName,
    slot: AnyInteractionSignalSlot,
    options: Option<&SignalConnectOptions>,
) -> SlotId {
    assert!(
        is_pointer_interaction_signal_name(name),
        "connect_interaction_signal: {name:?} is not a pointer signal"
    );
    let signals = enable_interaction_signals(target);
    let target_key = get_interaction_tracking_key(target);
    let slot_key = Arc::as_ptr(&slot) as *const () as usize;
    let once = options.and_then(|o| o.once).unwrap_or(false);
    let registered: Arc<OnceLock<SlotId>> = Arc::new(OnceLock::new());
    let connected: SignalSlot<PointerEventData> = if once {
        let (weak, registered) = (Arc::downgrade(manager), registered.clone());
        Arc::new(move |data: &PointerEventData| {
            slot(data);
            let Some(manager) = weak.upgrade() else {
                return;
            };
            let detached = {
                let mut guard = manager.write().unwrap();
                let Some(id) = registered.get() else {
                    return;
                };
                remove_tracked_interaction_signal_slot(&mut guard, target_key, name, slot_key, *id)
            };
            drop(detached);
        })
    } else {
        slot
    };

    let mut guard = manager.write().unwrap();
    let tracked = guard
        .tracked_signal_slots
        .get(&target_key)
        .and_then(|entry| entry.slots.get(&name))
        .and_then(|slots| slots.get(&slot_key))
        .copied();
    // Connected in place on the group's own signal, never a clone: a clone carries its own emit
    // cell, so connecting through one could not re-arm a signal whose emitter a clear or a detach
    // reset. Emission clones the signal and releases the group lock before any slot runs.
    let group = signals.read().unwrap();
    let signal = get_signal_by_name_pointer(&group, name);
    if let Some(id) = tracked
        && is_slot_connected(signal, id)
    {
        drop(group);
        drop(guard);
        drop(connected);
        return id;
    }
    let id = connect_signal(signal, connected, options);
    drop(group);
    let _ = registered.set(id);
    guard
        .tracked_signal_slots
        .entry(target_key)
        .or_insert_with(|| InteractionTrackedSignalSlots {
            slots: HashMap::new(),
            target: target.clone(),
        })
        .slots
        .entry(name)
        .or_default()
        .insert(slot_key, id);
    // A tracked registration that is no longer connected (its signal was cleared) is replaced in
    // place and is already counted, so the count stays equal to the tracked registrations.
    if tracked.is_none() {
        *guard.signal_subscriber_counts.entry(name).or_insert(0) += 1;
    }
    return id;
}

// Runs a plan's deliveries in order with no manager lock held, so dispatch layers, node signal
// slots and the cursor backend may read or mutate the manager they were dispatched from.
fn deliver_interaction_dispatch_plan(plan: InteractionDispatchPlan) {
    for delivery in &plan.deliveries {
        match delivery {
            InteractionDelivery::Pointer {
                target,
                name,
                data,
                bubble,
            } => {
                let pass = plan
                    .layers
                    .as_ref()
                    .is_none_or(|layers| layers.iter().all(|layer| layer(target, *name, data)));
                if !pass {
                    continue;
                }
                if *bubble {
                    emit_interaction_signal(target, &plan.root, *name, data);
                } else {
                    emit_interaction_signal_direct(target, *name, data);
                }
            }
            InteractionDelivery::Keyboard { name, data } => {
                emit_keyboard_signal(&plan.root, &plan.root, *name, data);
            }
            InteractionDelivery::Cursor { backend, cursor } => {
                backend.set_cursor(cursor.as_deref());
            }
        }
    }
}

/// Disconnects the registration `connect_interaction_signal` returned for `target` and `name`,
/// and stops counting it (TS `disconnectInteractionSignal`). Only registrations made through
/// `connect_interaction_signal` are affected; an unknown or already-removed id does nothing. The
/// slot is dropped after every lock is released, so its teardown may re-enter the manager.
// flight-lint: allow(conform-params) D4: disconnects by the SlotId connect_interaction_signal returned
// flight-lint: allow(hashmap-iteration) registration ids are unique, so at most one entry matches
pub fn disconnect_interaction_signal(
    manager: &Ref<InteractionManager>,
    target: &NodeRef,
    name: InteractionSignalName,
    id: SlotId,
) {
    let target_key = get_interaction_tracking_key(target);
    let detached = {
        let mut guard = manager.write().unwrap();
        let slot_key = guard
            .tracked_signal_slots
            .get(&target_key)
            .and_then(|entry| entry.slots.get(&name))
            .and_then(|slots| {
                slots
                    .iter()
                    .find(|(_, tracked)| tracked.value == id.value)
                    .map(|(slot_key, _)| *slot_key)
            });
        let Some(slot_key) = slot_key else {
            return;
        };
        remove_tracked_interaction_signal_slot(&mut guard, target_key, name, slot_key, id)
    };
    drop(detached);
    if let Some(signals) = get_interaction_signals(target) {
        let signal = get_signal_by_name_pointer(&signals.read().unwrap(), name).clone();
        disconnect_signal(&signal, id);
    }
}

pub fn dispatch_interaction_context_menu(
    manager: &Ref<InteractionManager>,
    x: f64,
    y: f64,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    dispatch_pointer_signal_at(
        manager,
        InteractionSignalName::OnContextMenu,
        x,
        y,
        button,
        0.0,
        0.0,
        options,
    );
}

pub fn dispatch_interaction_key_down(
    manager: &Ref<InteractionManager>,
    key: &str,
    key_code: i32,
    modifiers: Option<&KeyboardEventData>,
) {
    dispatch_keyboard_signal(
        manager,
        InteractionSignalName::OnKeyDown,
        key,
        key_code,
        modifiers,
    );
}

pub fn dispatch_interaction_key_up(
    manager: &Ref<InteractionManager>,
    key: &str,
    key_code: i32,
    modifiers: Option<&KeyboardEventData>,
) {
    dispatch_keyboard_signal(
        manager,
        InteractionSignalName::OnKeyUp,
        key,
        key_code,
        modifiers,
    );
}

pub fn dispatch_interaction_pointer_cancel(
    manager: &Ref<InteractionManager>,
    x: f64,
    y: f64,
    options: Option<&InteractionPointerOptions>,
) {
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let plan = {
        let mut manager = manager.write().unwrap();
        if let Some(state) = manager.pointer_states.get_mut(&pointer_id) {
            reset_interaction_click_state(state);
        }
        if !is_pointer_signal_needed(&manager, CANCEL_SIGNAL_NAMES) {
            return;
        }
        let mut plan = create_interaction_dispatch_plan(&manager);
        get_interaction_pointer_state(&mut manager, pointer_id);
        let state = manager.pointer_states.get(&pointer_id).unwrap();
        let captured = manager.pointer_captures.get(&pointer_id).cloned();
        let old_target = state.pointer_over_target.clone();
        let target = captured
            .or_else(|| state.pointer_down_target.clone())
            .or_else(|| old_target.clone());
        let state = manager.pointer_states.get_mut(&pointer_id).unwrap();
        state.pointer_down_target = None;
        state.pointer_over_target = None;
        manager.pointer_captures.remove(&pointer_id);
        if let Some(target_node) = target {
            let data = make_pointer_data(&target_node, x, y, -1, 0.0, 0.0, options);
            plan.deliveries.push(InteractionDelivery::Pointer {
                target: target_node,
                name: InteractionSignalName::OnPointerCancel,
                data,
                bubble: true,
            });
        }
        if let Some(ref old) = old_target {
            plan_pointer_rollover_change(&mut manager, Some(old), None, &mut plan);
        }
        plan
    };
    deliver_interaction_dispatch_plan(plan);
}

pub fn dispatch_interaction_pointer_down(
    manager: &Ref<InteractionManager>,
    x: f64,
    y: f64,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let Some(targeting) = snapshot_interaction_targeting(manager, pointer_id, DOWN_SIGNAL_NAMES)
    else {
        return;
    };
    let Some(target) = find_interaction_target(&targeting, x, y) else {
        return;
    };
    let plan = {
        let mut manager = manager.write().unwrap();
        let mut plan = create_interaction_dispatch_plan(&manager);
        get_interaction_pointer_state(&mut manager, pointer_id).pointer_down_target =
            Some(target.clone());
        let data = make_pointer_data(&target, x, y, button, 0.0, 0.0, options);
        plan.deliveries.push(InteractionDelivery::Pointer {
            target,
            name: InteractionSignalName::OnPointerDown,
            data,
            bubble: true,
        });
        plan
    };
    deliver_interaction_dispatch_plan(plan);
}

pub fn dispatch_interaction_pointer_move(
    manager: &Ref<InteractionManager>,
    x: f64,
    y: f64,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let targeting = {
        let guard = manager.read().unwrap();
        let cursor_needed = guard.enabled && guard.cursor_backend.is_some();
        if !is_pointer_signal_needed(&guard, MOVE_SIGNAL_NAMES) && !cursor_needed {
            return;
        }
        capture_interaction_targeting(&guard, pointer_id)
    };
    let target = find_interaction_target(&targeting, x, y);
    let plan = {
        let mut manager = manager.write().unwrap();
        let old_target = get_interaction_pointer_state(&mut manager, pointer_id)
            .pointer_over_target
            .clone();
        if target.is_none() && old_target.is_none() {
            return;
        }
        let mut plan = create_interaction_dispatch_plan(&manager);
        let hover = !(manager.suppress_touch_hover
            && options
                .and_then(|o| o.pointer_type)
                .unwrap_or(PointerType::Mouse)
                == PointerType::Touch);
        if hover {
            if let Some(state) = manager.pointer_states.get_mut(&pointer_id) {
                state.pointer_over_target = target.clone();
            }
        }
        if hover && !node_ref_eq(&target, &old_target) {
            plan_pointer_rollover_change(
                &mut manager,
                old_target.as_ref(),
                target.as_ref(),
                &mut plan,
            );
        }
        if let Some(target_node) = target {
            let data = make_pointer_data(&target_node, x, y, button, 0.0, 0.0, options);
            plan.deliveries.push(InteractionDelivery::Pointer {
                target: target_node,
                name: InteractionSignalName::OnPointerMove,
                data,
                bubble: true,
            });
        }
        plan
    };
    deliver_interaction_dispatch_plan(plan);
}

// flight-lint: allow(f64) D1: click timestamps and double-click delay are JS millisecond-precision doubles
pub fn dispatch_interaction_pointer_up(
    manager: &Ref<InteractionManager>,
    x: f64,
    y: f64,
    button: i32,
    time: Option<f64>,
    options: Option<&InteractionPointerOptions>,
) {
    let click_time = time
        .or_else(|| options.and_then(|o| o.time_stamp))
        .unwrap_or(0.0);
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let Some(targeting) = snapshot_interaction_targeting(manager, pointer_id, UP_SIGNAL_NAMES)
    else {
        return;
    };
    let target = find_interaction_target(&targeting, x, y);
    let plan = {
        let mut manager = manager.write().unwrap();
        let mut plan = create_interaction_dispatch_plan(&manager);
        let state = get_interaction_pointer_state(&mut manager, pointer_id);
        let down_target = state.pointer_down_target.take();
        if let Some(ref target_node) = target {
            let data = make_pointer_data(target_node, x, y, button, 0.0, 0.0, options);
            plan.deliveries.push(InteractionDelivery::Pointer {
                target: target_node.clone(),
                name: InteractionSignalName::OnPointerUp,
                data,
                bubble: true,
            });
        }
        if let Some(down) = down_target {
            let data = make_pointer_data(&down, x, y, button, 0.0, 0.0, options);
            if node_ref_eq(&target, &Some(down.clone())) {
                plan.deliveries.push(InteractionDelivery::Pointer {
                    target: down.clone(),
                    name: InteractionSignalName::OnClick,
                    data: make_pointer_data(&down, x, y, button, 0.0, 0.0, options),
                    bubble: true,
                });
                let double_click_delay = manager.double_click_delay;
                let state = manager.pointer_states.get_mut(&pointer_id).unwrap();
                let legacy_elapsed = click_time - state.last_click_time;
                if node_ref_eq(&state.last_click_target, &target)
                    && legacy_elapsed >= 0.0
                    && legacy_elapsed <= double_click_delay
                {
                    plan.deliveries.push(InteractionDelivery::Pointer {
                        target: down,
                        name: InteractionSignalName::OnDoubleClick,
                        data,
                        bubble: true,
                    });
                    state.last_click_target = None;
                    state.last_click_time = f64::NEG_INFINITY;
                } else {
                    state.last_click_target = target.clone();
                    state.last_click_time = click_time;
                }
            } else {
                reset_interaction_click_state(manager.pointer_states.get_mut(&pointer_id).unwrap());
                plan.deliveries.push(InteractionDelivery::Pointer {
                    target: down,
                    name: InteractionSignalName::OnReleaseOutside,
                    data,
                    bubble: true,
                });
            }
        }
        plan
    };
    deliver_interaction_dispatch_plan(plan);
}

pub fn dispatch_interaction_wheel(
    manager: &Ref<InteractionManager>,
    x: f64,
    y: f64,
    delta_x: f64,
    delta_y: f64,
    options: Option<&InteractionPointerOptions>,
) {
    dispatch_pointer_signal_at(
        manager,
        InteractionSignalName::OnWheel,
        x,
        y,
        0,
        delta_x,
        delta_y,
        options,
    );
}

fn dispatch_keyboard_signal(
    manager: &Ref<InteractionManager>,
    name: InteractionSignalName,
    key: &str,
    key_code: i32,
    modifiers: Option<&KeyboardEventData>,
) {
    let plan = {
        let manager = manager.read().unwrap();
        if !manager.enabled {
            return;
        }
        let mut plan = create_interaction_dispatch_plan(&manager);
        plan.deliveries.push(InteractionDelivery::Keyboard {
            name,
            data: KeyboardEventData {
                alt_key: modifiers.map_or(false, |m| m.alt_key),
                ctrl_key: modifiers.map_or(false, |m| m.ctrl_key),
                key: key.to_string(),
                key_code,
                meta_key: modifiers.map_or(false, |m| m.meta_key),
                shift_key: modifiers.map_or(false, |m| m.shift_key),
            },
        });
        plan
    };
    deliver_interaction_dispatch_plan(plan);
}

fn dispatch_pointer_signal_at(
    manager: &Ref<InteractionManager>,
    name: InteractionSignalName,
    x: f64,
    y: f64,
    button: i32,
    delta_x: f64,
    delta_y: f64,
    options: Option<&InteractionPointerOptions>,
) {
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let Some(targeting) = snapshot_interaction_targeting(manager, pointer_id, &[name]) else {
        return;
    };
    let Some(target) = find_interaction_target(&targeting, x, y) else {
        return;
    };
    let mut plan = create_interaction_dispatch_plan(&manager.read().unwrap());
    let data = make_pointer_data(&target, x, y, button, delta_x, delta_y, options);
    plan.deliveries.push(InteractionDelivery::Pointer {
        target,
        name,
        data,
        bubble: true,
    });
    deliver_interaction_dispatch_plan(plan);
}

fn emit_interaction_signal(
    target: &NodeRef,
    root: &NodeRef,
    name: InteractionSignalName,
    data: &PointerEventData,
) {
    let mut current: Option<NodeRef> = Some(target.clone());
    while let Some(ref node) = current {
        emit_interaction_signal_direct(node, name, data);
        if Arc::ptr_eq(node, root) {
            break;
        }
        current = get_node_parent(node);
    }
}

// The node's signal is cloned under its group's read lock and emitted after the lock drops, so a
// slot may reach the same signal group again.
fn emit_interaction_signal_direct(
    target: &NodeRef,
    name: InteractionSignalName,
    data: &PointerEventData,
) {
    let signal = get_interaction_signals(target)
        .map(|signals| get_signal_by_name_pointer(&signals.read().unwrap(), name).clone());
    if let Some(signal) = signal {
        emit_signal(&signal, data);
    }
}

fn emit_keyboard_signal(
    target: &NodeRef,
    root: &NodeRef,
    name: InteractionSignalName,
    data: &KeyboardEventData,
) {
    let mut current: Option<NodeRef> = Some(target.clone());
    while let Some(ref node) = current {
        let signal = get_interaction_signals(node)
            .map(|signals| get_signal_by_name_keyboard(&signals.read().unwrap(), name).clone());
        if let Some(signal) = signal {
            emit_signal(&signal, data);
        }
        if Arc::ptr_eq(node, root) {
            break;
        }
        current = get_node_parent(node);
    }
}

// flight-lint: allow(contract-vocabulary) D5: InteractionSignals stored in Unknown slot require Arc<RwLock> for shared mutable access
pub fn enable_interaction_signals(source: &NodeRef) -> Ref<InteractionSignals> {
    {
        let node = source.read().unwrap();
        let runtime = node.node_runtime();
        if let Some(ref signals) = runtime.interaction_signals {
            if let Some(existing) = signals.downcast_ref::<Arc<RwLock<InteractionSignals>>>() {
                return existing.clone();
            }
        }
    }
    let signals = Arc::new(RwLock::new(create_interaction_signals()));
    let mut node = source.write().unwrap();
    let runtime = node.node_runtime_mut();
    runtime.interaction_signals = Some(Arc::new(signals.clone()) as UnknownValue);
    return signals;
}

// Runs the hit tests with no manager lock held: registered hit-test functions are caller code.
fn find_interaction_target(targeting: &InteractionTargeting, x: f64, y: f64) -> Option<NodeRef> {
    if !targeting.enabled {
        return None;
    }
    if let Some(captured) = &targeting.captured {
        return Some(captured.clone());
    }
    return if targeting.precise {
        find_graph_hit_target_precise(&targeting.hit_test_ctx, &targeting.root, x, y)
    } else {
        find_graph_hit_target(&targeting.hit_test_ctx, &targeting.root, x, y)
    };
}

fn get_interaction_chain(target: &NodeRef, root: &NodeRef) -> Vec<NodeRef> {
    let mut out = Vec::new();
    let mut current: Option<NodeRef> = Some(target.clone());
    while let Some(ref node) = current {
        out.push(node.clone());
        if Arc::ptr_eq(node, root) {
            break;
        }
        current = get_node_parent(node);
    }
    return out;
}

fn get_interaction_pointer_state(
    manager: &mut InteractionManager,
    pointer_id: i32,
) -> &mut InteractionPointerState {
    return manager
        .pointer_states
        .entry(pointer_id)
        .or_insert_with(InteractionPointerState::new);
}

// flight-lint: allow(contract-vocabulary) D5: InteractionSignals stored in Unknown slot require Arc<RwLock> for shared mutable access
pub fn get_interaction_signals(source: &NodeRef) -> Option<Ref<InteractionSignals>> {
    let node = source.read().unwrap();
    let runtime = node.node_runtime();
    return runtime
        .interaction_signals
        .as_ref()
        .and_then(|u| u.downcast_ref::<Arc<RwLock<InteractionSignals>>>())
        .cloned();
}

// The tracking key of a target node: its allocation address.
fn get_interaction_tracking_key(target: &NodeRef) -> usize {
    return Arc::as_ptr(target) as *const () as usize;
}

fn get_signal_by_name_keyboard<'a>(
    signals: &'a InteractionSignals,
    name: InteractionSignalName,
) -> &'a flight_signals::Signal<KeyboardEventData> {
    return match name {
        InteractionSignalName::OnKeyDown => &signals.on_key_down,
        InteractionSignalName::OnKeyUp => &signals.on_key_up,
        _ => &signals.on_key_down,
    };
}

fn get_signal_by_name_pointer<'a>(
    signals: &'a InteractionSignals,
    name: InteractionSignalName,
) -> &'a flight_signals::Signal<PointerEventData> {
    return match name {
        InteractionSignalName::OnClick => &signals.on_click,
        InteractionSignalName::OnContextMenu => &signals.on_context_menu,
        InteractionSignalName::OnDoubleClick => &signals.on_double_click,
        InteractionSignalName::OnPointerCancel => &signals.on_pointer_cancel,
        InteractionSignalName::OnPointerDoubleClick => &signals.on_pointer_double_click,
        InteractionSignalName::OnPointerDown => &signals.on_pointer_down,
        InteractionSignalName::OnPointerMove => &signals.on_pointer_move,
        InteractionSignalName::OnPointerOut => &signals.on_pointer_out,
        InteractionSignalName::OnPointerOver => &signals.on_pointer_over,
        InteractionSignalName::OnPointerRollOut => &signals.on_pointer_roll_out,
        InteractionSignalName::OnPointerRollOver => &signals.on_pointer_roll_over,
        InteractionSignalName::OnPointerUp => &signals.on_pointer_up,
        InteractionSignalName::OnReleaseOutside => &signals.on_release_outside,
        InteractionSignalName::OnWheel => &signals.on_wheel,
        _ => &signals.on_click,
    };
}

// Whether any node in `source`'s subtree has a slot connected to its `name` pointer signal (TS
// `hasInteractionSignalSubscriberInGraph`), for managers that do not require tracked subscribers.
fn has_interaction_signal_subscriber_in_graph(
    source: &NodeRef,
    name: InteractionSignalName,
) -> bool {
    if let Some(signals) = get_interaction_signals(source)
        && has_signal_slots(get_signal_by_name_pointer(&signals.read().unwrap(), name))
    {
        return true;
    }
    let mut found = false;
    for_each_node_child(source, &mut |child, _| {
        found = has_interaction_signal_subscriber_in_graph(child, name);
        return !found;
    });
    return found;
}

fn input_pointer_to_options(data: &flight_input::InputPointerData) -> InteractionPointerOptions {
    return InteractionPointerOptions {
        alt_key: Some(data.alt_key),
        buttons: Some(data.buttons as i32),
        ctrl_key: Some(data.ctrl_key),
        meta_key: Some(data.meta_key),
        pointer_id: Some(data.pointer_id),
        pointer_type: Some(data.pointer_type),
        shift_key: Some(data.shift_key),
        time_stamp: Some(data.time_stamp),
    };
}

pub fn invalidate_interaction_cursor(manager: &Ref<InteractionManager>) {
    let delivery = {
        let manager = manager.read().unwrap();
        capture_interaction_cursor(&manager, manager.cursor_target.as_ref())
    };
    if let Some(InteractionDelivery::Cursor { backend, cursor }) = delivery {
        backend.set_cursor(cursor.as_deref());
    }
}

fn is_pointer_interaction_signal_name(name: InteractionSignalName) -> bool {
    return !matches!(
        name,
        InteractionSignalName::OnFocusIn
            | InteractionSignalName::OnFocusOut
            | InteractionSignalName::OnKeyDown
            | InteractionSignalName::OnKeyUp
    );
}

fn is_pointer_signal_needed(manager: &InteractionManager, names: &[InteractionSignalName]) -> bool {
    if !manager.enabled {
        return false;
    }
    if manager.dispatch_layers.is_some() {
        return true;
    }
    for name in names {
        if manager
            .signal_subscriber_counts
            .get(name)
            .copied()
            .unwrap_or(0)
            > 0
        {
            return true;
        }
    }
    if manager.tracked_subscribers_only {
        return false;
    }
    return names
        .iter()
        .any(|name| has_interaction_signal_subscriber_in_graph(&manager.root, *name));
}

fn make_pointer_data(
    target: &NodeRef,
    x: f64,
    y: f64,
    button: i32,
    delta_x: f64,
    delta_y: f64,
    options: Option<&InteractionPointerOptions>,
) -> PointerEventData {
    return PointerEventData {
        alt_key: options.and_then(|o| o.alt_key).unwrap_or(false),
        button,
        buttons: options.and_then(|o| o.buttons).unwrap_or(if button >= 0 {
            1 << button
        } else {
            0
        }),
        ctrl_key: options.and_then(|o| o.ctrl_key).unwrap_or(false),
        current_target: None,
        delta_x,
        delta_y,
        local_x: x,
        local_y: y,
        meta_key: options.and_then(|o| o.meta_key).unwrap_or(false),
        pointer_id: options.and_then(|o| o.pointer_id).unwrap_or(0),
        pointer_type: options
            .and_then(|o| o.pointer_type)
            .unwrap_or(PointerType::Mouse),
        shift_key: options.and_then(|o| o.shift_key).unwrap_or(false),
        target: Some(target.clone()),
        world_x: x,
        world_y: y,
        x,
        y,
    };
}

fn node_ref_eq(a: &Option<NodeRef>, b: &Option<NodeRef>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        (None, None) => true,
        _ => false,
    };
}

// Records the out/roll-out/roll-over/over deliveries for a hover change and updates the cursor
// target, as one step of a dispatch plan.
fn plan_pointer_rollover_change(
    manager: &mut InteractionManager,
    old_target: Option<&NodeRef>,
    target: Option<&NodeRef>,
    plan: &mut InteractionDispatchPlan,
) {
    if let Some(old) = old_target {
        plan.deliveries.push(InteractionDelivery::Pointer {
            target: old.clone(),
            name: InteractionSignalName::OnPointerOut,
            data: make_pointer_data(old, 0.0, 0.0, 0, 0.0, 0.0, None),
            bubble: true,
        });
    }
    let old_chain = old_target
        .map(|t| get_interaction_chain(t, &manager.root))
        .unwrap_or(Vec::new());
    let new_chain = target
        .map(|t| get_interaction_chain(t, &manager.root))
        .unwrap_or(Vec::new());
    for node in &old_chain {
        if !chain_contains(&new_chain, node) {
            plan.deliveries.push(InteractionDelivery::Pointer {
                target: node.clone(),
                name: InteractionSignalName::OnPointerRollOut,
                data: make_pointer_data(node, 0.0, 0.0, 0, 0.0, 0.0, None),
                bubble: false,
            });
        }
    }
    for node in new_chain.iter().rev() {
        if !chain_contains(&old_chain, node) {
            plan.deliveries.push(InteractionDelivery::Pointer {
                target: node.clone(),
                name: InteractionSignalName::OnPointerRollOver,
                data: make_pointer_data(node, 0.0, 0.0, 0, 0.0, 0.0, None),
                bubble: false,
            });
        }
    }
    if let Some(t) = target {
        plan.deliveries.push(InteractionDelivery::Pointer {
            target: t.clone(),
            name: InteractionSignalName::OnPointerOver,
            data: make_pointer_data(t, 0.0, 0.0, 0, 0.0, 0.0, None),
            bubble: true,
        });
    }
    manager.cursor_target = target.cloned();
    plan.deliveries
        .extend(capture_interaction_cursor(manager, target));
}

pub fn release_interaction_pointer(manager: &mut InteractionManager, pointer_id: i32) {
    manager.pointer_captures.remove(&pointer_id);
    if let Some(state) = manager.pointer_states.get_mut(&pointer_id) {
        reset_interaction_click_state(state);
    }
}

// Removes the tracked registration `id` of `slot_key` and stops counting it; a registration that
// was already removed or replaced is left alone, so a once slot and a disconnect racing on the
// same registration uncount it exactly once. Returns the target entry when it empties, for the
// caller to drop after releasing the manager lock.
fn remove_tracked_interaction_signal_slot(
    manager: &mut InteractionManager,
    target_key: usize,
    name: InteractionSignalName,
    slot_key: usize,
    id: SlotId,
) -> Option<InteractionTrackedSignalSlots> {
    let entry = manager.tracked_signal_slots.get_mut(&target_key)?;
    let slots = entry.slots.get_mut(&name)?;
    if slots
        .get(&slot_key)
        .is_none_or(|tracked| tracked.value != id.value)
    {
        return None;
    }
    slots.remove(&slot_key);
    if slots.is_empty() {
        entry.slots.remove(&name);
    }
    let count = manager
        .signal_subscriber_counts
        .get(&name)
        .copied()
        .unwrap_or(0);
    if count <= 1 {
        manager.signal_subscriber_counts.remove(&name);
    } else {
        manager.signal_subscriber_counts.insert(name, count - 1);
    }
    if entry.slots.is_empty() {
        return manager.tracked_signal_slots.remove(&target_key);
    }
    return None;
}

// flight-lint: allow(f64) D1: click timestamps are JS millisecond-precision doubles
fn reset_interaction_click_state(state: &mut InteractionPointerState) {
    state.last_click_target = None;
    state.last_click_time = f64::NEG_INFINITY;
    state.last_pointer_click_button = -1;
    state.last_pointer_click_interaction_state = None;
    state.last_pointer_click_target = None;
    state.last_pointer_click_time = f64::NEG_INFINITY;
    state.last_pointer_click_x = 0.0;
    state.last_pointer_click_y = 0.0;
}

fn resolve_interaction_cursor(target: Option<&NodeRef>, root: &NodeRef) -> Option<String> {
    let mut current = target.cloned();
    while let Some(ref node) = current {
        let cursor = get_node_cursor(node);
        if cursor.is_some() {
            return cursor;
        }
        if Arc::ptr_eq(node, root) {
            break;
        }
        current = get_node_parent(node);
    }
    return None;
}

// The targeting snapshot for one pointer dispatch, or `None` when no listener needs it.
fn snapshot_interaction_targeting(
    manager: &Ref<InteractionManager>,
    pointer_id: i32,
    names: &[InteractionSignalName],
) -> Option<InteractionTargeting> {
    let manager = manager.read().unwrap();
    if !is_pointer_signal_needed(&manager, names) {
        return None;
    }
    return Some(capture_interaction_targeting(&manager, pointer_id));
}
