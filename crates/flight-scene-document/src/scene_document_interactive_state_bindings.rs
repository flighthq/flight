//! Inert interactive-state bindings between live nodes and their authored phases (TS
//! `sceneDocumentInteractiveStateBindings.ts`). The source's object-identity maps and sets key by
//! the live node's entity uid (D15 object-keyed caches).

// flight-lint: allow-file(contract-vocabulary) D15 object-identity maps keyed by the live node's entity uid; D16 native NodeRef handles

use std::collections::{HashMap, HashSet};

use flight_entity::{delete_record_value, get_entity_uid, get_record_value, throw_range_error};
use flight_node::NodeRef;

use crate::types::*;

/// The interactive metadata a writer reads back for one live node (TS
/// `FlightDocumentInteractiveStateMetadata`).
#[derive(Clone, Debug, Default)]
pub struct FlightDocumentInteractiveStateMetadata {
    pub interactive_states: Option<FlightDocumentInteractiveStates>,
    pub transition: Option<FlightDocumentInteractiveStateTransitionDescriptor>,
}

/// The bindings by live node identity (TS `ReadonlyMap<NodeAny, FlightDocumentInteractiveStateBinding>`).
pub type FlightDocumentInteractiveStateBindingLookup =
    HashMap<String, FlightDocumentInteractiveStateBinding>;

/// Indexes `bindings` by exact live node identity, throwing `RangeError` on a duplicate node (TS
/// `createInteractiveStateBindingLookup`).
pub fn create_interactive_state_binding_lookup(
    bindings: &[FlightDocumentInteractiveStateBinding],
) -> FlightDocumentInteractiveStateBindingLookup {
    let mut out = FlightDocumentInteractiveStateBindingLookup::new();
    for binding in bindings {
        let key = get_node_identity(&binding.node);
        if out.contains_key(&key) {
            throw_range_error("Duplicate FlightDocument interactive-state node binding");
        }
        out.insert(key, binding.clone());
    }
    return out;
}

/// Throws `RangeError` when a binding names a node outside the written scene (TS
/// `assertAllInteractiveStateBindingsUsed`).
pub fn assert_all_interactive_state_bindings_used(
    bindings: &FlightDocumentInteractiveStateBindingLookup,
    used_bindings: &HashSet<String>,
) {
    if bindings.len() != used_bindings.len() {
        throw_range_error(
            "FlightDocument interactive-state binding references a node outside the written scene",
        );
    }
}

// Removes each field whose value is strictly equal (`===`) to its schema default.
pub(crate) fn elide_default_fields(
    fields: &mut FlightDocumentFields,
    field_schemas: &[FlightDocumentFieldSchema],
) {
    for field_schema in field_schemas {
        let Some(default_value) = &field_schema.default_value else {
            continue;
        };
        if get_record_value(fields, &field_schema.name)
            .is_some_and(|value| is_strictly_equal(value, default_value))
        {
            delete_record_value(fields, &field_schema.name);
        }
    }
}

// The live node's identity key: its entity uid.
pub(crate) fn get_node_identity(node: &NodeRef) -> String {
    return get_entity_uid(node.write().unwrap().node_fields_mut());
}

/// Whether every registered extension the document node references supports `node` (TS
/// `isInteractiveStateBindingTargetSupported`); an unregistered extension is unsupported.
pub fn is_interactive_state_binding_target_supported(
    node: &NodeRef,
    document_node: &FlightDocumentNode,
    schemas: &FlightDocumentSchemaRegistry,
) -> bool {
    let Some(states) = &document_node.interactive_states else {
        return true;
    };
    for state in [&states.disabled, &states.hover, &states.pressed]
        .into_iter()
        .flatten()
    {
        for extension in &state.extensions {
            let supported = schemas
                .interactive_state_extension_schemas
                .entries
                .get(&extension.kind)
                .is_some_and(|schema| (schema.is_supported)(node));
            if !supported {
                return false;
            }
        }
    }
    return true;
}

// JavaScript `===` over document values: scalars compare by value (NaN is never equal), and two
// distinct arrays or mappings are never the same object.
pub(crate) fn is_strictly_equal(left: &FlightDocumentValue, right: &FlightDocumentValue) -> bool {
    return match (left, right) {
        (FlightDocumentValue::Null, FlightDocumentValue::Null) => true,
        (FlightDocumentValue::Boolean(left), FlightDocumentValue::Boolean(right)) => left == right,
        (FlightDocumentValue::Number(left), FlightDocumentValue::Number(right)) => left == right,
        (FlightDocumentValue::String(left), FlightDocumentValue::String(right)) => left == right,
        _ => false,
    };
}

/// Reads the binding of `node` as cloned document metadata with registered default fields elided,
/// recording `node` as used (TS `readInteractiveStateBindingMetadata`).
pub fn read_interactive_state_binding_metadata(
    node: &NodeRef,
    bindings: &FlightDocumentInteractiveStateBindingLookup,
    used_bindings: &mut HashSet<String>,
    schemas: &FlightDocumentSchemaRegistry,
) -> FlightDocumentInteractiveStateMetadata {
    let key = get_node_identity(node);
    let Some(binding) = bindings.get(&key) else {
        return FlightDocumentInteractiveStateMetadata::default();
    };
    used_bindings.insert(key);
    let mut interactive_states = binding.interactive_states.clone();
    for state in [
        &mut interactive_states.disabled,
        &mut interactive_states.hover,
        &mut interactive_states.pressed,
    ]
    .into_iter()
    .flatten()
    {
        for extension in &mut state.extensions {
            if let Some(schema) = schemas
                .interactive_state_extension_schemas
                .entries
                .get(&extension.kind)
            {
                elide_default_fields(&mut extension.fields, &schema.fields);
            }
        }
    }
    let mut transition = binding.transition.clone();
    if let Some(transition) = &mut transition
        && let Some(schema) = schemas
            .interactive_state_transition_schemas
            .entries
            .get(&transition.kind)
    {
        elide_default_fields(&mut transition.fields, &schema.fields);
    }
    return FlightDocumentInteractiveStateMetadata {
        interactive_states: Some(interactive_states),
        transition,
    };
}
