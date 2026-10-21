use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use flight_entity::{
    allocate_entity, attach_entity_binding, entries, get_record_keys, set_record_value, Entity,
};
use flight_node::contract::{invalidate_node_appearance, invalidate_node_local_transform};
use flight_node::NodeRef;
use flight_scene2d::as_node2d_ref;
use flight_scene_document::{
    FlightDocumentFields, FlightDocumentInteractiveState, FlightDocumentInteractiveStates,
    FlightDocumentInteractiveStateTransitionDescriptor, FlightDocumentSchemaRegistry,
    NodeInteractiveStateBinding, NodeInteractiveStateExplanation,
    NodeInteractiveStateExtensionRuntime, NodeInteractiveStateFlags,
    NodeInteractiveStateProperty, NodeInteractiveStateRefusalReason,
    NodeInteractiveStateTransition, NodeInteractiveStateTransitionRequest,
    NodeInteractiveStateTransitionValue,
};

pub const INTERACTIVE_STATE_PROPERTIES: &[NodeInteractiveStateProperty] = &[
    NodeInteractiveStateProperty::Alpha,
    NodeInteractiveStateProperty::ScaleX,
    NodeInteractiveStateProperty::ScaleY,
    NodeInteractiveStateProperty::Visible,
    NodeInteractiveStateProperty::X,
    NodeInteractiveStateProperty::Y,
];

const INTERACTIVE_STATE_PHASES: &[InteractiveStatePhase] = &[
    InteractiveStatePhase::Disabled,
    InteractiveStatePhase::Hover,
    InteractiveStatePhase::Pressed,
];

#[derive(Clone, Copy)]
enum InteractiveStatePhase {
    Disabled,
    Hover,
    Pressed,
}

struct InteractiveExtension {
    base: FlightDocumentFields,
    kind: String,
    runtime: NodeInteractiveStateExtensionRuntime,
}

struct InteractiveStateRuntime {
    base: Vec<(NodeInteractiveStateProperty, NodeInteractiveStateTransitionValue)>,
    disposed: Arc<AtomicBool>,
    extensions: Vec<InteractiveExtension>,
    flags: NodeInteractiveStateFlags,
    node: NodeRef,
    states: FlightDocumentInteractiveStates,
    transition: Option<NodeInteractiveStateTransition>,
}

struct BuildResult {
    explanation: Option<NodeInteractiveStateExplanation>,
    runtime: Option<InteractiveStateRuntime>,
}

// flight-lint: allow(conform-params) D5: binding creation depends on scene-document schema registry and interactive states
pub fn create_node_interactive_state_binding(
    node: &NodeRef,
    interactive_states: &FlightDocumentInteractiveStates,
    schemas: &FlightDocumentSchemaRegistry,
    transition: Option<&FlightDocumentInteractiveStateTransitionDescriptor>,
) -> Option<NodeInteractiveStateBinding> {
    let result = build_interactive_state_runtime(node, interactive_states, schemas, transition);
    let runtime = result.runtime?;
    let mut binding: NodeInteractiveStateBinding = allocate_entity();
    attach_entity_binding(&mut binding, Box::new(runtime));
    return Some(binding);
}

fn apply_core_property(
    runtime: &InteractiveStateRuntime,
    property: NodeInteractiveStateProperty,
    value: NodeInteractiveStateTransitionValue,
) {
    let from = read_node_property(&runtime.node, property);
    let Some(from) = from else { return };
    if same_transition_value(&from, &value) {
        return;
    }

    let node = runtime.node.clone();
    let disposed = runtime.disposed.clone();
    let apply: Arc<dyn Fn(Option<NodeInteractiveStateTransitionValue>) + Send + Sync> =
        Arc::new(move |next: Option<NodeInteractiveStateTransitionValue>| {
            if disposed.load(Ordering::Acquire) {
                return;
            }
            let actual = next.unwrap_or(value);
            if !same_type_transition_value(&actual, &from) {
                return;
            }
            apply_core_property_immediately(&node, property, actual);
        });

    if let Some(ref transition) = runtime.transition {
        let request = NodeInteractiveStateTransitionRequest {
            apply,
            from,
            property: property_to_string(property).to_string(),
            target: runtime.node.clone(),
            value,
        };
        (transition.run)(&request);
    } else {
        apply(None);
    }
}

fn apply_core_property_immediately(
    node: &NodeRef,
    property: NodeInteractiveStateProperty,
    value: NodeInteractiveStateTransitionValue,
) {
    let current = read_node_property(node, property);
    if let Some(ref cur) = current {
        if same_transition_value(cur, &value) {
            return;
        }
    }
    write_node_property(node, property, value);
    if property == NodeInteractiveStateProperty::Alpha
        || property == NodeInteractiveStateProperty::Visible
    {
        invalidate_node_appearance(node);
    } else {
        invalidate_node_local_transform(node);
    }
}

// flight-lint: allow(conform-params) D5: binding is interaction-owned branded entity; flags are caller state
pub fn apply_node_interactive_states(
    binding: &mut NodeInteractiveStateBinding,
    flags: &NodeInteractiveStateFlags,
) -> bool {
    let Some(runtime) = get_runtime_mut(binding) else {
        return false;
    };
    if runtime.disposed.load(Ordering::Acquire) {
        return false;
    }
    if same_flags(&runtime.flags, flags) {
        return true;
    }

    let layers = get_active_layers(&runtime.states, flags);
    for &(property, base_value) in &runtime.base {
        let mut value = base_value;
        for layer in &layers {
            if let Some(next) = get_state_property(layer, property) {
                value = next;
            }
        }
        apply_core_property(runtime, property, value);
    }

    for extension in &runtime.extensions {
        let mut fields = extension.base.clone();
        for layer in &layers {
            if let Some(descriptor) = layer.extensions.iter().find(|d| d.kind == extension.kind) {
                let mut field_entries = Vec::new();
                entries(&mut field_entries, &descriptor.fields);
                for (k, v) in field_entries {
                    set_record_value(&mut fields, k.to_string(), v.clone());
                }
            }
        }
        if !(extension.runtime.apply)(&fields, runtime.transition.as_ref()) {
            return false;
        }
    }

    runtime.flags = *flags;
    return true;
}

fn build_interactive_state_runtime(
    node: &NodeRef,
    interactive_states: &FlightDocumentInteractiveStates,
    schemas: &FlightDocumentSchemaRegistry,
    transition_descriptor: Option<&FlightDocumentInteractiveStateTransitionDescriptor>,
) -> BuildResult {
    let mut base = Vec::new();
    for &property in INTERACTIVE_STATE_PROPERTIES {
        if !has_interactive_state_property(interactive_states, property) {
            continue;
        }
        let value = read_node_property(node, property);
        match value {
            Some(v) => base.push((property, v)),
            None => {
                let kind = {
                    let n = node.read().unwrap();
                    n.node_fields().kind.clone()
                };
                return BuildResult {
                    explanation: Some(NodeInteractiveStateExplanation {
                        kind,
                        property: Some(property),
                        reason: NodeInteractiveStateRefusalReason::PropertyTargetUnsupported,
                    }),
                    runtime: None,
                };
            }
        }
    }

    let mut transition: Option<NodeInteractiveStateTransition> = None;
    if let Some(td) = transition_descriptor {
        let schema = schemas
            .interactive_state_transition_schemas
            .entries
            .get(&td.kind);
        match schema {
            None => {
                return BuildResult {
                    explanation: Some(NodeInteractiveStateExplanation {
                        kind: td.kind.clone(),
                        property: None,
                        reason: NodeInteractiveStateRefusalReason::TransitionKindUnregistered,
                    }),
                    runtime: None,
                };
            }
            Some(schema) => {
                let created = (schema.create_transition)(&td.fields);
                match created {
                    None => {
                        return BuildResult {
                            explanation: Some(NodeInteractiveStateExplanation {
                                kind: td.kind.clone(),
                                property: None,
                                reason: NodeInteractiveStateRefusalReason::TransitionCreationFailed,
                            }),
                            runtime: None,
                        };
                    }
                    Some(t) => transition = Some(t),
                }
            }
        }
    }

    let mut extensions: Vec<InteractiveExtension> = Vec::new();
    let collected = collect_extension_field_names(interactive_states);
    for (kind, field_names) in &collected {
        let schema = schemas
            .interactive_state_extension_schemas
            .entries
            .get(kind);
        match schema {
            None => {
                dispose_extensions(&extensions);
                return BuildResult {
                    explanation: Some(NodeInteractiveStateExplanation {
                        kind: kind.clone(),
                        property: None,
                        reason: NodeInteractiveStateRefusalReason::ExtensionKindUnregistered,
                    }),
                    runtime: None,
                };
            }
            Some(schema) => {
                if !(schema.is_supported)(node) {
                    dispose_extensions(&extensions);
                    return BuildResult {
                        explanation: Some(NodeInteractiveStateExplanation {
                            kind: kind.clone(),
                            property: None,
                            reason: NodeInteractiveStateRefusalReason::ExtensionTargetUnsupported,
                        }),
                        runtime: None,
                    };
                }
                let extension_runtime = (schema.create_extension)(node, field_names);
                match extension_runtime {
                    None => {
                        dispose_extensions(&extensions);
                        return BuildResult {
                            explanation: Some(NodeInteractiveStateExplanation {
                                kind: kind.clone(),
                                property: None,
                                reason: NodeInteractiveStateRefusalReason::ExtensionCreationFailed,
                            }),
                            runtime: None,
                        };
                    }
                    Some(ext_runtime) => {
                        let mut captured: FlightDocumentFields = Default::default();
                        if !(ext_runtime.capture)(&mut captured) {
                            (ext_runtime.dispose)();
                            dispose_extensions(&extensions);
                            return BuildResult {
                                explanation: Some(NodeInteractiveStateExplanation {
                                    kind: kind.clone(),
                                    property: None,
                                    reason: NodeInteractiveStateRefusalReason::ExtensionCreationFailed,
                                }),
                                runtime: None,
                            };
                        }
                        extensions.push(InteractiveExtension {
                            base: captured,
                            kind: kind.clone(),
                            runtime: ext_runtime,
                        });
                    }
                }
            }
        }
    }

    return BuildResult {
        explanation: None,
        runtime: Some(InteractiveStateRuntime {
            base,
            disposed: Arc::new(AtomicBool::new(false)),
            extensions,
            flags: NodeInteractiveStateFlags {
                disabled: false,
                hovered: false,
                pressed: false,
            },
            node: node.clone(),
            states: interactive_states.clone(),
            transition,
        }),
    };
}

fn collect_extension_field_names(
    states: &FlightDocumentInteractiveStates,
) -> Vec<(String, Vec<String>)> {
    let mut names: Vec<(String, Vec<String>)> = Vec::new();
    for &phase in INTERACTIVE_STATE_PHASES {
        let state = get_phase(states, phase);
        let Some(state) = state else { continue };
        for extension in &state.extensions {
            let entry = names.iter_mut().find(|(k, _)| k == &extension.kind);
            let field_names = match entry {
                Some((_, fns)) => fns,
                None => {
                    names.push((extension.kind.clone(), Vec::new()));
                    &mut names.last_mut().unwrap().1
                }
            };
            let mut keys = Vec::new();
            get_record_keys(&mut keys, &extension.fields);
            for name in keys {
                if !field_names.contains(&name) {
                    field_names.push(name);
                }
            }
        }
    }
    return names;
}

fn dispose_extensions(extensions: &[InteractiveExtension]) {
    for extension in extensions {
        (extension.runtime.dispose)();
    }
}

pub fn dispose_node_interactive_state_binding(binding: &mut NodeInteractiveStateBinding) {
    let Some(runtime) = get_runtime_mut(binding) else {
        return;
    };
    if runtime.disposed.load(Ordering::Acquire) {
        return;
    }
    runtime.disposed.store(true, Ordering::Release);
    for &(property, value) in &runtime.base {
        apply_core_property_immediately(&runtime.node, property, value);
    }
    for extension in &runtime.extensions {
        (extension.runtime.apply)(&extension.base, None);
        (extension.runtime.dispose)();
    }
    runtime.extensions.clear();
}

// flight-lint: allow(conform-params) D5: explanation depends on scene-document schema registry and interactive states
pub fn explain_node_interactive_state_binding(
    node: &NodeRef,
    interactive_states: &FlightDocumentInteractiveStates,
    schemas: &FlightDocumentSchemaRegistry,
    transition: Option<&FlightDocumentInteractiveStateTransitionDescriptor>,
) -> Option<NodeInteractiveStateExplanation> {
    let result = build_interactive_state_runtime(node, interactive_states, schemas, transition);
    if let Some(runtime) = result.runtime {
        for extension in &runtime.extensions {
            (extension.runtime.dispose)();
        }
    }
    return result.explanation;
}

fn get_active_layers<'a>(
    states: &'a FlightDocumentInteractiveStates,
    flags: &NodeInteractiveStateFlags,
) -> Vec<&'a FlightDocumentInteractiveState> {
    if flags.disabled {
        return match &states.disabled {
            Some(s) => vec![s],
            None => vec![],
        };
    }
    let mut out = Vec::new();
    if flags.hovered {
        if let Some(ref s) = states.hover {
            out.push(s);
        }
    }
    if flags.pressed {
        if let Some(ref s) = states.pressed {
            out.push(s);
        }
    }
    return out;
}

fn get_phase<'a>(
    states: &'a FlightDocumentInteractiveStates,
    phase: InteractiveStatePhase,
) -> Option<&'a FlightDocumentInteractiveState> {
    return match phase {
        InteractiveStatePhase::Disabled => states.disabled.as_ref(),
        InteractiveStatePhase::Hover => states.hover.as_ref(),
        InteractiveStatePhase::Pressed => states.pressed.as_ref(),
    };
}

fn get_runtime_mut(binding: &mut NodeInteractiveStateBinding) -> Option<&mut InteractiveStateRuntime> {
    let slot = binding.entity_runtime_mut();
    let runtime = slot.data.as_mut()?;
    return runtime.binding.as_mut()?.downcast_mut::<InteractiveStateRuntime>();
}

fn get_state_property(
    state: &FlightDocumentInteractiveState,
    property: NodeInteractiveStateProperty,
) -> Option<NodeInteractiveStateTransitionValue> {
    return match property {
        NodeInteractiveStateProperty::Alpha => {
            state.alpha.map(NodeInteractiveStateTransitionValue::Number)
        }
        NodeInteractiveStateProperty::ScaleX => {
            state.scale_x.map(NodeInteractiveStateTransitionValue::Number)
        }
        NodeInteractiveStateProperty::ScaleY => {
            state.scale_y.map(NodeInteractiveStateTransitionValue::Number)
        }
        NodeInteractiveStateProperty::Visible => {
            state.visible.map(NodeInteractiveStateTransitionValue::Boolean)
        }
        NodeInteractiveStateProperty::X => {
            state.x.map(NodeInteractiveStateTransitionValue::Number)
        }
        NodeInteractiveStateProperty::Y => {
            state.y.map(NodeInteractiveStateTransitionValue::Number)
        }
    };
}

fn has_interactive_state_property(
    states: &FlightDocumentInteractiveStates,
    property: NodeInteractiveStateProperty,
) -> bool {
    for &phase in INTERACTIVE_STATE_PHASES {
        let state = get_phase(states, phase);
        if let Some(state) = state {
            if get_state_property(state, property).is_some() {
                return true;
            }
        }
    }
    return false;
}

fn property_to_string(property: NodeInteractiveStateProperty) -> &'static str {
    return match property {
        NodeInteractiveStateProperty::Alpha => "alpha",
        NodeInteractiveStateProperty::ScaleX => "scaleX",
        NodeInteractiveStateProperty::ScaleY => "scaleY",
        NodeInteractiveStateProperty::Visible => "visible",
        NodeInteractiveStateProperty::X => "x",
        NodeInteractiveStateProperty::Y => "y",
    };
}

// flight-lint: allow(f64) D1: NodeInteractiveStateTransitionValue uses f64; Node2DFields uses f32; conversion is required
fn read_node_property(
    node: &NodeRef,
    property: NodeInteractiveStateProperty,
) -> Option<NodeInteractiveStateTransitionValue> {
    let node2d = as_node2d_ref(node)?;
    let n = node2d.read().unwrap();
    let fields = n.node2d_fields();
    return Some(match property {
        NodeInteractiveStateProperty::Alpha => {
            NodeInteractiveStateTransitionValue::Number(fields.alpha as f64)
        }
        NodeInteractiveStateProperty::ScaleX => {
            NodeInteractiveStateTransitionValue::Number(fields.scale_x as f64)
        }
        NodeInteractiveStateProperty::ScaleY => {
            NodeInteractiveStateTransitionValue::Number(fields.scale_y as f64)
        }
        NodeInteractiveStateProperty::Visible => {
            NodeInteractiveStateTransitionValue::Boolean(fields.visible)
        }
        NodeInteractiveStateProperty::X => {
            NodeInteractiveStateTransitionValue::Number(fields.x as f64)
        }
        NodeInteractiveStateProperty::Y => {
            NodeInteractiveStateTransitionValue::Number(fields.y as f64)
        }
    });
}

fn same_flags(left: &NodeInteractiveStateFlags, right: &NodeInteractiveStateFlags) -> bool {
    return left.disabled == right.disabled
        && left.hovered == right.hovered
        && left.pressed == right.pressed;
}

fn same_transition_value(
    a: &NodeInteractiveStateTransitionValue,
    b: &NodeInteractiveStateTransitionValue,
) -> bool {
    return match (a, b) {
        (
            NodeInteractiveStateTransitionValue::Boolean(a),
            NodeInteractiveStateTransitionValue::Boolean(b),
        ) => a == b,
        (
            NodeInteractiveStateTransitionValue::Number(a),
            NodeInteractiveStateTransitionValue::Number(b),
        ) => a == b,
        _ => false,
    };
}

fn same_type_transition_value(
    a: &NodeInteractiveStateTransitionValue,
    b: &NodeInteractiveStateTransitionValue,
) -> bool {
    return matches!(
        (a, b),
        (
            NodeInteractiveStateTransitionValue::Boolean(_),
            NodeInteractiveStateTransitionValue::Boolean(_)
        ) | (
            NodeInteractiveStateTransitionValue::Number(_),
            NodeInteractiveStateTransitionValue::Number(_)
        )
    );
}

// flight-lint: allow(f64) D1: NodeInteractiveStateTransitionValue uses f64; Node2DFields uses f32; conversion is required
fn write_node_property(
    node: &NodeRef,
    property: NodeInteractiveStateProperty,
    value: NodeInteractiveStateTransitionValue,
) {
    let Some(node2d) = as_node2d_ref(node) else {
        return;
    };
    let mut n = node2d.write().unwrap();
    let fields = n.node2d_fields_mut();
    match (property, value) {
        (NodeInteractiveStateProperty::Alpha, NodeInteractiveStateTransitionValue::Number(v)) => {
            fields.alpha = v as f32;
        }
        (NodeInteractiveStateProperty::ScaleX, NodeInteractiveStateTransitionValue::Number(v)) => {
            fields.scale_x = v as f32;
        }
        (NodeInteractiveStateProperty::ScaleY, NodeInteractiveStateTransitionValue::Number(v)) => {
            fields.scale_y = v as f32;
        }
        (
            NodeInteractiveStateProperty::Visible,
            NodeInteractiveStateTransitionValue::Boolean(v),
        ) => {
            fields.visible = v;
        }
        (NodeInteractiveStateProperty::X, NodeInteractiveStateTransitionValue::Number(v)) => {
            fields.x = v as f32;
        }
        (NodeInteractiveStateProperty::Y, NodeInteractiveStateTransitionValue::Number(v)) => {
            fields.y = v as f32;
        }
        _ => {}
    }
}
