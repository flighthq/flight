use crate::gui_controller::*;
use crate::scroll_bar_controller::{ScrollBarController, get_scroll_bar_controller_signals};
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type ListController = GuiController<ListControllerFields>;
pub struct ListControllerOptions {
    pub content: Node2DRef,
    pub items: Vec<Node2DRef>,
    pub scroll_bar: Option<Ref<ScrollBarController>>,
    pub selectable: Option<bool>,
    pub selected_index: Option<i32>,
    pub viewport: Node2DRef,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct ListControllerSignals {
    pub on_activate: Ref<Signal<i32>>,
    pub on_select: Ref<Signal<i32>>,
}
pub struct ListControllerFields {
    pub base_content_y: f32,
    pub content: Option<Node2DRef>,
    pub items: Vec<Node2DRef>,
    pub scroll_bar: Option<Ref<ScrollBarController>>,
    pub selectable: bool,
    pub selected_index: i32,
    pub signals: Ref<ListControllerSignals>,
    pub viewport: Option<Node2DRef>,
}
pub fn create_list_controller(options: &ListControllerOptions) -> ListController {
    let mut out: ListController = allocate_entity();
    initialize_list_controller(&mut out, options);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction captures content origin and installs source item and composed scrollbar subscriptions
pub fn initialize_list_controller(out: &mut ListController, options: &ListControllerOptions) {
    let base_content_y = get_gui_position(&options.content, GuiOrientation::Vertical);
    let runtime = create_gui_controller_runtime(
        ListControllerFields {
            base_content_y,
            content: Some(options.content.clone()),
            items: options.items.clone(),
            scroll_bar: options.scroll_bar.clone(),
            selectable: options.selectable.unwrap_or(true),
            selected_index: normalize_index(
                options.selected_index.unwrap_or(-1),
                options.items.len(),
            ),
            signals: Arc::new(RwLock::new(ListControllerSignals {
                on_activate: Arc::new(RwLock::new(create_signal())),
                on_select: Arc::new(RwLock::new(create_signal())),
            })),
            viewport: Some(options.viewport.clone()),
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    for (index, item) in options.items.iter().enumerate() {
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            item,
            InteractionSignalName::OnClick,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| {
                    let selectable = r.read().unwrap().fields.selectable;
                    if selectable {
                        set_selected_runtime(&r, index as i32);
                    }
                }),
            }),
        );
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            item,
            InteractionSignalName::OnDoubleClick,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| emit_activation(&r, index as i32)),
            }),
        );
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            item,
            InteractionSignalName::OnKeyDown,
            GuiInteractionSlot::Keyboard(GuiKeyboardSlot {
                callback: Arc::new(move |data| handle_key(&r, &data.key)),
            }),
        );
    }
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &options.viewport,
        InteractionSignalName::OnKeyDown,
        GuiInteractionSlot::Keyboard(GuiKeyboardSlot {
            callback: Arc::new(move |data| handle_key(&r, &data.key)),
        }),
    );
    if let Some(scroll_bar) = &options.scroll_bar {
        let signals = get_scroll_bar_controller_signals(&scroll_bar.read().unwrap());
        let signal = signals.read().unwrap().on_change.clone();
        let r = runtime.clone();
        connect_gui_signal(
            &runtime,
            &signal,
            Arc::new(move |value| {
                let (content, y) = {
                    let s = r.read().unwrap();
                    (s.fields.content.clone(), s.fields.base_content_y - value)
                };
                set_gui_position(&r, content.as_ref(), GuiOrientation::Vertical, y);
            }),
        );
    }
}

pub fn dispose_list_controller(controller: &ListController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.content = None;
        s.fields.items.clear();
        s.fields.scroll_bar = None;
        s.fields.viewport = None;
    });
}

fn emit_activation(r: &Ref<GuiControllerRuntime<ListControllerFields>>, index: i32) {
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_activate.clone();
    emit_gui_signal(&signal, &index);
}

pub fn get_list_controller_selected_index(controller: &ListController) -> i32 {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .selected_index;
}

pub fn get_list_controller_signals(controller: &ListController) -> Ref<ListControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

fn handle_key(r: &Ref<GuiControllerRuntime<ListControllerFields>>, key: &str) {
    let (length, index) = {
        let s = r.read().unwrap();
        (s.fields.items.len() as i32, s.fields.selected_index)
    };
    let next = match key {
        "ArrowDown" => (length - 1).min(index + 1),
        "ArrowUp" => 0.max(index - 1),
        "Home" => {
            if length == 0 {
                -1
            } else {
                0
            }
        }
        "End" => length - 1,
        "Enter" if index >= 0 => {
            emit_activation(r, index);
            return;
        }
        _ => return,
    };
    set_selected_runtime(r, next);
}

fn normalize_index(index: i32, length: usize) -> i32 {
    return if index >= 0 && (index as usize) < length {
        index
    } else {
        -1
    };
}

pub fn set_list_controller_selected_index(controller: &ListController, index: i32) {
    set_selected_runtime(&get_gui_controller_runtime(controller), index);
}

pub fn set_list_controller_visible(controller: &ListController, visible: bool) {
    set_visible_runtime(&get_gui_controller_runtime(controller), visible);
}

fn set_selected_runtime(r: &Ref<GuiControllerRuntime<ListControllerFields>>, index: i32) {
    let next = {
        let mut s = r.write().unwrap();
        let next = normalize_index(index, s.fields.items.len());
        if s.fields.selected_index == next || s.disposed {
            return;
        }
        s.fields.selected_index = next;
        next
    };
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_select.clone();
    emit_gui_signal(&signal, &next);
}

pub(crate) fn set_visible_runtime(
    r: &Ref<GuiControllerRuntime<ListControllerFields>>,
    visible: bool,
) {
    let viewport = r.read().unwrap().fields.viewport.clone();
    set_gui_visible(r, viewport.as_ref(), visible);
    let content = r.read().unwrap().fields.content.clone();
    set_gui_visible(r, content.as_ref(), visible);
}
impl ListController {
    pub fn new(options: &ListControllerOptions) -> Self {
        return create_list_controller(options);
    }
}
