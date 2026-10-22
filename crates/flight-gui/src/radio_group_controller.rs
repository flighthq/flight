use crate::gui_controller::*;
use crate::toggle_controller::{
    ToggleController, get_toggle_controller_signals, set_checked_runtime,
};
use flight_entity::{Ref, allocate_entity};
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type RadioGroupController = GuiController<RadioGroupControllerFields>;
pub struct RadioGroupControllerOptions {
    pub selected_index: Option<i32>,
    pub toggles: Vec<Ref<ToggleController>>,
}
pub struct RadioGroupControllerSignals {
    pub on_change: Ref<Signal<i32>>,
}
pub struct RadioGroupControllerFields {
    pub selected_index: i32,
    pub signals: Ref<RadioGroupControllerSignals>,
    pub toggles: Vec<Ref<ToggleController>>,
    pub updating: bool,
}
pub fn create_radio_group_controller(
    options: &RadioGroupControllerOptions,
) -> RadioGroupController {
    let mut out: RadioGroupController = allocate_entity();
    initialize_radio_group_controller(&mut out, options);
    return out;
}
// flight-lint: allow(conform-extra) D12 construction-only seam copies the source member list, derives subscriptions and initial selection while preserving the allocated Entity
pub fn initialize_radio_group_controller(
    out: &mut RadioGroupController,
    options: &RadioGroupControllerOptions,
) {
    let runtime = create_gui_controller_runtime(
        RadioGroupControllerFields {
            selected_index: -1,
            signals: Arc::new(RwLock::new(RadioGroupControllerSignals {
                on_change: Arc::new(RwLock::new(create_signal())),
            })),
            toggles: options.toggles.clone(),
            updating: false,
        },
        None,
    );
    initialize_gui_controller(out, runtime.clone());
    for (index, toggle) in options.toggles.iter().enumerate() {
        let signals = get_toggle_controller_signals(&toggle.read().unwrap());
        let signal = signals.read().unwrap().on_change.clone();
        let r = runtime.clone();
        connect_gui_signal(
            &runtime,
            &signal,
            Arc::new(move |checked| {
                let (updating, selected) = {
                    let r = r.read().unwrap();
                    (r.fields.updating, r.fields.selected_index)
                };
                if updating {
                    return;
                }
                if *checked {
                    set_radio_index(&r, index as i32);
                } else if selected == index as i32 {
                    set_radio_index(&r, -1);
                }
            }),
        );
    }
    set_radio_index(
        &runtime,
        options
            .selected_index
            .unwrap_or(if options.toggles.is_empty() { -1 } else { 0 }),
    );
}
pub fn dispose_radio_group_controller(controller: &RadioGroupController) {
    let runtime = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        runtime.write().unwrap().fields.toggles.clear()
    });
}
pub fn get_radio_group_controller_selected_index(controller: &RadioGroupController) -> i32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .selected_index;
}
pub fn get_radio_group_controller_signals(
    controller: &RadioGroupController,
) -> Ref<RadioGroupControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}
pub fn set_radio_group_controller_selected_index(controller: &RadioGroupController, index: i32) {
    set_radio_index(&get_gui_controller_runtime(controller), index);
}
fn set_radio_index(runtime: &Ref<GuiControllerRuntime<RadioGroupControllerFields>>, index: i32) {
    let (next, toggles) = {
        let mut r = runtime.write().unwrap();
        let next = if index >= 0 && (index as usize) < r.fields.toggles.len() {
            index
        } else {
            -1
        };
        if r.fields.selected_index == next {
            return;
        }
        r.fields.selected_index = next;
        r.fields.updating = true;
        (next, r.fields.toggles.clone())
    };
    for (i, toggle) in toggles.iter().enumerate() {
        let state = get_gui_controller_runtime(&toggle.read().unwrap());
        set_checked_runtime(&state, next >= 0 && i == next as usize);
    }
    runtime.write().unwrap().fields.updating = false;
    let signals = runtime.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_change.clone();
    emit_gui_signal(&signal, &next);
}
impl RadioGroupController {
    pub fn new(options: &RadioGroupControllerOptions) -> Self {
        return create_radio_group_controller(options);
    }
}
