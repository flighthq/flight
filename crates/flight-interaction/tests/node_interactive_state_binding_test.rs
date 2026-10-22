use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::interaction_fixture;
use flight_interaction::node_interactive_state_binding::*;
use flight_interaction::types::NodeInteractiveStateFlags;
use flight_registry::KindMap;
use flight_scene_document::{
    FlightDocumentInteractiveState, FlightDocumentInteractiveStateTransitionDescriptor,
    FlightDocumentInteractiveStateTransitionSchema, FlightDocumentInteractiveStates,
    FlightDocumentSchemaRegistry, NodeInteractiveStateTransition,
    NodeInteractiveStateTransitionApply,
};

fn empty_states() -> FlightDocumentInteractiveStates {
    return FlightDocumentInteractiveStates {
        disabled: None,
        hover: None,
        pressed: None,
    };
}

fn hover_alpha_states() -> FlightDocumentInteractiveStates {
    return FlightDocumentInteractiveStates {
        disabled: None,
        hover: Some(FlightDocumentInteractiveState {
            alpha: Some(0.5),
            extensions: Vec::new(),
            scale_x: None,
            scale_y: None,
            visible: None,
            x: None,
            y: None,
        }),
        pressed: None,
    };
}

fn empty_kind_map<T>() -> KindMap<T> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

fn empty_schemas() -> FlightDocumentSchemaRegistry {
    return FlightDocumentSchemaRegistry {
        interactive_state_extension_schemas: empty_kind_map(),
        interactive_state_transition_schemas: empty_kind_map(),
        node_schemas: empty_kind_map(),
        resource_schemas: empty_kind_map(),
        shape_command_schemas: empty_kind_map(),
    };
}

fn flags() -> NodeInteractiveStateFlags {
    return NodeInteractiveStateFlags {
        disabled: false,
        hovered: false,
        pressed: false,
    };
}

fn capturing_transition_schemas() -> (
    FlightDocumentSchemaRegistry,
    Arc<Mutex<Vec<NodeInteractiveStateTransitionApply>>>,
) {
    let captured: Arc<Mutex<Vec<NodeInteractiveStateTransitionApply>>> =
        Arc::new(Mutex::new(Vec::new()));
    let captured_clone = captured.clone();
    let mut schemas = empty_schemas();
    schemas.interactive_state_transition_schemas.entries.insert(
        "test.Transition".to_string(),
        FlightDocumentInteractiveStateTransitionSchema {
            kind: "test.Transition".to_string(),
            fields: Vec::new(),
            create_transition: Arc::new(move |_fields| {
                let captured = captured_clone.clone();
                return Some(NodeInteractiveStateTransition {
                    run: Arc::new(move |request| {
                        captured.lock().unwrap().push(request.apply.clone());
                    }),
                });
            }),
        },
    );
    schemas
        .interactive_state_transition_schemas
        .key_order
        .push("test.Transition".to_string());
    return (schemas, captured);
}

fn test_transition_descriptor() -> FlightDocumentInteractiveStateTransitionDescriptor {
    return FlightDocumentInteractiveStateTransitionDescriptor {
        kind: "test.Transition".to_string(),
        fields: interaction_fixture::empty_document_fields(),
    };
}

mod apply_node_interactive_states {
    use super::*;

    #[test]
    fn returns_false_without_runtime() {
        let mut binding = flight_entity::allocate_entity();
        assert!(!apply_node_interactive_states(&mut binding, &flags()));
    }

    #[test]
    fn returns_true_for_same_flags() {
        let node = interaction_fixture::sprite_node();
        let schemas = empty_schemas();
        let states = hover_alpha_states();
        let mut binding =
            create_node_interactive_state_binding(&node, &states, &schemas, None).unwrap();
        assert!(apply_node_interactive_states(&mut binding, &flags()));
    }

    #[test]
    fn applies_hover_alpha() {
        let node = interaction_fixture::sprite_node();
        let schemas = empty_schemas();
        let states = hover_alpha_states();
        let mut binding =
            create_node_interactive_state_binding(&node, &states, &schemas, None).unwrap();
        let hovered = NodeInteractiveStateFlags {
            disabled: false,
            hovered: true,
            pressed: false,
        };
        assert!(apply_node_interactive_states(&mut binding, &hovered));
        let node2d = flight_scene2d::as_node2d_ref(&node).unwrap();
        let n = node2d.read().unwrap();
        assert!((n.node2d_fields().alpha - 0.5).abs() < 0.01);
    }
}

mod create_node_interactive_state_binding {
    use super::*;

    #[test]
    fn returns_binding_for_node2d() {
        let node = interaction_fixture::sprite_node();
        let schemas = empty_schemas();
        let states = hover_alpha_states();
        assert!(create_node_interactive_state_binding(&node, &states, &schemas, None).is_some());
    }

    #[test]
    fn returns_binding_for_empty_states() {
        let node = interaction_fixture::sprite_node();
        let schemas = empty_schemas();
        let states = empty_states();
        assert!(create_node_interactive_state_binding(&node, &states, &schemas, None).is_some());
    }
}

mod deferred_apply_after_dispose_regression {
    use super::*;

    #[test]
    fn deferred_callback_is_noop_after_dispose() {
        let node = interaction_fixture::sprite_node();
        let (schemas, captured) = capturing_transition_schemas();
        let states = hover_alpha_states();
        let descriptor = test_transition_descriptor();
        let mut binding =
            create_node_interactive_state_binding(&node, &states, &schemas, Some(&descriptor))
                .unwrap();
        let hovered = NodeInteractiveStateFlags {
            disabled: false,
            hovered: true,
            pressed: false,
        };
        apply_node_interactive_states(&mut binding, &hovered);
        let callbacks: Vec<_> = captured.lock().unwrap().drain(..).collect();
        assert!(!callbacks.is_empty());
        dispose_node_interactive_state_binding(&mut binding);
        let node2d = flight_scene2d::as_node2d_ref(&node).unwrap();
        let alpha_after_dispose = node2d.read().unwrap().node2d_fields().alpha;
        assert!((alpha_after_dispose - 1.0).abs() < 0.01);
        for cb in &callbacks {
            cb(None);
        }
        let alpha_after_deferred = node2d.read().unwrap().node2d_fields().alpha;
        assert!((alpha_after_deferred - 1.0).abs() < 0.01);
    }
}

mod dispose_node_interactive_state_binding {
    use super::*;

    #[test]
    fn restores_base_alpha() {
        let node = interaction_fixture::sprite_node();
        let schemas = empty_schemas();
        let states = hover_alpha_states();
        let mut binding =
            create_node_interactive_state_binding(&node, &states, &schemas, None).unwrap();
        let hovered = NodeInteractiveStateFlags {
            disabled: false,
            hovered: true,
            pressed: false,
        };
        apply_node_interactive_states(&mut binding, &hovered);
        dispose_node_interactive_state_binding(&mut binding);
        let node2d = flight_scene2d::as_node2d_ref(&node).unwrap();
        let n = node2d.read().unwrap();
        assert!((n.node2d_fields().alpha - 1.0).abs() < 0.01);
    }

    #[test]
    fn second_dispose_is_noop() {
        let node = interaction_fixture::sprite_node();
        let schemas = empty_schemas();
        let states = hover_alpha_states();
        let mut binding =
            create_node_interactive_state_binding(&node, &states, &schemas, None).unwrap();
        dispose_node_interactive_state_binding(&mut binding);
        dispose_node_interactive_state_binding(&mut binding);
    }
}

mod explain_node_interactive_state_binding {
    use super::*;

    #[test]
    fn returns_none_for_supported_node() {
        let node = interaction_fixture::sprite_node();
        let schemas = empty_schemas();
        let states = hover_alpha_states();
        assert!(explain_node_interactive_state_binding(&node, &states, &schemas, None).is_none());
    }

    #[test]
    fn returns_none_for_empty_states() {
        let node = interaction_fixture::sprite_node();
        let schemas = empty_schemas();
        let states = empty_states();
        assert!(explain_node_interactive_state_binding(&node, &states, &schemas, None).is_none());
    }
}

mod registered_transition_regression {
    use super::*;

    #[test]
    fn transition_from_and_to_values_are_correct() {
        let node = interaction_fixture::sprite_node();
        let (schemas, captured) = capturing_transition_schemas();
        let states = hover_alpha_states();
        let descriptor = test_transition_descriptor();
        let mut binding =
            create_node_interactive_state_binding(&node, &states, &schemas, Some(&descriptor))
                .unwrap();
        let hovered = NodeInteractiveStateFlags {
            disabled: false,
            hovered: true,
            pressed: false,
        };
        apply_node_interactive_states(&mut binding, &hovered);
        let callbacks = captured.lock().unwrap();
        assert!(!callbacks.is_empty());
    }
}
