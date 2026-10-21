//! Kind-registry behaviour for commands (TS `commandBinding.ts`).
//!
//! Bindings are registered per kind, never stored on a command. An unregistered kind is an expected
//! lookup failure: lookups take the `None` sentinel, and dispatch refuses rather than throwing.
//!
//! The `SetNodePropertyCommand` binding is deferred with its constructors: writing a node property
//! requires the dynamic field-access carrier that is with the Principal. Every other built-in kind is
//! registered here.

use std::collections::HashMap;
use std::sync::{Arc, RwLock, Weak};

use flight_entity::{Kind, Ref};
use flight_node::contract::{
    NodeRef, add_node_child_at, get_node_child_count, remove_node_child, set_node_child_index,
};
use flight_registry::with_kind_map_entry;

use crate::types::*;

/// An empty binding table; nothing dispatches until a caller registers it (TS
/// `createCommandBindingTable`).
pub fn create_command_binding_table() -> CommandBindingTable {
    return CommandBindingTable {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

fn add_node_child_command_binding() -> CommandBindingRef {
    return Arc::new(CommandBinding {
        execute: Arc::new(|command: &dyn Command| {
            let add = command
                .as_any()
                .downcast_ref::<AddNodeChildCommand>()
                .expect("AddNodeChildCommand binding received another kind");
            let index = resolve_insert_index(&add.parent, add.index);
            add_node_child_at(&add.parent, &add.child, index);
        }),
        merge: None,
        undo: Arc::new(|command: &dyn Command| {
            let add = command
                .as_any()
                .downcast_ref::<AddNodeChildCommand>()
                .expect("AddNodeChildCommand binding received another kind");
            remove_node_child(&add.parent, &add.child);
        }),
    });
}

/// The kind-only helper the deferred property binding and tests use to name a command's kind.
pub(crate) fn command_kind(command: &CommandRef) -> Kind {
    return command.read().unwrap().command_fields().kind.clone();
}

/// The one binding that needs the history, because dispatching a child resolves that child's own
/// kind against the same table. It holds a weak handle, so the table is re-read on every call and a
/// binding registered later is still found.
fn composite_command_binding(history: &Ref<CommandHistory>) -> CommandBindingRef {
    let owner: Weak<RwLock<CommandHistory>> = Arc::downgrade(history);
    let execute_owner = owner.clone();
    return Arc::new(CommandBinding {
        execute: Arc::new(move |command: &dyn Command| {
            let Some(composite) = command.as_composite() else {
                return;
            };
            let Some(history) = execute_owner.upgrade() else {
                return;
            };
            for child in &composite.children {
                dispatch_child(&history, child, true);
            }
        }),
        merge: None,
        undo: Arc::new(move |command: &dyn Command| {
            let Some(composite) = command.as_composite() else {
                return;
            };
            let Some(history) = owner.upgrade() else {
                return;
            };
            for child in composite.children.iter().rev() {
                dispatch_child(&history, child, false);
            }
        }),
    });
}

fn dispatch_child(history: &Ref<CommandHistory>, child: &CommandRef, execute: bool) {
    let kind = child.read().unwrap().command_fields().kind.clone();
    let Some(binding) = get_command_binding(history, &kind) else {
        return;
    };
    if execute {
        (binding.execute)(&*child.read().unwrap());
    } else {
        (binding.undo)(&*child.read().unwrap());
    }
}

/// The binding registered for `kind`, or `None` when nothing is (TS `getCommandBinding`).
pub fn get_command_binding(history: &Ref<CommandHistory>, kind: &str) -> Option<CommandBindingRef> {
    return history.read().unwrap().bindings.entries.get(kind).cloned();
}

/// Whether a binding exists for `kind` (TS `hasCommandBinding`).
pub fn has_command_binding(history: &Ref<CommandHistory>, kind: &str) -> bool {
    return get_command_binding(history, kind).is_some();
}

/// Binds behaviour to a command kind; last write wins (TS `registerCommandBinding`). The table is
/// immutable data, so this replaces the history's table with the updated copy.
pub fn register_command_binding(
    history: &Ref<CommandHistory>,
    kind: &str,
    binding: CommandBindingRef,
) {
    let mut guard = history.write().unwrap();
    let bindings = with_kind_map_entry(&guard.bindings, String::from(kind), binding);
    guard.bindings = bindings;
}

/// Registers the built-in bindings other than `SetNodePropertyCommand`, whose binding waits on the
/// property-access ruling (TS `registerDefaultCommandBindings`).
pub fn register_default_command_bindings(history: &Ref<CommandHistory>) {
    register_command_binding(
        history,
        ADD_NODE_CHILD_COMMAND_KIND,
        add_node_child_command_binding(),
    );
    register_command_binding(
        history,
        COMPOSITE_COMMAND_KIND,
        composite_command_binding(history),
    );
    register_command_binding(
        history,
        REMOVE_NODE_CHILD_COMMAND_KIND,
        remove_node_child_command_binding(),
    );
    register_command_binding(
        history,
        REORDER_NODE_CHILD_COMMAND_KIND,
        reorder_node_child_command_binding(),
    );
}

fn remove_node_child_command_binding() -> CommandBindingRef {
    return Arc::new(CommandBinding {
        execute: Arc::new(|command: &dyn Command| {
            let remove = command
                .as_any()
                .downcast_ref::<RemoveNodeChildCommand>()
                .expect("RemoveNodeChildCommand binding received another kind");
            remove_node_child(&remove.parent, &remove.child);
        }),
        merge: None,
        undo: Arc::new(|command: &dyn Command| {
            let remove = command
                .as_any()
                .downcast_ref::<RemoveNodeChildCommand>()
                .expect("RemoveNodeChildCommand binding received another kind");
            let index = resolve_insert_index(&remove.parent, remove.index);
            add_node_child_at(&remove.parent, &remove.child, index);
        }),
    });
}

fn reorder_node_child_command_binding() -> CommandBindingRef {
    return Arc::new(CommandBinding {
        execute: Arc::new(|command: &dyn Command| {
            let reorder = command
                .as_any()
                .downcast_ref::<ReorderNodeChildCommand>()
                .expect("ReorderNodeChildCommand binding received another kind");
            set_node_child_index(&reorder.parent, &reorder.child, reorder.to_index);
        }),
        merge: None,
        undo: Arc::new(|command: &dyn Command| {
            let reorder = command
                .as_any()
                .downcast_ref::<ReorderNodeChildCommand>()
                .expect("ReorderNodeChildCommand binding received another kind");
            set_node_child_index(&reorder.parent, &reorder.child, reorder.from_index);
        }),
    });
}

/// `-1` appends. Resolved against the CURRENT child count, because an undo that restores a child to
/// index 7 of a parent that now holds three children must place it at the end rather than fail.
pub(crate) fn resolve_insert_index(parent: &NodeRef, index: i32) -> i32 {
    let count = get_node_child_count(parent) as i32;
    return if index < 0 || index > count {
        count
    } else {
        index
    };
}
