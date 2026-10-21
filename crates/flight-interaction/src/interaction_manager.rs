use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::UnknownValue;

use flight_node::{get_node_parent, NodeRef};
use flight_signals::{connect_signal, create_signal, disconnect_signal, emit_signal};

use crate::hit_tests::{find_graph_hit_target, find_graph_hit_target_precise, HitTestContext};
use crate::node_interaction_state::get_node_cursor;
use crate::types::{
    AnyInteractionSignalSlot, InteractionDispatchLayer, InteractionDispatchLayerEntry,
    InteractionDispatchLayerOptions, InteractionManager, InteractionManagerOptions,
    InteractionPointerOptions, InteractionPointerState, InteractionSignalName,
    InteractionSignals, KeyboardEventData, PointerEventData, PointerType,
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

pub fn create_interaction_manager(
    root: NodeRef,
    options: &InteractionManagerOptions,
) -> InteractionManager {
    let mut out = InteractionManager {
        cursor_backend: None,
        cursor_target: None,
        dispatch_layers: None,
        double_click_delay: 500.0,
        double_click_distance: 4.0,
        enabled: true,
        hit_test_ctx: HitTestContext::new(),
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
    return out;
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

fn apply_interaction_cursor(manager: &InteractionManager, target: Option<&NodeRef>) {
    let backend = match &manager.cursor_backend {
        Some(b) => b,
        None => return,
    };
    let cursor = resolve_interaction_cursor(target, &manager.root);
    backend.set_cursor(cursor.as_deref());
}

pub fn capture_interaction_pointer(
    manager: &mut InteractionManager,
    pointer_id: i32,
    target: NodeRef,
) {
    manager.pointer_captures.insert(pointer_id, target);
}

fn chain_contains(chain: &[NodeRef], node: &NodeRef) -> bool {
    return chain.iter().any(|n| Arc::ptr_eq(n, node));
}

// flight-lint: allow(conform-params) D5: manager is Arc<RwLock> for shared capture by signal slots; returns dispose closure
// flight-lint: allow(contract-vocabulary) D5: RwLock is required for shared mutable access from signal slot callbacks
// flight-lint: allow(hashmap-iteration) D5: pointer state reset on dispose visits all entries; iteration order is irrelevant
pub fn connect_input_to_interaction(
    input: &crate::types::InteractionInputSource,
    manager: Arc<RwLock<InteractionManager>>,
    coord_scale: f32,
) -> Arc<dyn Fn() + Send + Sync> {
    let sx = move |v: f32| -> f32 { v * coord_scale };

    let mgr = manager.clone();
    let on_key_down: Arc<dyn Fn(&flight_input::InputKeyboardData) + Send + Sync> = Arc::new(move |data| {
        let mut m = mgr.write().unwrap();
        let modifiers = KeyboardEventData {
            alt_key: data.alt_key,
            ctrl_key: data.ctrl_key,
            key: data.key.clone(),
            key_code: data.key_code,
            meta_key: data.meta_key,
            shift_key: data.shift_key,
        };
        dispatch_interaction_key_down(&mut m, &data.key, data.key_code, Some(&modifiers));
    });

    let mgr = manager.clone();
    let on_key_up: Arc<dyn Fn(&flight_input::InputKeyboardData) + Send + Sync> = Arc::new(move |data| {
        let mut m = mgr.write().unwrap();
        let modifiers = KeyboardEventData {
            alt_key: data.alt_key,
            ctrl_key: data.ctrl_key,
            key: data.key.clone(),
            key_code: data.key_code,
            meta_key: data.meta_key,
            shift_key: data.shift_key,
        };
        dispatch_interaction_key_up(&mut m, &data.key, data.key_code, Some(&modifiers));
    });

    let mgr = manager.clone();
    let on_pointer_cancel: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> = Arc::new(move |data| {
        let mut m = mgr.write().unwrap();
        let opts = input_pointer_to_options(data);
        dispatch_interaction_pointer_cancel(&mut m, sx(data.x), sx(data.y), Some(&opts));
    });

    let mgr = manager.clone();
    let on_pointer_down: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> = Arc::new(move |data| {
        let mut m = mgr.write().unwrap();
        let opts = input_pointer_to_options(data);
        dispatch_interaction_pointer_down(&mut m, sx(data.x), sx(data.y), data.button, Some(&opts));
    });

    let mgr = manager.clone();
    let on_pointer_move: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> = Arc::new(move |data| {
        let mut m = mgr.write().unwrap();
        let opts = input_pointer_to_options(data);
        dispatch_interaction_pointer_move(&mut m, sx(data.x), sx(data.y), data.button, Some(&opts));
    });

    let mgr = manager.clone();
    let on_pointer_up: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> = Arc::new(move |data| {
        let mut m = mgr.write().unwrap();
        let opts = input_pointer_to_options(data);
        dispatch_interaction_pointer_up(&mut m, sx(data.x), sx(data.y), data.button, Some(data.time_stamp), Some(&opts));
    });

    let mgr = manager.clone();
    let on_wheel: Arc<dyn Fn(&flight_input::InputPointerData) + Send + Sync> = Arc::new(move |data| {
        let mut m = mgr.write().unwrap();
        let opts = input_pointer_to_options(data);
        dispatch_interaction_wheel(&mut m, sx(data.x), sx(data.y), data.delta_x, data.delta_y, Some(&opts));
    });

    let kd_id = connect_signal(&input.on_key_down, on_key_down, None);
    let ku_id = connect_signal(&input.on_key_up, on_key_up, None);
    let pc_id = connect_signal(&input.on_pointer_cancel, on_pointer_cancel, None);
    let pd_id = connect_signal(&input.on_pointer_down, on_pointer_down, None);
    let pm_id = connect_signal(&input.on_pointer_move, on_pointer_move, None);
    let pu_id = connect_signal(&input.on_pointer_up, on_pointer_up, None);
    let wh_id = connect_signal(&input.on_wheel, on_wheel, None);

    let kd_sig = input.on_key_down.clone();
    let ku_sig = input.on_key_up.clone();
    let pc_sig = input.on_pointer_cancel.clone();
    let pd_sig = input.on_pointer_down.clone();
    let pm_sig = input.on_pointer_move.clone();
    let pu_sig = input.on_pointer_up.clone();
    let wh_sig = input.on_wheel.clone();

    return Arc::new(move || {
        disconnect_signal(&kd_sig, kd_id);
        disconnect_signal(&ku_sig, ku_id);
        disconnect_signal(&pc_sig, pc_id);
        disconnect_signal(&pd_sig, pd_id);
        disconnect_signal(&pm_sig, pm_id);
        disconnect_signal(&pu_sig, pu_id);
        disconnect_signal(&wh_sig, wh_id);
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

// flight-lint: allow(conform-params) D5: caller-owned signal tracking via manager
pub fn connect_interaction_signal(
    manager: &mut InteractionManager,
    target: &NodeRef,
    name: InteractionSignalName,
    _slot: AnyInteractionSignalSlot,
) {
    let count = manager.signal_subscriber_counts.entry(name).or_insert(0);
    *count += 1;
    let _ = target;
}

// flight-lint: allow(conform-params) D5: caller-owned signal tracking via manager
pub fn disconnect_interaction_signal(
    manager: &mut InteractionManager,
    _target: &NodeRef,
    name: InteractionSignalName,
    _slot: &AnyInteractionSignalSlot,
) {
    if let Some(count) = manager.signal_subscriber_counts.get_mut(&name) {
        if *count > 0 {
            *count -= 1;
        }
    }
}

pub fn dispatch_interaction_context_menu(
    manager: &mut InteractionManager,
    x: f32,
    y: f32,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    dispatch_pointer_signal_at(
        manager,
        InteractionSignalName::OnContextMenu,
        x, y, button, 0.0, 0.0, options,
    );
}

pub fn dispatch_interaction_key_down(
    manager: &mut InteractionManager,
    key: &str,
    key_code: i32,
    modifiers: Option<&KeyboardEventData>,
) {
    dispatch_keyboard_signal(manager, InteractionSignalName::OnKeyDown, key, key_code, modifiers);
}

pub fn dispatch_interaction_key_up(
    manager: &mut InteractionManager,
    key: &str,
    key_code: i32,
    modifiers: Option<&KeyboardEventData>,
) {
    dispatch_keyboard_signal(manager, InteractionSignalName::OnKeyUp, key, key_code, modifiers);
}

fn dispatch_interaction_layers(
    manager: &InteractionManager,
    _target: &NodeRef,
    _name: InteractionSignalName,
    _data: &PointerEventData,
) -> bool {
    let layers = match &manager.dispatch_layers {
        Some(l) => l,
        None => return true,
    };
    for entry in layers {
        if !(entry.layer)(_target, _name, _data) {
            return false;
        }
    }
    return true;
}

pub fn dispatch_interaction_pointer_cancel(
    manager: &mut InteractionManager,
    x: f32,
    y: f32,
    options: Option<&InteractionPointerOptions>,
) {
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    if let Some(state) = manager.pointer_states.get_mut(&pointer_id) {
        reset_interaction_click_state(state);
    }
    if !is_pointer_signal_needed(manager, CANCEL_SIGNAL_NAMES) {
        return;
    }
    get_interaction_pointer_state(manager, pointer_id);
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

    if let Some(ref target_node) = target {
        let data = make_pointer_data(target_node, x, y, -1, 0.0, 0.0, options);
        let root = manager.root.clone();
        let pass = manager.dispatch_layers.is_none()
            || dispatch_interaction_layers(manager, target_node, InteractionSignalName::OnPointerCancel, &data);
        if pass {
            emit_interaction_signal(target_node, &root, InteractionSignalName::OnPointerCancel, &data);
        }
    }
    if let Some(ref old) = old_target {
        dispatch_pointer_rollover_change(manager, Some(old), None);
    }
}

pub fn dispatch_interaction_pointer_down(
    manager: &mut InteractionManager,
    x: f32,
    y: f32,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    if !is_pointer_signal_needed(manager, DOWN_SIGNAL_NAMES) {
        return;
    }
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    get_interaction_pointer_state(manager, pointer_id);
    let target = find_interaction_target(manager, x, y, pointer_id);
    if target.is_none() {
        return;
    }
    let target = target.unwrap();
    let state = manager.pointer_states.get_mut(&pointer_id).unwrap();
    state.pointer_down_target = Some(target.clone());
    let data = make_pointer_data(&target, x, y, button, 0.0, 0.0, options);
    let root = manager.root.clone();
    let pass = manager.dispatch_layers.is_none()
        || dispatch_interaction_layers(manager, &target, InteractionSignalName::OnPointerDown, &data);
    if pass {
        emit_interaction_signal(&target, &root, InteractionSignalName::OnPointerDown, &data);
    }
}

pub fn dispatch_interaction_pointer_move(
    manager: &mut InteractionManager,
    x: f32,
    y: f32,
    button: i32,
    options: Option<&InteractionPointerOptions>,
) {
    let cursor_needed = manager.enabled && manager.cursor_backend.is_some();
    if !is_pointer_signal_needed(manager, MOVE_SIGNAL_NAMES) && !cursor_needed {
        return;
    }
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    get_interaction_pointer_state(manager, pointer_id);
    let old_target = manager
        .pointer_states
        .get(&pointer_id)
        .and_then(|s| s.pointer_over_target.clone());
    let target = find_interaction_target(manager, x, y, pointer_id);
    if target.is_none() && old_target.is_none() {
        return;
    }

    let hover = !(manager.suppress_touch_hover
        && options.and_then(|o| o.pointer_type).unwrap_or(PointerType::Mouse) == PointerType::Touch);
    if hover {
        if let Some(state) = manager.pointer_states.get_mut(&pointer_id) {
            state.pointer_over_target = target.clone();
        }
    }

    let changed = !node_ref_eq(&target, &old_target);
    if hover && changed {
        dispatch_pointer_rollover_change(manager, old_target.as_ref(), target.as_ref());
    }

    if let Some(ref target_node) = target {
        let data = make_pointer_data(target_node, x, y, button, 0.0, 0.0, options);
        let root = manager.root.clone();
        let pass = manager.dispatch_layers.is_none()
            || dispatch_interaction_layers(manager, target_node, InteractionSignalName::OnPointerMove, &data);
        if pass {
            emit_interaction_signal(target_node, &root, InteractionSignalName::OnPointerMove, &data);
        }
    }
}

// flight-lint: allow(f64) D1: click timestamps and double-click delay are JS millisecond-precision doubles
pub fn dispatch_interaction_pointer_up(
    manager: &mut InteractionManager,
    x: f32,
    y: f32,
    button: i32,
    time: Option<f64>,
    options: Option<&InteractionPointerOptions>,
) {
    if !is_pointer_signal_needed(manager, UP_SIGNAL_NAMES) {
        return;
    }
    let click_time = time
        .or_else(|| options.and_then(|o| o.time_stamp))
        .unwrap_or(0.0);
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    get_interaction_pointer_state(manager, pointer_id);
    let down_target = manager
        .pointer_states
        .get(&pointer_id)
        .and_then(|s| s.pointer_down_target.clone());
    let target = find_interaction_target(manager, x, y, pointer_id);
    if let Some(state) = manager.pointer_states.get_mut(&pointer_id) {
        state.pointer_down_target = None;
    }
    let root = manager.root.clone();

    if let Some(ref target_node) = target {
        let data = make_pointer_data(target_node, x, y, button, 0.0, 0.0, options);
        let pass = manager.dispatch_layers.is_none()
            || dispatch_interaction_layers(manager, target_node, InteractionSignalName::OnPointerUp, &data);
        if pass {
            emit_interaction_signal(target_node, &root, InteractionSignalName::OnPointerUp, &data);
        }
    }

    if let Some(ref down) = down_target {
        let data = make_pointer_data(down, x, y, button, 0.0, 0.0, options);
        if node_ref_eq(&target, &Some(down.clone())) {
            let pass = manager.dispatch_layers.is_none()
                || dispatch_interaction_layers(manager, down, InteractionSignalName::OnClick, &data);
            if pass {
                emit_interaction_signal(down, &root, InteractionSignalName::OnClick, &data);
            }
            let state = manager.pointer_states.get_mut(&pointer_id).unwrap();
            let legacy_elapsed = click_time - state.last_click_time;
            if node_ref_eq(&state.last_click_target, &target)
                && legacy_elapsed >= 0.0
                && legacy_elapsed <= manager.double_click_delay
            {
                let pass2 = manager.dispatch_layers.is_none()
                    || dispatch_interaction_layers(manager, down, InteractionSignalName::OnDoubleClick, &data);
                if pass2 {
                    emit_interaction_signal(down, &root, InteractionSignalName::OnDoubleClick, &data);
                }
                let state = manager.pointer_states.get_mut(&pointer_id).unwrap();
                state.last_click_target = None;
                state.last_click_time = f64::NEG_INFINITY;
            } else {
                let state = manager.pointer_states.get_mut(&pointer_id).unwrap();
                state.last_click_target = target.clone();
                state.last_click_time = click_time;
            }
        } else {
            reset_interaction_click_state(manager.pointer_states.get_mut(&pointer_id).unwrap());
            let pass = manager.dispatch_layers.is_none()
                || dispatch_interaction_layers(manager, down, InteractionSignalName::OnReleaseOutside, &data);
            if pass {
                emit_interaction_signal(down, &root, InteractionSignalName::OnReleaseOutside, &data);
            }
        }
    }
}

pub fn dispatch_interaction_wheel(
    manager: &mut InteractionManager,
    x: f32,
    y: f32,
    delta_x: f32,
    delta_y: f32,
    options: Option<&InteractionPointerOptions>,
) {
    dispatch_pointer_signal_at(
        manager,
        InteractionSignalName::OnWheel,
        x, y, 0, delta_x, delta_y, options,
    );
}

fn dispatch_keyboard_signal(
    manager: &mut InteractionManager,
    name: InteractionSignalName,
    key: &str,
    key_code: i32,
    modifiers: Option<&KeyboardEventData>,
) {
    if !manager.enabled {
        return;
    }
    let data = KeyboardEventData {
        alt_key: modifiers.map_or(false, |m| m.alt_key),
        ctrl_key: modifiers.map_or(false, |m| m.ctrl_key),
        key: key.to_string(),
        key_code,
        meta_key: modifiers.map_or(false, |m| m.meta_key),
        shift_key: modifiers.map_or(false, |m| m.shift_key),
    };
    let root = manager.root.clone();
    emit_keyboard_signal(&root, &root, name, &data);
}

fn dispatch_pointer_rollover_change(
    manager: &mut InteractionManager,
    old_target: Option<&NodeRef>,
    target: Option<&NodeRef>,
) {
    if let Some(old) = old_target {
        let data = make_pointer_data(old, 0.0, 0.0, 0, 0.0, 0.0, None);
        let root = manager.root.clone();
        let pass = manager.dispatch_layers.is_none()
            || dispatch_interaction_layers(manager, old, InteractionSignalName::OnPointerOut, &data);
        if pass {
            emit_interaction_signal(old, &root, InteractionSignalName::OnPointerOut, &data);
        }
    }

    let old_chain = old_target
        .map(|t| get_interaction_chain(t, &manager.root))
        .unwrap_or_default();
    let new_chain = target
        .map(|t| get_interaction_chain(t, &manager.root))
        .unwrap_or_default();

    for node in &old_chain {
        if !chain_contains(&new_chain, node) {
            let data = make_pointer_data(node, 0.0, 0.0, 0, 0.0, 0.0, None);
            let pass = manager.dispatch_layers.is_none()
                || dispatch_interaction_layers(manager, node, InteractionSignalName::OnPointerRollOut, &data);
            if pass {
                emit_interaction_signal_direct(node, InteractionSignalName::OnPointerRollOut, &data);
            }
        }
    }
    for node in new_chain.iter().rev() {
        if !chain_contains(&old_chain, node) {
            let data = make_pointer_data(node, 0.0, 0.0, 0, 0.0, 0.0, None);
            let pass = manager.dispatch_layers.is_none()
                || dispatch_interaction_layers(manager, node, InteractionSignalName::OnPointerRollOver, &data);
            if pass {
                emit_interaction_signal_direct(node, InteractionSignalName::OnPointerRollOver, &data);
            }
        }
    }

    if let Some(t) = target {
        let data = make_pointer_data(t, 0.0, 0.0, 0, 0.0, 0.0, None);
        let root = manager.root.clone();
        let pass = manager.dispatch_layers.is_none()
            || dispatch_interaction_layers(manager, t, InteractionSignalName::OnPointerOver, &data);
        if pass {
            emit_interaction_signal(t, &root, InteractionSignalName::OnPointerOver, &data);
        }
    }

    manager.cursor_target = target.cloned();
    apply_interaction_cursor(manager, target);
}

fn dispatch_pointer_signal_at(
    manager: &mut InteractionManager,
    name: InteractionSignalName,
    x: f32,
    y: f32,
    button: i32,
    delta_x: f32,
    delta_y: f32,
    options: Option<&InteractionPointerOptions>,
) {
    if !is_pointer_signal_needed(manager, &[name]) {
        return;
    }
    let pointer_id = options.and_then(|o| o.pointer_id).unwrap_or(0);
    let target = find_interaction_target(manager, x, y, pointer_id);
    if let Some(ref target_node) = target {
        let data = make_pointer_data(target_node, x, y, button, delta_x, delta_y, options);
        let root = manager.root.clone();
        let pass = manager.dispatch_layers.is_none()
            || dispatch_interaction_layers(manager, target_node, name, &data);
        if pass {
            emit_interaction_signal(target_node, &root, name, &data);
        }
    }
}

fn emit_interaction_signal(
    target: &NodeRef,
    root: &NodeRef,
    name: InteractionSignalName,
    data: &PointerEventData,
) {
    let mut current: Option<NodeRef> = Some(target.clone());
    while let Some(ref node) = current {
        let signals = get_interaction_signals(node);
        if let Some(ref sigs) = signals {
            let sigs = sigs.read().unwrap();
            let signal = get_signal_by_name_pointer(&sigs, name);
            emit_signal(signal, data);
        }
        if Arc::ptr_eq(node, root) {
            break;
        }
        current = get_node_parent(node);
    }
}

fn emit_interaction_signal_direct(
    target: &NodeRef,
    name: InteractionSignalName,
    data: &PointerEventData,
) {
    let signals = get_interaction_signals(target);
    if let Some(ref sigs) = signals {
        let sigs = sigs.read().unwrap();
        let signal = get_signal_by_name_pointer(&sigs, name);
        emit_signal(signal, data);
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
        let signals = get_interaction_signals(node);
        if let Some(ref sigs) = signals {
            let sigs = sigs.read().unwrap();
            let signal = get_signal_by_name_keyboard(&sigs, name);
            emit_signal(signal, data);
        }
        if Arc::ptr_eq(node, root) {
            break;
        }
        current = get_node_parent(node);
    }
}

// flight-lint: allow(contract-vocabulary) D5: InteractionSignals stored in Unknown slot require Arc<RwLock> for shared mutable access
pub fn enable_interaction_signals(source: &NodeRef) -> Arc<RwLock<InteractionSignals>> {
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

fn find_interaction_target(
    manager: &InteractionManager,
    x: f32,
    y: f32,
    pointer_id: i32,
) -> Option<NodeRef> {
    if !manager.enabled {
        return None;
    }
    let captured = manager.pointer_captures.get(&pointer_id);
    if let Some(cap) = captured {
        return Some(cap.clone());
    }
    let root = &manager.root;
    return if manager.precise {
        find_graph_hit_target_precise(&manager.hit_test_ctx, root, x, y)
    } else {
        find_graph_hit_target(&manager.hit_test_ctx, root, x, y)
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
    return manager.pointer_states.entry(pointer_id).or_insert_with(InteractionPointerState::new);
}

// flight-lint: allow(contract-vocabulary) D5: InteractionSignals stored in Unknown slot require Arc<RwLock> for shared mutable access
pub fn get_interaction_signals(source: &NodeRef) -> Option<Arc<RwLock<InteractionSignals>>> {
    let node = source.read().unwrap();
    let runtime = node.node_runtime();
    return runtime
        .interaction_signals
        .as_ref()
        .and_then(|u| u.downcast_ref::<Arc<RwLock<InteractionSignals>>>())
        .cloned();
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

fn input_pointer_to_options(data: &flight_input::InputPointerData) -> InteractionPointerOptions {
    return InteractionPointerOptions {
        alt_key: Some(data.alt_key),
        buttons: Some(data.buttons as i32),
        ctrl_key: Some(data.ctrl_key),
        meta_key: Some(data.meta_key),
        pointer_id: Some(data.pointer_id),
        pointer_type: Some(match data.pointer_type {
            flight_input::PointerType::Mouse => PointerType::Mouse,
            flight_input::PointerType::Touch => PointerType::Touch,
            flight_input::PointerType::Pen => PointerType::Pen,
            flight_input::PointerType::Unknown => PointerType::Unknown,
        }),
        shift_key: Some(data.shift_key),
        time_stamp: Some(data.time_stamp),
    };
}

pub fn invalidate_interaction_cursor(manager: &mut InteractionManager) {
    let target = manager.cursor_target.clone();
    apply_interaction_cursor(manager, target.as_ref());
}

fn is_pointer_signal_needed(
    manager: &InteractionManager,
    names: &[InteractionSignalName],
) -> bool {
    if !manager.enabled {
        return false;
    }
    if manager.dispatch_layers.is_some() {
        return true;
    }
    for name in names {
        if manager.signal_subscriber_counts.get(name).copied().unwrap_or(0) > 0 {
            return true;
        }
    }
    return false;
}

fn make_pointer_data(
    target: &NodeRef,
    x: f32,
    y: f32,
    button: i32,
    delta_x: f32,
    delta_y: f32,
    options: Option<&InteractionPointerOptions>,
) -> PointerEventData {
    return PointerEventData {
        alt_key: options.and_then(|o| o.alt_key).unwrap_or(false),
        button,
        buttons: options
            .and_then(|o| o.buttons)
            .unwrap_or(if button >= 0 { 1 << button } else { 0 }),
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

pub fn release_interaction_pointer(manager: &mut InteractionManager, pointer_id: i32) {
    manager.pointer_captures.remove(&pointer_id);
    if let Some(state) = manager.pointer_states.get_mut(&pointer_id) {
        reset_interaction_click_state(state);
    }
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
