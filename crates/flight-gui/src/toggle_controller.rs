use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type ToggleController = GuiController<ToggleControllerFields>;
pub struct ToggleControllerOptions {
    pub checked: Option<bool>,
    pub checked_state: Node2DRef,
    pub label: Option<Node2DRef>,
    pub over_state: Option<Node2DRef>,
    pub unchecked_state: Node2DRef,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct ToggleControllerSignals {
    pub on_change: Ref<Signal<bool>>,
}
pub struct ToggleControllerFields {
    pub checked: bool,
    pub checked_state: Option<Node2DRef>,
    pub label: Option<Node2DRef>,
    pub over: bool,
    pub over_state: Option<Node2DRef>,
    pub signals: Ref<ToggleControllerSignals>,
    pub unchecked_state: Option<Node2DRef>,
}
pub fn create_toggle_controller(options: &ToggleControllerOptions) -> ToggleController {
    let mut out: ToggleController = allocate_entity();
    initialize_toggle_controller(&mut out, options);
    return out;
}

// flight-lint: allow(conform-extra) D12 public construction seam derives the source pointer subscriptions and initial visuals from required defining node references
pub fn initialize_toggle_controller(out: &mut ToggleController, options: &ToggleControllerOptions) {
    let runtime = create_gui_controller_runtime(
        ToggleControllerFields {
            checked: options.checked.unwrap_or(false),
            checked_state: Some(options.checked_state.clone()),
            label: options.label.clone(),
            over: false,
            over_state: options.over_state.clone(),
            signals: Arc::new(RwLock::new(ToggleControllerSignals {
                on_change: Arc::new(RwLock::new(create_signal())),
            })),
            unchecked_state: Some(options.unchecked_state.clone()),
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    let mut targets: Vec<Node2DRef> = Vec::new();
    for target in [
        Some(options.unchecked_state.clone()),
        Some(options.checked_state.clone()),
        options.label.clone(),
    ]
    .into_iter()
    .flatten()
    {
        if !targets.iter().any(|old| Arc::ptr_eq(old, &target)) {
            targets.push(target);
        }
    }
    for target in targets {
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            &target,
            InteractionSignalName::OnClick,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| {
                    let checked = !r.read().unwrap().fields.checked;
                    set_checked_runtime(&r, checked);
                }),
            }),
        );
        for (name, over) in [
            (InteractionSignalName::OnPointerOver, true),
            (InteractionSignalName::OnPointerOut, false),
        ] {
            let r = runtime.clone();
            connect_gui_interaction(
                &runtime,
                &target,
                name,
                GuiInteractionSlot::Pointer(GuiPointerSlot {
                    callback: Arc::new(move |_| {
                        r.write().unwrap().fields.over = over;
                        update_toggle_visuals(&r);
                    }),
                }),
            );
        }
    }
    update_toggle_visuals(&runtime);
}

pub fn dispose_toggle_controller(controller: &ToggleController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut r = r.write().unwrap();
        r.fields.checked_state = None;
        r.fields.label = None;
        r.fields.over_state = None;
        r.fields.unchecked_state = None;
    });
}

pub fn get_toggle_controller_signals(
    controller: &ToggleController,
) -> Ref<ToggleControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

pub fn is_toggle_controller_checked(controller: &ToggleController) -> bool {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .checked;
}

pub(crate) fn set_checked_runtime(
    r: &Ref<GuiControllerRuntime<ToggleControllerFields>>,
    checked: bool,
) {
    {
        let mut state = r.write().unwrap();
        if state.fields.checked == checked || state.disposed {
            return;
        }
        state.fields.checked = checked;
    }
    update_toggle_visuals(r);
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_change.clone();
    emit_gui_signal(&signal, &checked);
}

pub fn set_toggle_controller_checked(controller: &ToggleController, checked: bool) {
    set_checked_runtime(&get_gui_controller_runtime(controller), checked);
}

fn update_toggle_visuals(r: &Ref<GuiControllerRuntime<ToggleControllerFields>>) {
    let (node, checked) = {
        let r = r.read().unwrap();
        (r.fields.unchecked_state.clone(), r.fields.checked)
    };
    set_gui_visible(r, node.as_ref(), !checked);
    let (node, checked) = {
        let r = r.read().unwrap();
        (r.fields.checked_state.clone(), r.fields.checked)
    };
    set_gui_visible(r, node.as_ref(), checked);
    let (node, over) = {
        let r = r.read().unwrap();
        (r.fields.over_state.clone(), r.fields.over)
    };
    set_gui_visible(r, node.as_ref(), over);
}
impl ToggleController {
    pub fn new(options: &ToggleControllerOptions) -> Self {
        return create_toggle_controller(options);
    }
}
