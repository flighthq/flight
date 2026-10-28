use flight_entity::{Entity, EntityRuntimeSlot, Ref, allocate_entity, throw_type_error};
use flight_interaction::contract::{
    FocusEventData, HitArea, InteractionSignalName, KeyboardEventData, PointerEventData,
    enable_interaction_signals, enable_node_interaction_state, is_node_hit_test_enabled,
    set_node_hit_area, set_node_hit_test_enabled,
};
use flight_node::{
    NodeRef, get_node_height, get_node_width, invalidate_node_appearance,
    invalidate_node_local_transform,
};
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, SignalSlot, connect_signal, disconnect_signal};
use std::sync::{Arc, RwLock};

pub type GuiTransitionProperty = flight_interaction::contract::NodeInteractiveStateProperty;
pub type GuiTransitionDescriptor = flight_interaction::contract::NodeInteractiveStateTransition;
pub type GuiTransitionRequest = flight_interaction::contract::NodeInteractiveStateTransitionRequest;
pub type GuiTransitionValue = flight_interaction::contract::NodeInteractiveStateTransitionValue;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GuiOrientation {
    Horizontal,
    Vertical,
}

#[derive(Default)]
pub struct GuiControllerOptions {
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}

pub struct GuiController<F = ()> {
    runtime: EntityRuntimeSlot,
    state: Option<Ref<GuiControllerRuntime<F>>>,
}

pub struct GuiControllerRuntime<F = ()> {
    pub cleanups: Vec<Arc<dyn Fn() + Send + Sync>>,
    pub disposed: bool,
    pub fields: F,
    pub hit_states: Vec<GuiHitState>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}

pub struct GuiHitState {
    pub target: Node2DRef,
    pub enabled: bool,
}
pub struct GuiPointerSlot {
    pub callback: SignalSlot<PointerEventData>,
}
pub struct GuiKeyboardSlot {
    pub callback: SignalSlot<KeyboardEventData>,
}
pub struct GuiFocusSlot {
    pub callback: SignalSlot<FocusEventData>,
}
pub enum GuiInteractionSlot {
    Pointer(GuiPointerSlot),
    Keyboard(GuiKeyboardSlot),
    Focus(GuiFocusSlot),
}

pub fn create_gui_controller<F>(runtime: Ref<GuiControllerRuntime<F>>) -> GuiController<F> {
    let mut out: GuiController<F> = allocate_entity();
    initialize_gui_controller(&mut out, runtime);
    return out;
}

pub fn create_gui_controller_runtime<F>(
    fields: F,
    transition: Option<Arc<GuiTransitionDescriptor>>,
) -> Ref<GuiControllerRuntime<F>> {
    return Arc::new(RwLock::new(GuiControllerRuntime {
        cleanups: Vec::new(),
        disposed: false,
        fields,
        hit_states: Vec::new(),
        transition,
    }));
}

// flight-lint: allow(conform-extra) D12 construction-only initializer for the source generic controller Entity, preserving its runtime slot and adopting the actual supplied state
pub fn initialize_gui_controller<F>(
    out: &mut GuiController<F>,
    runtime: Ref<GuiControllerRuntime<F>>,
) {
    out.state = Some(runtime);
}

pub fn clamp_gui_value(value: f32, minimum: f32, maximum: f32) -> f32 {
    if !value.is_finite() {
        return minimum;
    }
    let (minimum, maximum) = if minimum > maximum {
        (maximum, minimum)
    } else {
        (minimum, maximum)
    };
    if minimum.is_nan() || maximum.is_nan() {
        return f32::NAN;
    }
    return value.min(maximum).max(minimum);
}

pub fn configure_gui_hit_area<F>(
    runtime: &Ref<GuiControllerRuntime<F>>,
    target: &Node2DRef,
    hit_area: &Node2DRef,
) {
    let node: NodeRef = target.clone();
    let state = enable_node_interaction_state(&node);
    let previous = Arc::new(RwLock::new(state.write().unwrap().hit_area.take()));
    set_node_hit_area(&node, Some(HitArea::Node(hit_area.clone())));
    runtime.write().unwrap().cleanups.push(Arc::new(move || {
        set_node_hit_area(&node, previous.write().unwrap().take());
    }));
}

// flight-lint: allow(conform-params) D9d: a closed typed pointer/keyboard/focus slot projects the source variadic signal callback; source name order is retained
pub fn connect_gui_interaction<F>(
    runtime: &Ref<GuiControllerRuntime<F>>,
    target: &Node2DRef,
    name: InteractionSignalName,
    slot: GuiInteractionSlot,
) {
    let node: NodeRef = target.clone();
    let first = !runtime
        .read()
        .unwrap()
        .hit_states
        .iter()
        .any(|state| Arc::ptr_eq(&state.target, target));
    if first {
        let enabled = is_node_hit_test_enabled(&node);
        runtime.write().unwrap().hit_states.push(GuiHitState {
            target: target.clone(),
            enabled,
        });
        set_node_hit_test_enabled(&node, true);
    }
    let signals = enable_interaction_signals(&node);
    let cleanup: Arc<dyn Fn() + Send + Sync> = match slot {
        GuiInteractionSlot::Pointer(slot) => {
            let id = {
                let group = signals.read().unwrap();
                connect_signal(pointer_signal(&group, name), slot.callback, None)
            };
            Arc::new(move || {
                let group = signals.read().unwrap();
                disconnect_signal(pointer_signal(&group, name), id);
            })
        }
        GuiInteractionSlot::Keyboard(slot) => {
            let id = {
                let group = signals.read().unwrap();
                connect_signal(keyboard_signal(&group, name), slot.callback, None)
            };
            Arc::new(move || {
                let group = signals.read().unwrap();
                disconnect_signal(keyboard_signal(&group, name), id);
            })
        }
        GuiInteractionSlot::Focus(slot) => {
            let id = {
                let group = signals.read().unwrap();
                connect_signal(focus_signal(&group, name), slot.callback, None)
            };
            Arc::new(move || {
                let group = signals.read().unwrap();
                disconnect_signal(focus_signal(&group, name), id);
            })
        }
    };
    runtime.write().unwrap().cleanups.push(cleanup);
}

pub fn connect_gui_signal<F, T: 'static>(
    runtime: &Ref<GuiControllerRuntime<F>>,
    signal: &Ref<Signal<T>>,
    slot: SignalSlot<T>,
) {
    let id = connect_signal(&signal.read().unwrap(), slot, None);
    let signal = signal.clone();
    runtime.write().unwrap().cleanups.push(Arc::new(move || {
        disconnect_signal(&signal.read().unwrap(), id)
    }));
}

pub fn dispose_gui_controller<F>(controller: &GuiController<F>, clear: &dyn Fn()) {
    dispose_runtime(&get_gui_controller_runtime(controller), clear);
}

pub(crate) fn dispose_runtime<F>(runtime: &Ref<GuiControllerRuntime<F>>, clear: &dyn Fn()) {
    let cleanup_count = {
        let mut state = runtime.write().unwrap();
        if state.disposed {
            return;
        }
        state.disposed = true;
        state.cleanups.len()
    };
    for index in (0..cleanup_count).rev() {
        let cleanup = runtime.read().unwrap().cleanups[index].clone();
        cleanup();
    }
    runtime.write().unwrap().cleanups.clear();
    let hit_states = std::mem::take(&mut runtime.write().unwrap().hit_states);
    for state in hit_states {
        let node: NodeRef = state.target;
        set_node_hit_test_enabled(&node, state.enabled);
    }
    clear();
}

pub(crate) fn emit_gui_signal<T>(signal: &Ref<Signal<T>>, value: &T) {
    let emit = {
        let signal = signal.read().unwrap();
        let emit = signal.emit.read().unwrap().clone();
        emit
    };
    emit(value);
}

pub(crate) fn focus_signal(
    signals: &flight_interaction::contract::InteractionSignals,
    name: InteractionSignalName,
) -> &Signal<FocusEventData> {
    return match name {
        InteractionSignalName::OnFocusIn => &signals.on_focus_in,
        InteractionSignalName::OnFocusOut => &signals.on_focus_out,
        _ => throw_type_error("GUI interaction slot requires a matching focus signal"),
    };
}

pub fn get_gui_controller_runtime<F>(
    controller: &GuiController<F>,
) -> Ref<GuiControllerRuntime<F>> {
    return controller
        .state
        .as_ref()
        .expect("GuiController must be initialized before use")
        .clone();
}

pub fn get_gui_length(target: &Node2DRef, orientation: GuiOrientation) -> f32 {
    let node: NodeRef = target.clone();
    return if orientation == GuiOrientation::Horizontal {
        get_node_width(&node)
    } else {
        get_node_height(&node)
    };
}

// flight-lint: allow(conform-extra) D9e string table for the source GuiOrientation string union
pub fn get_gui_orientation_string(value: GuiOrientation) -> &'static str {
    return match value {
        GuiOrientation::Horizontal => "horizontal",
        GuiOrientation::Vertical => "vertical",
    };
}

pub fn get_gui_position(target: &Node2DRef, orientation: GuiOrientation) -> f32 {
    let target = target.read().unwrap();
    let fields = target.node2d_fields();
    return if orientation == GuiOrientation::Horizontal {
        fields.x
    } else {
        fields.y
    };
}

fn gui_entity_runtime<F>(source: &GuiController<F>) -> &EntityRuntimeSlot {
    return &source.runtime;
}

fn gui_entity_runtime_mut<F>(source: &mut GuiController<F>) -> &mut EntityRuntimeSlot {
    return &mut source.runtime;
}

pub(crate) fn keyboard_signal(
    signals: &flight_interaction::contract::InteractionSignals,
    name: InteractionSignalName,
) -> &Signal<KeyboardEventData> {
    return match name {
        InteractionSignalName::OnKeyDown => &signals.on_key_down,
        InteractionSignalName::OnKeyUp => &signals.on_key_up,
        _ => throw_type_error("GUI interaction slot requires a matching keyboard signal"),
    };
}

// flight-lint: allow(f64) the canonical existing interactive-state transition protocol stores Number(f64); this losslessly promotes a canonical f32 property, without widening GUI arithmetic
pub(crate) fn number_value(value: f32) -> GuiTransitionValue {
    return GuiTransitionValue::Number(f64::from(value));
}

// flight-lint: allow(conform-extra) D9e parser for the source GuiOrientation string union
pub fn parse_gui_orientation(value: &str) -> Option<GuiOrientation> {
    return match value {
        "horizontal" => Some(GuiOrientation::Horizontal),
        "vertical" => Some(GuiOrientation::Vertical),
        _ => None,
    };
}

pub(crate) fn pointer_signal(
    signals: &flight_interaction::contract::InteractionSignals,
    name: InteractionSignalName,
) -> &Signal<PointerEventData> {
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
        _ => throw_type_error("GUI interaction slot requires a matching pointer signal"),
    };
}

// flight-lint: allow(f64) read the canonical f32 visual into the existing shared transition Number(f64) carrier, preserving the source descriptor protocol
fn read_visual(target: &Node2DRef, property: GuiTransitionProperty) -> GuiTransitionValue {
    let target = target.read().unwrap();
    let fields = target.node2d_fields();
    return match property {
        GuiTransitionProperty::Visible => GuiTransitionValue::Boolean(fields.visible),
        GuiTransitionProperty::Alpha => number_value(fields.alpha),
        GuiTransitionProperty::ScaleX => number_value(fields.scale_x),
        GuiTransitionProperty::ScaleY => number_value(fields.scale_y),
        GuiTransitionProperty::X => number_value(fields.x),
        GuiTransitionProperty::Y => number_value(fields.y),
    };
}

pub fn set_gui_position<F>(
    runtime: &Ref<GuiControllerRuntime<F>>,
    target: Option<&Node2DRef>,
    orientation: GuiOrientation,
    value: f32,
) {
    set_gui_visual_property(
        runtime,
        target,
        if orientation == GuiOrientation::Horizontal {
            GuiTransitionProperty::X
        } else {
            GuiTransitionProperty::Y
        },
        number_value(value),
    );
}

pub fn set_gui_scale<F>(
    runtime: &Ref<GuiControllerRuntime<F>>,
    target: Option<&Node2DRef>,
    orientation: GuiOrientation,
    value: f32,
) {
    set_gui_visual_property(
        runtime,
        target,
        if orientation == GuiOrientation::Horizontal {
            GuiTransitionProperty::ScaleX
        } else {
            GuiTransitionProperty::ScaleY
        },
        number_value(value),
    );
}

pub fn set_gui_visible<F>(
    runtime: &Ref<GuiControllerRuntime<F>>,
    target: Option<&Node2DRef>,
    visible: bool,
) {
    set_gui_visual_property(
        runtime,
        target,
        GuiTransitionProperty::Visible,
        GuiTransitionValue::Boolean(visible),
    );
}

pub fn set_gui_visual_property<F>(
    runtime: &Ref<GuiControllerRuntime<F>>,
    target: Option<&Node2DRef>,
    property: GuiTransitionProperty,
    value: GuiTransitionValue,
) {
    let transition = {
        let state = runtime.read().unwrap();
        if state.disposed {
            return;
        }
        state.transition.clone()
    };
    let Some(target) = target else {
        return;
    };
    let from = read_visual(target, property);
    if from == value {
        return;
    }
    let target = target.clone();
    let node: NodeRef = target.clone();
    let apply = Arc::new(move |next: Option<GuiTransitionValue>| {
        let next = next.unwrap_or(value);
        if std::mem::discriminant(&from) != std::mem::discriminant(&next) {
            return;
        }
        write_visual(&target, property, next);
        let node: NodeRef = target.clone();
        if matches!(
            property,
            GuiTransitionProperty::Alpha | GuiTransitionProperty::Visible
        ) {
            invalidate_node_appearance(&node);
        } else {
            invalidate_node_local_transform(&node);
        }
    });
    if let Some(transition) = transition {
        (transition.run)(&GuiTransitionRequest {
            apply,
            from,
            property: flight_scene_document::contract::get_node_interactive_state_property_string(
                property,
            )
            .to_string(),
            target: node,
            value,
        });
    } else {
        apply(None);
    }
}

// flight-lint: allow(f64) D1 exact integer rounding: preserve the source Number grid index and operation order until the final canonical f32 result
fn snap_gui_grid(value: f32, minimum: f32, step: f32) -> f32 {
    let value = f64::from(value);
    let minimum = f64::from(minimum);
    let step = f64::from(step);
    let ratio = (value - minimum) / step;
    let floor = ratio.floor();
    let rounded = if ratio - floor < 0.5 {
        floor
    } else {
        floor + 1.0
    };
    let rounded = if rounded == 0.0 && ratio.is_sign_negative() {
        -0.0
    } else {
        rounded
    };
    return (minimum + rounded * step) as f32;
}

pub fn snap_gui_value(value: f32, minimum: f32, step: Option<f32>) -> f32 {
    let Some(step) = step else {
        return value;
    };
    if !(step > 0.0) || !step.is_finite() {
        return value;
    }
    return snap_gui_grid(value, minimum, step);
}

fn write_visual(target: &Node2DRef, property: GuiTransitionProperty, value: GuiTransitionValue) {
    let mut target = target.write().unwrap();
    let fields = target.node2d_fields_mut();
    match (property, value) {
        (GuiTransitionProperty::Visible, GuiTransitionValue::Boolean(value)) => {
            fields.visible = value
        }
        (GuiTransitionProperty::Alpha, GuiTransitionValue::Number(value)) => {
            fields.alpha = value as f32
        }
        (GuiTransitionProperty::ScaleX, GuiTransitionValue::Number(value)) => {
            fields.scale_x = value as f32
        }
        (GuiTransitionProperty::ScaleY, GuiTransitionValue::Number(value)) => {
            fields.scale_y = value as f32
        }
        (GuiTransitionProperty::X, GuiTransitionValue::Number(value)) => fields.x = value as f32,
        (GuiTransitionProperty::Y, GuiTransitionValue::Number(value)) => fields.y = value as f32,
        _ => {}
    }
}

impl<F> Default for GuiController<F> {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            state: None,
        };
    }
}
impl<F> Entity for GuiController<F> {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return gui_entity_runtime(self);
    }
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return gui_entity_runtime_mut(self);
    }
}
