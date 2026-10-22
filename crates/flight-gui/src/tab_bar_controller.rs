use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type TabBarController = GuiController<TabBarControllerFields>;
pub struct TabBarControllerItem {
    pub selected_state: Node2DRef,
    pub unselected_state: Node2DRef,
}
pub struct TabBarControllerOptions {
    pub selected_index: Option<i32>,
    pub tabs: Vec<Ref<TabBarControllerItem>>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct TabBarControllerSignals {
    pub on_change: Ref<Signal<i32>>,
}
pub struct TabBarControllerFields {
    pub selected_index: i32,
    pub signals: Ref<TabBarControllerSignals>,
    pub tabs: Vec<Ref<TabBarControllerItem>>,
}
pub fn create_tab_bar_controller(options: &TabBarControllerOptions) -> TabBarController {
    let mut out: TabBarController = allocate_entity();
    initialize_tab_bar_controller(&mut out, options);
    return out;
}
// flight-lint: allow(conform-extra) D12 source construction seam derives click subscriptions and selected visuals from the required shared tab records
pub fn initialize_tab_bar_controller(
    out: &mut TabBarController,
    options: &TabBarControllerOptions,
) {
    let runtime = create_gui_controller_runtime(
        TabBarControllerFields {
            selected_index: -1,
            signals: Arc::new(RwLock::new(TabBarControllerSignals {
                on_change: Arc::new(RwLock::new(create_signal())),
            })),
            tabs: options.tabs.clone(),
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    for (index, tab) in options.tabs.iter().enumerate() {
        let (selected, unselected) = {
            let tab = tab.read().unwrap();
            (tab.selected_state.clone(), tab.unselected_state.clone())
        };
        let mut targets = vec![selected.clone()];
        if !Arc::ptr_eq(&selected, &unselected) {
            targets.push(unselected);
        }
        for target in targets {
            let r = runtime.clone();
            connect_gui_interaction(
                &runtime,
                &target,
                InteractionSignalName::OnClick,
                GuiInteractionSlot::Pointer(GuiPointerSlot {
                    callback: Arc::new(move |_| set_tab_index(&r, index as i32)),
                }),
            );
        }
    }
    set_tab_index(
        &runtime,
        options
            .selected_index
            .unwrap_or(if options.tabs.is_empty() { -1 } else { 0 }),
    );
}
pub fn dispose_tab_bar_controller(controller: &TabBarController) {
    let runtime = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| runtime.write().unwrap().fields.tabs.clear());
}
pub fn get_tab_bar_controller_selected_index(controller: &TabBarController) -> i32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .selected_index;
}
pub fn get_tab_bar_controller_signals(
    controller: &TabBarController,
) -> Ref<TabBarControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}
pub fn set_tab_bar_controller_selected_index(controller: &TabBarController, index: i32) {
    set_tab_index(&get_gui_controller_runtime(controller), index);
}
fn set_tab_index(runtime: &Ref<GuiControllerRuntime<TabBarControllerFields>>, index: i32) {
    let (next, changed, tabs) = {
        let mut r = runtime.write().unwrap();
        let next = if index >= 0 && (index as usize) < r.fields.tabs.len() {
            index
        } else {
            -1
        };
        let changed = r.fields.selected_index != next;
        r.fields.selected_index = next;
        (next, changed, r.fields.tabs.clone())
    };
    for (i, tab) in tabs.iter().enumerate() {
        let node = tab.read().unwrap().selected_state.clone();
        set_gui_visible(runtime, Some(&node), next >= 0 && i == next as usize);
        let node = tab.read().unwrap().unselected_state.clone();
        set_gui_visible(runtime, Some(&node), next < 0 || i != next as usize);
    }
    if changed {
        let signals = runtime.read().unwrap().fields.signals.clone();
        let signal = signals.read().unwrap().on_change.clone();
        emit_gui_signal(&signal, &next);
    }
}
impl TabBarController {
    pub fn new(options: &TabBarControllerOptions) -> Self {
        return create_tab_bar_controller(options);
    }
}
