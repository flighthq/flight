use crate::gui_controller::*;
use flight_entity::{Ref, Unknown, allocate_entity};
use flight_interaction::contract::{
    FocusManager, InteractionSignalName, get_focused_node, set_focused_node_ref,
};
use flight_node::NodeRef;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type GuiDialog = GuiController<GuiDialogFields>;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GuiDialogCloseReason {
    Accepted,
    Cancelled,
    Dismissed,
}
pub struct GuiDialogCloseResult {
    pub entry_id: String,
    pub reason: GuiDialogCloseReason,
    pub value: Option<Unknown>,
}
pub struct GuiDialogEntry {
    pub dismiss_on_backdrop: Option<bool>,
    pub id: String,
    pub initial_focus: Option<Node2DRef>,
    pub root: Node2DRef,
}
#[derive(Default)]
pub struct GuiDialogOptions {
    pub backdrop: Option<Node2DRef>,
    pub focus_manager: Option<Ref<FocusManager>>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct GuiDialogSignals {
    pub on_active_change: Ref<Signal<Option<Ref<GuiDialogEntry>>>>,
    pub on_close: Ref<Signal<Ref<GuiDialogCloseResult>>>,
    pub on_queue_change: Ref<Signal<()>>,
}
pub struct GuiDialogFields {
    pub backdrop: Option<Node2DRef>,
    pub entries: Vec<Ref<GuiDialogEntry>>,
    pub focus_manager: Option<Ref<FocusManager>>,
    pub has_focus_snapshot: bool,
    pub previous_focus: Option<NodeRef>,
    pub signals: Ref<GuiDialogSignals>,
}
pub fn create_gui_dialog(options: Option<&GuiDialogOptions>) -> GuiDialog {
    let mut out: GuiDialog = allocate_entity();
    initialize_gui_dialog(&mut out, options);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction derives backdrop subscriptions and source focus/transition configuration from optional options
pub fn initialize_gui_dialog(out: &mut GuiDialog, options: Option<&GuiDialogOptions>) {
    let empty = GuiDialogOptions {
        backdrop: None,
        focus_manager: None,
        transition: None,
    };
    let options = options.unwrap_or(&empty);
    let runtime = create_gui_controller_runtime(
        GuiDialogFields {
            backdrop: options.backdrop.clone(),
            entries: Vec::new(),
            focus_manager: options.focus_manager.clone(),
            has_focus_snapshot: false,
            previous_focus: None,
            signals: Arc::new(RwLock::new(GuiDialogSignals {
                on_active_change: Arc::new(RwLock::new(create_signal())),
                on_close: Arc::new(RwLock::new(create_signal())),
                on_queue_change: Arc::new(RwLock::new(create_signal())),
            })),
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    if let Some(backdrop) = &options.backdrop {
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            backdrop,
            InteractionSignalName::OnClick,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| {
                    let active = r.read().unwrap().fields.entries.first().cloned();
                    let Some(active) = active else {
                        return;
                    };
                    let result = {
                        let active = active.read().unwrap();
                        if active.dismiss_on_backdrop != Some(true) {
                            return;
                        }
                        GuiDialogCloseResult {
                            entry_id: active.id.clone(),
                            reason: GuiDialogCloseReason::Dismissed,
                            value: None,
                        }
                    };
                    close_runtime(&r, &Arc::new(RwLock::new(result)));
                }),
            }),
        );
    }
    let backdrop = runtime.read().unwrap().fields.backdrop.clone();
    set_gui_visible(&runtime, backdrop.as_ref(), false);
}

fn activate_entry(r: &Ref<GuiControllerRuntime<GuiDialogFields>>, entry: &Ref<GuiDialogEntry>) {
    let root = entry.read().unwrap().root.clone();
    set_gui_visible(r, Some(&root), true);
    let backdrop = r.read().unwrap().fields.backdrop.clone();
    set_gui_visible(r, backdrop.as_ref(), true);
    let manager = r.read().unwrap().fields.focus_manager.clone();
    if let Some(manager) = manager {
        let initial = entry.read().unwrap().initial_focus.clone();
        if let Some(initial) = initial {
            let initial: NodeRef = initial;
            set_focused_node_ref(&manager, Some(initial));
        }
    }
}

pub fn close_gui_dialog(dialog: &GuiDialog, result: &Ref<GuiDialogCloseResult>) -> bool {
    return close_runtime(&get_gui_controller_runtime(dialog), result);
}

fn close_runtime(
    r: &Ref<GuiControllerRuntime<GuiDialogFields>>,
    result: &Ref<GuiDialogCloseResult>,
) -> bool {
    let active = {
        let mut s = r.write().unwrap();
        let active = s.fields.entries.first().cloned();
        let Some(active) = active else {
            return false;
        };
        if s.disposed || active.read().unwrap().id != result.read().unwrap().entry_id {
            return false;
        }
        s.fields.entries.remove(0)
    };
    let root = active.read().unwrap().root.clone();
    set_gui_visible(r, Some(&root), false);
    let next = r.read().unwrap().fields.entries.first().cloned();
    if let Some(next) = &next {
        activate_entry(r, next);
    } else {
        let backdrop = r.read().unwrap().fields.backdrop.clone();
        set_gui_visible(r, backdrop.as_ref(), false);
        restore_focus(r);
    }
    emit_active(r, next);
    emit_queue(r);
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_close.clone();
    emit_gui_signal(&signal, result);
    return true;
}

pub fn dispose_gui_dialog(dialog: &GuiDialog) {
    let r = get_gui_controller_runtime(dialog);
    if r.read().unwrap().disposed {
        return;
    }
    let mut index = 0;
    loop {
        let entry = r.read().unwrap().fields.entries.get(index).cloned();
        let Some(entry) = entry else {
            break;
        };
        let root = entry.read().unwrap().root.clone();
        set_gui_visible(&r, Some(&root), false);
        index += 1;
    }
    let backdrop = r.read().unwrap().fields.backdrop.clone();
    set_gui_visible(&r, backdrop.as_ref(), false);
    restore_focus(&r);
    dispose_gui_controller(dialog, &|| {
        let mut s = r.write().unwrap();
        s.fields.backdrop = None;
        s.fields.entries.clear();
        s.fields.focus_manager = None;
        s.fields.previous_focus = None;
    });
}

fn emit_active(r: &Ref<GuiControllerRuntime<GuiDialogFields>>, entry: Option<Ref<GuiDialogEntry>>) {
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_active_change.clone();
    emit_gui_signal(&signal, &entry);
}

fn emit_queue(r: &Ref<GuiControllerRuntime<GuiDialogFields>>) {
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_queue_change.clone();
    emit_gui_signal(&signal, &());
}

pub fn enqueue_gui_dialog(dialog: &GuiDialog, entry: &Ref<GuiDialogEntry>) -> bool {
    let r = get_gui_controller_runtime(dialog);
    let activate = {
        let mut s = r.write().unwrap();
        let id = entry.read().unwrap().id.clone();
        if s.disposed
            || s.fields
                .entries
                .iter()
                .any(|candidate| candidate.read().unwrap().id == id)
        {
            return false;
        }
        let activate = s.fields.entries.is_empty();
        s.fields.entries.push(entry.clone());
        activate
    };
    if activate {
        snapshot_focus(&r);
        activate_entry(&r, entry);
        emit_active(&r, Some(entry.clone()));
    } else {
        let root = entry.read().unwrap().root.clone();
        set_gui_visible(&r, Some(&root), false);
    }
    emit_queue(&r);
    return true;
}

pub fn get_active_gui_dialog_entry(dialog: &GuiDialog) -> Option<Ref<GuiDialogEntry>> {
    return get_gui_controller_runtime(dialog)
        .read()
        .unwrap()
        .fields
        .entries
        .first()
        .cloned();
}

// flight-lint: allow(conform-extra) D9 closed source close-reason literals have an explicit string projection
pub fn get_gui_dialog_close_reason_string(value: GuiDialogCloseReason) -> &'static str {
    return match value {
        GuiDialogCloseReason::Accepted => "accepted",
        GuiDialogCloseReason::Cancelled => "cancelled",
        GuiDialogCloseReason::Dismissed => "dismissed",
    };
}

// flight-lint: allow(conform-params) D24 computed collection output is FIRST and required; clear/refill in FIFO order retaining the original entry handles
pub fn get_gui_dialog_entries(out: &mut Vec<Ref<GuiDialogEntry>>, dialog: &GuiDialog) {
    let entries = get_gui_controller_runtime(dialog)
        .read()
        .unwrap()
        .fields
        .entries
        .clone();
    out.clear();
    out.extend(entries);
}

pub fn get_gui_dialog_signals(dialog: &GuiDialog) -> Ref<GuiDialogSignals> {
    return get_gui_controller_runtime(dialog)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

// flight-lint: allow(conform-extra) D9 parse the source closed close-reason literals without an invented fallback
pub fn parse_gui_dialog_close_reason(value: &str) -> Option<GuiDialogCloseReason> {
    return match value {
        "accepted" => Some(GuiDialogCloseReason::Accepted),
        "cancelled" => Some(GuiDialogCloseReason::Cancelled),
        "dismissed" => Some(GuiDialogCloseReason::Dismissed),
        _ => None,
    };
}

pub fn remove_gui_dialog_entry(dialog: &GuiDialog, id: &str) -> bool {
    let r = get_gui_controller_runtime(dialog);
    let removed = {
        let mut s = r.write().unwrap();
        if s.disposed {
            return false;
        }
        let index = s
            .fields
            .entries
            .iter()
            .enumerate()
            .find(|(index, entry)| *index > 0 && entry.read().unwrap().id == id)
            .map(|(index, _)| index);
        let Some(index) = index else {
            return false;
        };
        s.fields.entries.remove(index)
    };
    let root = removed.read().unwrap().root.clone();
    set_gui_visible(&r, Some(&root), false);
    emit_queue(&r);
    return true;
}

fn restore_focus(r: &Ref<GuiControllerRuntime<GuiDialogFields>>) {
    let (manager, previous) = {
        let s = r.read().unwrap();
        if !s.fields.has_focus_snapshot {
            return;
        }
        (
            s.fields.focus_manager.clone(),
            s.fields.previous_focus.clone(),
        )
    };
    let Some(manager) = manager else {
        return;
    };
    set_focused_node_ref(&manager, previous);
    let mut s = r.write().unwrap();
    s.fields.has_focus_snapshot = false;
    s.fields.previous_focus = None;
}

fn snapshot_focus(r: &Ref<GuiControllerRuntime<GuiDialogFields>>) {
    let manager = r.read().unwrap().fields.focus_manager.clone();
    let Some(manager) = manager else {
        return;
    };
    let previous = get_focused_node(&manager.read().unwrap());
    let mut s = r.write().unwrap();
    s.fields.previous_focus = previous;
    s.fields.has_focus_snapshot = true;
}
impl GuiDialog {
    pub fn new(options: Option<&GuiDialogOptions>) -> Self {
        return create_gui_dialog(options);
    }
}
