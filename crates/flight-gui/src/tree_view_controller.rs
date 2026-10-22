use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity};
use flight_interaction::contract::InteractionSignalName;
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, create_signal};
use std::sync::{Arc, RwLock};
pub type TreeViewController = GuiController<TreeViewControllerFields>;
pub struct TreeViewControllerItem {
    pub children: Option<Vec<Ref<TreeViewControllerItem>>>,
    pub expanded: Option<bool>,
    pub visual: Node2DRef,
}
pub struct TreeViewControllerOptions {
    pub items: Vec<Ref<TreeViewControllerItem>>,
    pub selected_item: Option<Ref<TreeViewControllerItem>>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct TreeViewControllerSignals {
    pub on_activate: Ref<Signal<Ref<TreeViewControllerItem>>>,
    pub on_expand_change: Ref<Signal<(Ref<TreeViewControllerItem>, bool)>>,
    pub on_select: Ref<Signal<Option<Ref<TreeViewControllerItem>>>>,
}
pub struct TreeViewParent {
    pub item: Ref<TreeViewControllerItem>,
    pub parent: Option<Ref<TreeViewControllerItem>>,
}
pub struct TreeViewControllerFields {
    pub expanded: Vec<Ref<TreeViewControllerItem>>,
    pub items: Vec<Ref<TreeViewControllerItem>>,
    pub parents: Vec<TreeViewParent>,
    pub roots: Vec<Ref<TreeViewControllerItem>>,
    pub selected_item: Option<Ref<TreeViewControllerItem>>,
    pub signals: Ref<TreeViewControllerSignals>,
}
pub fn create_tree_view_controller(options: &TreeViewControllerOptions) -> TreeViewController {
    let mut out: TreeViewController = allocate_entity();
    initialize_tree_view_controller(&mut out, options);
    return out;
}

// flight-lint: allow(conform-extra) D12 source construction derives identity-keyed parent and expansion state and subscriptions from the caller hierarchy
pub fn initialize_tree_view_controller(
    out: &mut TreeViewController,
    options: &TreeViewControllerOptions,
) {
    let mut fields = TreeViewControllerFields {
        expanded: Vec::new(),
        items: Vec::new(),
        parents: Vec::new(),
        roots: options.items.clone(),
        selected_item: options.selected_item.clone(),
        signals: Arc::new(RwLock::new(TreeViewControllerSignals {
            on_activate: Arc::new(RwLock::new(create_signal())),
            on_expand_change: Arc::new(RwLock::new(create_signal())),
            on_select: Arc::new(RwLock::new(create_signal())),
        })),
    };
    collect_items(&options.items, None, &mut fields);
    let items = fields.items.clone();
    let runtime = create_gui_controller_runtime(fields, options.transition.clone());
    initialize_gui_controller(out, runtime.clone());
    for item in items {
        let visual = item.read().unwrap().visual.clone();
        let r = runtime.clone();
        let entry = item.clone();
        connect_gui_interaction(
            &runtime,
            &visual,
            InteractionSignalName::OnClick,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| set_selected_runtime(&r, Some(entry.clone()))),
            }),
        );
        let r = runtime.clone();
        let entry = item.clone();
        connect_gui_interaction(
            &runtime,
            &visual,
            InteractionSignalName::OnDoubleClick,
            GuiInteractionSlot::Pointer(GuiPointerSlot {
                callback: Arc::new(move |_| {
                    emit_activation(&r, &entry);
                    let has_children = has_children(&entry);
                    if has_children {
                        let next = !contains(&r.read().unwrap().fields.expanded, &entry);
                        set_expanded_runtime(&r, &entry, next);
                    }
                }),
            }),
        );
        let r = runtime.clone();
        connect_gui_interaction(
            &runtime,
            &visual,
            InteractionSignalName::OnKeyDown,
            GuiInteractionSlot::Keyboard(GuiKeyboardSlot {
                callback: Arc::new(move |data| handle_key(&r, &data.key)),
            }),
        );
    }
    update_visibility(&runtime);
}

fn collect_items(
    source: &[Ref<TreeViewControllerItem>],
    parent: Option<Ref<TreeViewControllerItem>>,
    fields: &mut TreeViewControllerFields,
) {
    for item in source {
        fields.items.push(item.clone());
        if let Some(row) = fields
            .parents
            .iter_mut()
            .find(|row| Arc::ptr_eq(&row.item, item))
        {
            row.parent = parent.clone();
        } else {
            fields.parents.push(TreeViewParent {
                item: item.clone(),
                parent: parent.clone(),
            });
        }
        let (expanded, children) = {
            let item = item.read().unwrap();
            (item.expanded, item.children.clone())
        };
        if expanded == Some(true) && !contains(&fields.expanded, item) {
            fields.expanded.push(item.clone());
        }
        if let Some(children) = children {
            collect_items(&children, Some(item.clone()), fields);
        }
    }
}

fn contains(items: &[Ref<TreeViewControllerItem>], item: &Ref<TreeViewControllerItem>) -> bool {
    return items.iter().any(|old| Arc::ptr_eq(old, item));
}

pub fn dispose_tree_view_controller(controller: &TreeViewController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let mut s = r.write().unwrap();
        s.fields.expanded.clear();
        s.fields.items.clear();
        s.fields.parents.clear();
        s.fields.roots.clear();
        s.fields.selected_item = None;
    });
}

fn emit_activation(
    r: &Ref<GuiControllerRuntime<TreeViewControllerFields>>,
    item: &Ref<TreeViewControllerItem>,
) {
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_activate.clone();
    emit_gui_signal(&signal, item);
}

pub fn get_tree_view_controller_selected_item(
    controller: &TreeViewController,
) -> Option<Ref<TreeViewControllerItem>> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .selected_item
        .clone();
}

pub fn get_tree_view_controller_signals(
    controller: &TreeViewController,
) -> Ref<TreeViewControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

fn handle_key(r: &Ref<GuiControllerRuntime<TreeViewControllerFields>>, key: &str) {
    let (selected, visible, index, expanded, parent) = {
        let s = r.read().unwrap();
        let selected = s.fields.selected_item.clone();
        let visible: Vec<Ref<TreeViewControllerItem>> = s
            .fields
            .items
            .iter()
            .filter(|item| is_visible(&s.fields, item))
            .cloned()
            .collect();
        let index = selected
            .as_ref()
            .and_then(|item| visible.iter().position(|old| Arc::ptr_eq(old, item)))
            .map(|index| index as i32)
            .unwrap_or(-1);
        let expanded = selected
            .as_ref()
            .map(|item| contains(&s.fields.expanded, item))
            .unwrap_or(false);
        let parent = selected
            .as_ref()
            .and_then(|item| {
                s.fields
                    .parents
                    .iter()
                    .find(|row| Arc::ptr_eq(&row.item, item))
            })
            .and_then(|row| row.parent.clone());
        (selected, visible, index, expanded, parent)
    };
    match key {
        "ArrowDown" if !visible.is_empty() => set_selected_runtime(
            r,
            Some(visible[((index + 1) as usize).min(visible.len() - 1)].clone()),
        ),
        "ArrowUp" if !visible.is_empty() => {
            set_selected_runtime(r, Some(visible[(index - 1).max(0) as usize].clone()))
        }
        "ArrowRight" => {
            if let Some(selected) = selected {
                let children = selected
                    .read()
                    .unwrap()
                    .children
                    .clone()
                    .unwrap_or_else(Vec::new);
                if !children.is_empty() && !expanded {
                    set_expanded_runtime(r, &selected, true);
                } else if !children.is_empty() {
                    set_selected_runtime(r, Some(children[0].clone()));
                }
            }
        }
        "ArrowLeft" => {
            if let Some(selected) = selected {
                if expanded {
                    set_expanded_runtime(r, &selected, false);
                } else {
                    set_selected_runtime(r, parent);
                }
            }
        }
        "Enter" => {
            if let Some(selected) = selected {
                emit_activation(r, &selected);
            }
        }
        _ => {}
    }
}

fn has_children(item: &Ref<TreeViewControllerItem>) -> bool {
    return item
        .read()
        .unwrap()
        .children
        .as_ref()
        .map(|children| !children.is_empty())
        .unwrap_or(false);
}

pub fn is_tree_view_controller_item_expanded(
    controller: &TreeViewController,
    item: &Ref<TreeViewControllerItem>,
) -> bool {
    return contains(
        &get_gui_controller_runtime(controller)
            .read()
            .unwrap()
            .fields
            .expanded,
        item,
    );
}

fn is_visible(fields: &TreeViewControllerFields, item: &Ref<TreeViewControllerItem>) -> bool {
    let mut parent = fields
        .parents
        .iter()
        .find(|row| Arc::ptr_eq(&row.item, item))
        .and_then(|row| row.parent.clone());
    while let Some(current) = parent {
        if !contains(&fields.expanded, &current) {
            return false;
        }
        parent = fields
            .parents
            .iter()
            .find(|row| Arc::ptr_eq(&row.item, &current))
            .and_then(|row| row.parent.clone());
    }
    return true;
}

fn set_expanded_runtime(
    r: &Ref<GuiControllerRuntime<TreeViewControllerFields>>,
    item: &Ref<TreeViewControllerItem>,
    expanded: bool,
) {
    {
        let mut s = r.write().unwrap();
        if !s
            .fields
            .parents
            .iter()
            .any(|row| Arc::ptr_eq(&row.item, item))
            || !has_children(item)
            || s.disposed
        {
            return;
        }
        let previous = contains(&s.fields.expanded, item);
        if previous == expanded {
            return;
        }
        if expanded {
            s.fields.expanded.push(item.clone());
        } else {
            s.fields.expanded.retain(|old| !Arc::ptr_eq(old, item));
        }
    }
    update_visibility(r);
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_expand_change.clone();
    emit_gui_signal(&signal, &(item.clone(), expanded));
}

fn set_selected_runtime(
    r: &Ref<GuiControllerRuntime<TreeViewControllerFields>>,
    item: Option<Ref<TreeViewControllerItem>>,
) {
    let next = {
        let mut s = r.write().unwrap();
        let next = item.filter(|item| {
            s.fields
                .parents
                .iter()
                .any(|row| Arc::ptr_eq(&row.item, item))
        });
        let same = match (&s.fields.selected_item, &next) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            (None, None) => true,
            _ => false,
        };
        if same || s.disposed {
            return;
        }
        s.fields.selected_item = next.clone();
        next
    };
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_select.clone();
    emit_gui_signal(&signal, &next);
}

pub fn set_tree_view_controller_item_expanded(
    controller: &TreeViewController,
    item: &Ref<TreeViewControllerItem>,
    expanded: bool,
) {
    set_expanded_runtime(&get_gui_controller_runtime(controller), item, expanded);
}

pub fn set_tree_view_controller_selected_item(
    controller: &TreeViewController,
    item: Option<Ref<TreeViewControllerItem>>,
) {
    set_selected_runtime(&get_gui_controller_runtime(controller), item);
}

pub fn toggle_tree_view_controller_item(
    controller: &TreeViewController,
    item: &Ref<TreeViewControllerItem>,
) {
    let r = get_gui_controller_runtime(controller);
    let next = !contains(&r.read().unwrap().fields.expanded, item);
    set_expanded_runtime(&r, item, next);
}

fn update_visibility(r: &Ref<GuiControllerRuntime<TreeViewControllerFields>>) {
    let items = r.read().unwrap().fields.items.clone();
    for item in items {
        let visible = is_visible(&r.read().unwrap().fields, &item);
        let visual = item.read().unwrap().visual.clone();
        set_gui_visible(r, Some(&visual), visible);
    }
}
impl TreeViewController {
    pub fn new(options: &TreeViewControllerOptions) -> Self {
        return create_tree_view_controller(options);
    }
}
