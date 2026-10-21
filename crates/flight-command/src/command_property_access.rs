//! Explicit-context property access for `SetNodePropertyCommand` (Principal db87e24b).
//!
//! The TS source reads and writes node fields through dynamic `NodeAny[property]`. Native D16 nodes
//! are raw typed structs with no reflection, so the kind owner (or the caller) registers a typed
//! accessor per `(Kind, property)`. The registry is caller-owned explicit state (D5): no global map,
//! no import side effect. Commands keep the original target, property name and canonical `Unknown`
//! values; execution resolves the accessor at call time against the live registry.
//!
//! An absent entry reads as `undefined` (`None`) and writes as a NO-OP. JS ad-hoc field creation on
//! a node is outside the typed D16 model and is reported non-representable rather than emulated with
//! a dynamic field store.

use flight_entity::{Kind, Ref, Unknown};
use flight_node::contract::NodeRef;

use crate::types::*;

/// Allocates an empty property-access registry (Principal db87e24b explicit context).
// flight-lint: allow(conform-extra) Principal db87e24b: explicit-context property-access registry has no TS export (TS reads arbitrary JS properties)
pub fn create_command_property_access() -> CommandPropertyAccessRef {
    return Ref::new(std::sync::RwLock::new(CommandPropertyAccess {
        entries: Vec::new(),
    }));
}

/// The registered accessor for `(kind, property)`, or `None` when nothing is.
// flight-lint: allow(conform-extra) Principal db87e24b: registry lookup, Rust-only explicit-context seam
pub fn get_command_property_access(
    access: &CommandPropertyAccessRef,
    kind: &str,
    property: &str,
) -> Option<CommandPropertyAccessor> {
    let guard = access.read().unwrap();
    return guard
        .entries
        .iter()
        .find(|(entry_kind, entry_property, _)| entry_kind == kind && entry_property == property)
        .map(|(_, _, accessor)| accessor.clone());
}

/// Reads one registered node property; `None` is TS `undefined` (also the absent-entry case).
// flight-lint: allow(conform-extra) Principal db87e24b: replaces the TS dynamic `NodeAny[property]` read
pub fn read_command_property(
    access: &CommandPropertyAccessRef,
    target: &NodeRef,
    property: &str,
) -> Option<Unknown> {
    let kind = target.read().unwrap().node_fields().kind.clone();
    let accessor = get_command_property_access(access, &kind, property)?;
    return (accessor.read)(target);
}

/// Registers a typed accessor for `(kind, property)`; last write wins, keeping the first position
/// (the binding-table replacement semantics).
// flight-lint: allow(conform-extra) Principal db87e24b: explicit kind-owned field registration, no TS export
pub fn register_command_property_access(
    access: &CommandPropertyAccessRef,
    kind: &str,
    property: &str,
    accessor: CommandPropertyAccessor,
) {
    let mut guard = access.write().unwrap();
    let existing = guard
        .entries
        .iter()
        .position(|(entry_kind, entry_property, _)| {
            entry_kind == kind && entry_property == property
        });
    match existing {
        Some(position) => guard.entries[position].2 = accessor,
        None => guard
            .entries
            .push((String::from(kind), String::from(property), accessor)),
    }
}

/// Writes one registered node property through its accessor; an absent entry is a NO-OP (TS writes
/// create ad-hoc fields, which the typed D16 model cannot represent).
// flight-lint: allow(conform-extra) Principal db87e24b: replaces the TS dynamic `NodeAny[property]` write
pub fn write_command_property(
    access: &CommandPropertyAccessRef,
    target: &NodeRef,
    property: &str,
    value: Unknown,
) {
    let kind: Kind = target.read().unwrap().node_fields().kind.clone();
    let Some(accessor) = get_command_property_access(access, &kind, property) else {
        return;
    };
    (accessor.write)(target, value);
}
