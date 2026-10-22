use crate::button_controller::{ButtonController, get_button_controller_signals};
use crate::gui_controller::*;
use crate::list_controller::{ListController, get_list_controller_signals, set_visible_runtime};
use flight_entity::{Ref, allocate_entity};
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type ComboBoxController = GuiController<ComboBoxControllerFields>;
pub struct ComboBoxControllerOptions {
    pub button: Ref<ButtonController>,
    pub display: Option<Node2DRef>,
    pub list: Ref<ListController>,
    pub open: Option<bool>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct ComboBoxControllerSignals {
    pub on_change: Ref<Signal<i32>>,
    pub on_open_change: Ref<Signal<bool>>,
}
pub struct ComboBoxControllerFields {
    pub button: Option<Ref<ButtonController>>,
    pub display: Option<Node2DRef>,
    pub list: Option<Ref<ListController>>,
    pub open: bool,
    pub signals: Ref<ComboBoxControllerSignals>,
}
pub fn create_combo_box_controller(options: &ComboBoxControllerOptions) -> ComboBoxController {
    let mut out: ComboBoxController = allocate_entity();
    initialize_combo_box_controller(&mut out, options);
    return out;
}
// flight-lint: allow(conform-extra) D12 construction derives composed button/list subscriptions and initial visibility from required source controller references
pub fn initialize_combo_box_controller(
    out: &mut ComboBoxController,
    options: &ComboBoxControllerOptions,
) {
    let open = options.open.unwrap_or(false);
    let runtime = create_gui_controller_runtime(
        ComboBoxControllerFields {
            button: Some(options.button.clone()),
            display: options.display.clone(),
            list: Some(options.list.clone()),
            open,
            signals: Arc::new(RwLock::new(ComboBoxControllerSignals {
                on_change: Arc::new(RwLock::new(create_signal())),
                on_open_change: Arc::new(RwLock::new(create_signal())),
            })),
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    let signals = get_button_controller_signals(&options.button.read().unwrap());
    let signal = signals.read().unwrap().on_click.clone();
    let r = runtime.clone();
    connect_gui_signal(
        &runtime,
        &signal,
        Arc::new(move |_| {
            let open = !r.read().unwrap().fields.open;
            set_open_runtime(&r, open);
        }),
    );
    let signals = get_list_controller_signals(&options.list.read().unwrap());
    let signal = signals.read().unwrap().on_select.clone();
    let r = runtime.clone();
    connect_gui_signal(
        &runtime,
        &signal,
        Arc::new(move |index| {
            let signals = r.read().unwrap().fields.signals.clone();
            let signal = signals.read().unwrap().on_change.clone();
            emit_gui_signal(&signal, index);
            set_open_runtime(&r, false);
        }),
    );
    let list_runtime = get_gui_controller_runtime(&options.list.read().unwrap());
    set_visible_runtime(&list_runtime, open);
}
pub fn dispose_combo_box_controller(controller: &ComboBoxController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.button = None;
        s.fields.display = None;
        s.fields.list = None;
    });
}
pub fn get_combo_box_controller_signals(
    controller: &ComboBoxController,
) -> Ref<ComboBoxControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}
pub fn is_combo_box_controller_open(controller: &ComboBoxController) -> bool {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .open;
}
pub fn set_combo_box_controller_open(controller: &ComboBoxController, open: bool) {
    set_open_runtime(&get_gui_controller_runtime(controller), open);
}
fn set_open_runtime(r: &Ref<GuiControllerRuntime<ComboBoxControllerFields>>, open: bool) {
    let list = {
        let mut s = r.write().unwrap();
        if s.fields.open == open || s.fields.list.is_none() || s.disposed {
            return;
        }
        s.fields.open = open;
        s.fields.list.clone().unwrap()
    };
    let list_runtime = get_gui_controller_runtime(&list.read().unwrap());
    set_visible_runtime(&list_runtime, open);
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_open_change.clone();
    emit_gui_signal(&signal, &open);
}
impl ComboBoxController {
    pub fn new(options: &ComboBoxControllerOptions) -> Self {
        return create_combo_box_controller(options);
    }
}
