//! Constructors and construction initializers for the built-in command kinds (TS `command.ts`).
//!
//! Each constructor captures what undo will need AT CREATION TIME — the child's current index for
//! hierarchy kinds, the current property value for property kinds. Property capture resolves the
//! typed accessor through the explicit caller-owned registry (Principal db87e24b).

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, Unknown, allocate_entity};
use flight_node::contract::{NodeRef, get_node_child_index};

use crate::command_property_access::read_command_property;
use crate::types::*;

/// Adds `child` to `parent` (TS `createAddNodeChildCommand`). The default `index` of `-1` appends;
/// assign `index` after create to insert at a position.
// flight-lint: allow(conform-params) D23 B: label and insertion index removed; assigned after create
pub fn create_add_node_child_command(
    parent: &NodeRef,
    child: &NodeRef,
) -> Ref<AddNodeChildCommand> {
    let mut out: AddNodeChildCommand = allocate_entity();
    initialize_add_node_child_command(&mut out, parent, child);
    return Arc::new(RwLock::new(out));
}

/// Applies `children` as one history entry, in order; undo runs them in reverse (TS
/// `createCompositeCommand`). The child list is copied, so a later caller push cannot rewrite the
/// recorded entry.
// flight-lint: allow(conform-params) D23 B: label removed; assigned after create
pub fn create_composite_command(children: &[CommandRef]) -> Ref<CompositeCommand> {
    let mut out: CompositeCommand = allocate_entity();
    initialize_composite_command(&mut out, children);
    return Arc::new(RwLock::new(out));
}

/// Removes `child` from `parent`, capturing its CURRENT index so undo restores position (TS
/// `createRemoveNodeChildCommand`). Build this before removing the child.
// flight-lint: allow(conform-params) D23 B: label removed; assigned after create; the current index is still captured
pub fn create_remove_node_child_command(
    parent: &NodeRef,
    child: &NodeRef,
) -> Ref<RemoveNodeChildCommand> {
    let mut out: RemoveNodeChildCommand = allocate_entity();
    initialize_remove_node_child_command(&mut out, parent, child);
    return Arc::new(RwLock::new(out));
}

/// Moves `child` to `to_index`, capturing where it started (TS `createReorderNodeChildCommand`).
/// Build this before moving the child.
// flight-lint: allow(conform-params) D23 B: label removed; assigned after create; to_index stays and from_index is still captured
pub fn create_reorder_node_child_command(
    parent: &NodeRef,
    child: &NodeRef,
    to_index: i32,
) -> Ref<ReorderNodeChildCommand> {
    let mut out: ReorderNodeChildCommand = allocate_entity();
    initialize_reorder_node_child_command(&mut out, parent, child, to_index);
    return Arc::new(RwLock::new(out));
}

/// Captures the current value of one node property as `before`, without applying the change (TS
/// `createSetNodePropertyCommand`). The registry is explicit caller-owned context (D5); the accessor
/// is resolved now, at capture time.
// flight-lint: allow(conform-params) D5: the explicit property-access registry is an added parameter; TS reads the property dynamically
pub fn create_set_node_property_command(
    target: &NodeRef,
    property: &str,
    value: Option<Unknown>,
    access: &CommandPropertyAccessRef,
) -> Ref<SetNodePropertyCommand> {
    let entry = CommandPropertyEntry {
        after: value,
        before: read_command_property(access, target, property),
        property: String::from(property),
        target: target.clone(),
    };
    let mut out: SetNodePropertyCommand = allocate_entity();
    initialize_set_node_property_command(&mut out, &[entry], SET_NODE_PROPERTY_COMMAND_KIND);
    return Arc::new(RwLock::new(out));
}

/// Captures each assignment's current value in the order given (TS
/// `createSetNodePropertyCommandBatch`).
// flight-lint: allow(conform-params) D5: the explicit property-access registry is an added parameter; TS reads the properties dynamically
pub fn create_set_node_property_command_batch(
    entries: &[CommandPropertyAssignment],
    access: &CommandPropertyAccessRef,
) -> Ref<SetNodePropertyCommand> {
    let captured: Vec<CommandPropertyEntry> = entries
        .iter()
        .map(|entry| CommandPropertyEntry {
            after: entry.value.clone(),
            before: read_command_property(access, &entry.target, &entry.property),
            property: entry.property.clone(),
            target: entry.target.clone(),
        })
        .collect();
    let mut out: SetNodePropertyCommand = allocate_entity();
    initialize_set_node_property_command(&mut out, &captured, SET_NODE_PROPERTY_COMMAND_KIND);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_add_node_child_command`.
// flight-lint: allow(conform-params) D23 B: label and insertion index removed; initialize mirrors create
pub fn initialize_add_node_child_command(
    out: &mut AddNodeChildCommand,
    parent: &NodeRef,
    child: &NodeRef,
) {
    out.fields.kind = String::from(ADD_NODE_CHILD_COMMAND_KIND);
    out.parent = parent.clone();
    out.child = child.clone();
    out.index = -1;
}

/// Initializes the shared fields of a custom command kind (D16 open family). Rust-only seam: a
/// vendor kind composes `CommandFields` and needs them initialized without a projection.
// flight-lint: allow(conform-extra) D16 open command family: custom kinds initialize the shared fields directly
pub fn initialize_command_fields(out: &mut CommandFields, kind: &str, label: &str) {
    out.kind = String::from(kind);
    out.label = String::from(label);
}

/// The construction initializer of `create_composite_command`.
// flight-lint: allow(conform-params) D23 B: label removed; initialize mirrors create
pub fn initialize_composite_command(out: &mut CompositeCommand, children: &[CommandRef]) {
    out.fields.kind = String::from(COMPOSITE_COMMAND_KIND);
    out.children = children.to_vec();
}

/// The construction initializer of `create_remove_node_child_command`; captures the current index.
// flight-lint: allow(conform-params) D23 B: label removed; initialize mirrors create
pub fn initialize_remove_node_child_command(
    out: &mut RemoveNodeChildCommand,
    parent: &NodeRef,
    child: &NodeRef,
) {
    out.fields.kind = String::from(REMOVE_NODE_CHILD_COMMAND_KIND);
    out.parent = parent.clone();
    out.child = child.clone();
    out.index = get_node_child_index(parent, child);
}

/// The construction initializer of `create_reorder_node_child_command`; captures `fromIndex`.
// flight-lint: allow(conform-params) D23 B: label removed; initialize mirrors create
pub fn initialize_reorder_node_child_command(
    out: &mut ReorderNodeChildCommand,
    parent: &NodeRef,
    child: &NodeRef,
    to_index: i32,
) {
    out.fields.kind = String::from(REORDER_NODE_CHILD_COMMAND_KIND);
    out.parent = parent.clone();
    out.child = child.clone();
    out.from_index = get_node_child_index(parent, child);
    out.to_index = to_index;
}

/// Builds a property command from already-captured entries (TS `initializeSetNodePropertyCommand`).
/// The caller supplies `entries` because capturing `before` needs the pending property carrier.
// flight-lint: allow(conform-params) D23 B: label, merge window and time removed; assigned after initialize
pub fn initialize_set_node_property_command(
    out: &mut SetNodePropertyCommand,
    entries: &[CommandPropertyEntry],
    kind: &str,
) {
    out.fields.kind = String::from(kind);
    out.entries = entries.to_vec();
    out.merge_window = 0.0;
    out.time = 0.0;
}
