//! Logical document validation and the refusal constructors (TS `sceneDocumentRefusal.ts`): field
//! schemas, interactive states and registered node kinds, each refusal qualified by its scene.

// flight-lint: allow-file(contract-vocabulary) i64 scene indices project JS safe integers (|n| <= 2^53)

use std::collections::HashSet;

use flight_entity::{allocate_entity, entries, get_record_value};

use crate::scene_document_yaml_subset::SceneDocumentYamlSubsetValue;
use crate::types::*;

/// Allocates a refusal at a document path (TS `createDocumentRefusal`).
pub fn create_document_refusal(
    reason: FlightDocumentRefusalReason,
    path: &str,
) -> FlightDocumentRefusalExplanation {
    let mut out: FlightDocumentRefusalExplanation = allocate_entity_refusal();
    initialize_document_refusal(&mut out, reason, path);
    return out;
}

fn create_kind_refusal(
    reason: FlightDocumentRefusalReason,
    scene_index: i64,
    inner_path: &str,
    kind: &str,
) -> FlightDocumentRefusalExplanation {
    let mut refusal = create_scene_refusal(reason, scene_index, inner_path);
    refusal.kind = Some(kind.to_string());
    return refusal;
}

/// Allocates a refusal qualified by its scene: `scenes[i]` or `scenes[i].<inner_path>` (TS
/// `createSceneRefusal`).
pub fn create_scene_refusal(
    reason: FlightDocumentRefusalReason,
    scene_index: i64,
    inner_path: &str,
) -> FlightDocumentRefusalExplanation {
    let path = if inner_path.is_empty() {
        format!("scenes[{scene_index}]")
    } else {
        format!("scenes[{scene_index}].{inner_path}")
    };
    return create_document_refusal(reason, &path);
}

/// Writes an otherwise-empty refusal into `out` (TS `initializeDocumentRefusal`).
pub fn initialize_document_refusal(
    out: &mut FlightDocumentRefusalExplanation,
    reason: FlightDocumentRefusalReason,
    path: &str,
) {
    out.actual = None;
    out.column = None;
    out.kind = None;
    out.limit = None;
    out.line = None;
    out.mode = None;
    out.offset = None;
    out.path = path.to_string();
    out.reason = reason;
    out.resource_key = None;
    out.token_key = None;
    out.version = None;
}

// The allocation hook for a refusal whose fields `initialize_*` writes next.
fn allocate_entity_refusal() -> FlightDocumentRefusalExplanation {
    return allocate_entity();
}

fn append_field_path(path: &str, field: &str) -> String {
    return if path.is_empty() {
        field.to_string()
    } else {
        format!("{path}.{field}")
    };
}

/// Validates `fields` against `field_schemas` (TS `checkFlightDocumentFields`): a missing required
/// field without a default, a failing validator, or an unknown field refuses `FieldInvalid`.
pub fn check_flight_document_fields(
    fields: &FlightDocumentFields,
    field_schemas: &[FlightDocumentFieldSchema],
    scene_index: i64,
    fields_path: &str,
) -> Option<FlightDocumentRefusalExplanation> {
    for field_schema in field_schemas {
        let Some(value) = get_record_value(fields, &field_schema.name) else {
            if field_schema.required && field_schema.default_value.is_none() {
                return Some(create_scene_refusal(
                    FlightDocumentRefusalReason::FieldInvalid,
                    scene_index,
                    &append_field_path(fields_path, &field_schema.name),
                ));
            }
            continue;
        };
        if !(field_schema.validate)(value) {
            return Some(create_scene_refusal(
                FlightDocumentRefusalReason::FieldInvalid,
                scene_index,
                &append_field_path(fields_path, &field_schema.name),
            ));
        }
    }

    for (name, _) in entries(fields) {
        if field_schemas
            .iter()
            .any(|field_schema| field_schema.name == name)
        {
            continue;
        }
        return Some(create_scene_refusal(
            FlightDocumentRefusalReason::FieldInvalid,
            scene_index,
            &append_field_path(fields_path, name),
        ));
    }
    return None;
}

/// Validates every node's interactive states and transition against the registered extension and
/// transition kinds (TS `checkFlightDocumentInteractiveStates`), depth-first.
pub fn check_flight_document_interactive_states(
    node: &FlightDocumentNode,
    dimension: FlightDocumentSceneDimension,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: i64,
    node_path: &str,
) -> Option<FlightDocumentRefusalExplanation> {
    match &node.interactive_states {
        None => {
            if node.transition.is_some() {
                return Some(create_scene_refusal(
                    FlightDocumentRefusalReason::StructureInvalid,
                    scene_index,
                    &format!("{node_path}.transition"),
                ));
            }
        }
        Some(states) => {
            let mut phase_count = 0;
            for (phase, state) in get_interactive_state_phases(states) {
                phase_count += 1;
                let refusal = check_interactive_state(
                    node,
                    state,
                    dimension,
                    schemas,
                    scene_index,
                    &format!("{node_path}.interactiveStates.{phase}"),
                );
                if refusal.is_some() {
                    return refusal;
                }
            }
            if phase_count == 0 {
                return Some(create_scene_refusal(
                    FlightDocumentRefusalReason::StructureInvalid,
                    scene_index,
                    &format!("{node_path}.interactiveStates"),
                ));
            }
            if let Some(transition) = &node.transition {
                let Some(transition_schema) = schemas
                    .interactive_state_transition_schemas
                    .entries
                    .get(&transition.kind)
                else {
                    return Some(create_kind_refusal(
                        FlightDocumentRefusalReason::InteractiveStateTransitionKindUnregistered,
                        scene_index,
                        &format!("{node_path}.transition"),
                        &transition.kind,
                    ));
                };
                let transition_refusal = check_flight_document_fields(
                    &transition.fields,
                    &transition_schema.fields,
                    scene_index,
                    &format!("{node_path}.transition"),
                );
                if transition_refusal.is_some() {
                    return transition_refusal;
                }
            }
        }
    }
    for (index, child) in node.children.iter().enumerate() {
        let child_refusal = check_flight_document_interactive_states(
            child,
            dimension,
            schemas,
            scene_index,
            &format!("{node_path}.children[{index}]"),
        );
        if child_refusal.is_some() {
            return child_refusal;
        }
    }
    return None;
}

/// Validates every registered node's fields against its schema (TS
/// `checkFlightDocumentNodeFields`). An unregistered kind ends the walk without a refusal; the
/// unregistered-kind check reports it.
pub fn check_flight_document_node_fields(
    node: &FlightDocumentNode,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: i64,
    node_path: &str,
) -> Option<FlightDocumentRefusalExplanation> {
    let schema = schemas.node_schemas.entries.get(&node.kind)?;
    let field_refusal =
        check_flight_document_fields(&node.fields, &schema.fields, scene_index, node_path);
    if field_refusal.is_some() {
        return field_refusal;
    }
    for (index, child) in node.children.iter().enumerate() {
        let child_path = format!("{node_path}.children[{index}]");
        let child_refusal =
            check_flight_document_node_fields(child, schemas, scene_index, &child_path);
        if child_refusal.is_some() {
            return child_refusal;
        }
    }
    return None;
}

fn check_interactive_state(
    document_node: &FlightDocumentNode,
    state: &FlightDocumentInteractiveState,
    dimension: FlightDocumentSceneDimension,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: i64,
    state_path: &str,
) -> Option<FlightDocumentRefusalExplanation> {
    let mut field_count = 0;
    for (property, value) in get_interactive_state_entries(state) {
        field_count += 1;
        let invalid = match value {
            FlightDocumentInteractiveStateValue::Boolean(_) => property != "visible",
            FlightDocumentInteractiveStateValue::Number(number) => {
                property == "visible" || !number.is_finite()
            }
        };
        if invalid
            || (dimension == FlightDocumentSceneDimension::Scene3D
                && INTERACTIVE_STATE_2D_PROPERTIES.contains(&property))
        {
            return Some(create_scene_refusal(
                FlightDocumentRefusalReason::FieldInvalid,
                scene_index,
                &format!("{state_path}.{property}"),
            ));
        }
    }
    if field_count == 0 && state.extensions.is_empty() {
        return Some(create_scene_refusal(
            FlightDocumentRefusalReason::StructureInvalid,
            scene_index,
            state_path,
        ));
    }

    let mut kinds: HashSet<&str> = HashSet::new();
    for (index, extension) in state.extensions.iter().enumerate() {
        let extension_path = format!("{state_path}.extensions[{index}]");
        if !kinds.insert(extension.kind.as_str()) {
            return Some(create_kind_refusal(
                FlightDocumentRefusalReason::InteractiveStateExtensionKindDuplicate,
                scene_index,
                &extension_path,
                &extension.kind,
            ));
        }
        let Some(schema) = schemas
            .interactive_state_extension_schemas
            .entries
            .get(&extension.kind)
        else {
            return Some(create_kind_refusal(
                FlightDocumentRefusalReason::InteractiveStateExtensionKindUnregistered,
                scene_index,
                &extension_path,
                &extension.kind,
            ));
        };
        let fields_refusal = check_flight_document_fields(
            &extension.fields,
            &schema.fields,
            scene_index,
            &extension_path,
        );
        if fields_refusal.is_some() {
            return fields_refusal;
        }
        let probe = schemas
            .node_schemas
            .entries
            .get(&document_node.kind)
            .and_then(|node_schema| {
                return (node_schema.create_node)(
                    &document_node.fields,
                    &FlightDocumentResourceLookup::default(),
                );
            });
        if let Some(probe) = probe
            && !(schema.is_supported)(&probe)
        {
            return Some(create_kind_refusal(
                FlightDocumentRefusalReason::InteractiveStateTargetUnsupported,
                scene_index,
                &extension_path,
                &extension.kind,
            ));
        }
    }
    return None;
}

/// Refuses the first node whose kind has no registered schema (TS `checkUnregisteredNodeKinds`).
pub fn check_unregistered_node_kinds(
    node: &FlightDocumentNode,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: i64,
    node_path: &str,
) -> Option<FlightDocumentRefusalExplanation> {
    if !schemas.node_schemas.entries.contains_key(&node.kind) {
        let mut refusal = create_scene_refusal(
            FlightDocumentRefusalReason::NodeKindUnregistered,
            scene_index,
            node_path,
        );
        refusal.kind = Some(node.kind.clone());
        return Some(refusal);
    }
    for (index, child) in node.children.iter().enumerate() {
        let child_path = format!("{node_path}.children[{index}]");
        let child_refusal = check_unregistered_node_kinds(child, schemas, scene_index, &child_path);
        if child_refusal.is_some() {
            return child_refusal;
        }
    }
    return None;
}

/// The unregistered-kind check over a raw parsed syntax value (TS
/// `checkUnregisteredNodeKindsFromRaw`): anything that is not a mapping with a string `kind` is
/// ignored, and only array `children` are descended.
pub fn check_unregistered_node_kinds_from_raw(
    value: &SceneDocumentYamlSubsetValue,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: i64,
    node_path: &str,
) -> Option<FlightDocumentRefusalExplanation> {
    let SceneDocumentYamlSubsetValue::Mapping(mapping) = value else {
        return None;
    };
    let Some(SceneDocumentYamlSubsetValue::String(kind)) = get_record_value(mapping, "kind") else {
        return None;
    };
    if !schemas.node_schemas.entries.contains_key(kind) {
        let mut refusal = create_scene_refusal(
            FlightDocumentRefusalReason::NodeKindUnregistered,
            scene_index,
            node_path,
        );
        refusal.kind = Some(kind.clone());
        return Some(refusal);
    }
    if let Some(SceneDocumentYamlSubsetValue::Sequence(children)) =
        get_record_value(mapping, "children")
    {
        for (index, child) in children.iter().enumerate() {
            let child_path = format!("{node_path}.children[{index}]");
            let child_refusal =
                check_unregistered_node_kinds_from_raw(child, schemas, scene_index, &child_path);
            if child_refusal.is_some() {
                return child_refusal;
            }
        }
    }
    return None;
}

// The authored properties of one phase, in the source's property order.
pub(crate) fn get_interactive_state_entries(
    state: &FlightDocumentInteractiveState,
) -> Vec<(&'static str, FlightDocumentInteractiveStateValue)> {
    let mut out = Vec::new();
    let numbers = [
        ("alpha", state.alpha),
        ("scaleX", state.scale_x),
        ("scaleY", state.scale_y),
    ];
    for (property, value) in numbers {
        if let Some(value) = value {
            out.push((property, FlightDocumentInteractiveStateValue::Number(value)));
        }
    }
    if let Some(visible) = state.visible {
        out.push((
            "visible",
            FlightDocumentInteractiveStateValue::Boolean(visible),
        ));
    }
    for (property, value) in [("x", state.x), ("y", state.y)] {
        if let Some(value) = value {
            out.push((property, FlightDocumentInteractiveStateValue::Number(value)));
        }
    }
    return out;
}

// The authored phases, in the source's phase order.
pub(crate) fn get_interactive_state_phases(
    states: &FlightDocumentInteractiveStates,
) -> Vec<(&'static str, &FlightDocumentInteractiveState)> {
    let mut out = Vec::new();
    for (phase, state) in [
        ("disabled", &states.disabled),
        ("hover", &states.hover),
        ("pressed", &states.pressed),
    ] {
        if let Some(state) = state {
            out.push((phase, state));
        }
    }
    return out;
}

const INTERACTIVE_STATE_2D_PROPERTIES: [&str; 4] = ["scaleX", "scaleY", "x", "y"];
