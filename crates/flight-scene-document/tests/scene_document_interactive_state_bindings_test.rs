// flight-lint: allow-file(f64) D1: document numbers are JS Numbers
use std::collections::HashSet;
use std::sync::Arc;

use flight_registry::with_kind_map_entry;
use flight_scene_document::contract::*;

use crate::support::*;

fn create_binding(node: &flight_node::NodeRef) -> FlightDocumentInteractiveStateBinding {
    return FlightDocumentInteractiveStateBinding {
        interactive_states: FlightDocumentInteractiveStates {
            disabled: None,
            hover: Some(FlightDocumentInteractiveState {
                alpha: Some(0.8),
                ..Default::default()
            }),
            pressed: None,
        },
        node: node.clone(),
        transition: None,
    };
}

fn outline_schema(
    field_schemas: Vec<FlightDocumentFieldSchema>,
    supported: bool,
) -> FlightDocumentInteractiveStateExtensionSchema {
    return FlightDocumentInteractiveStateExtensionSchema {
        create_extension: Arc::new(|_, _| None),
        fields: field_schemas,
        is_supported: Arc::new(move |_| supported),
        kind: "acme.Outline".to_string(),
    };
}

mod assert_all_interactive_state_bindings_used {
    use super::*;

    #[test]
    fn rejects_a_lookup_containing_a_foreign_scene_node() {
        let node = display_object(None);
        let lookup = create_interactive_state_binding_lookup(&[create_binding(&node)]);

        let unused = std::panic::catch_unwind(|| {
            assert_all_interactive_state_bindings_used(&lookup, &HashSet::new());
        });
        assert!(unused.is_err_and(|payload| {
            return payload
                .downcast_ref::<flight_entity::FlightError>()
                .is_some_and(|error| error.kind == flight_entity::FlightErrorKind::RangeError);
        }));
        let mut used = HashSet::new();
        read_interactive_state_binding_metadata(&node, &lookup, &mut used, &empty_schemas());
        assert_all_interactive_state_bindings_used(&lookup, &used);
    }
}

mod create_interactive_state_binding_lookup {
    use super::*;

    #[test]
    fn indexes_by_exact_node_identity_and_rejects_duplicates() {
        let node = display_object(None);
        let binding = create_binding(&node);
        let lookup = create_interactive_state_binding_lookup(std::slice::from_ref(&binding));

        let mut used = HashSet::new();
        let metadata =
            read_interactive_state_binding_metadata(&node, &lookup, &mut used, &empty_schemas());
        assert_eq!(lookup.len(), 1);
        assert!(
            lookup
                .values()
                .all(|indexed| same_node(&indexed.node, &node))
        );
        assert_eq!(
            metadata
                .interactive_states
                .and_then(|states| states.hover)
                .and_then(|hover| hover.alpha),
            Some(0.8)
        );
        let duplicate = std::panic::catch_unwind(|| {
            create_interactive_state_binding_lookup(&[binding.clone(), binding.clone()]);
        });
        assert!(duplicate.is_err_and(|payload| {
            return payload
                .downcast_ref::<flight_entity::FlightError>()
                .is_some_and(|error| error.kind == flight_entity::FlightErrorKind::RangeError);
        }));
    }
}

mod is_interactive_state_binding_target_supported {
    use super::*;

    #[test]
    fn delegates_target_support_to_every_referenced_registered_extension() {
        let node = display_object(None);
        let mut document_node = document_node("DisplayObject", fields(vec![]), vec![]);
        document_node.interactive_states = Some(FlightDocumentInteractiveStates {
            disabled: None,
            hover: Some(FlightDocumentInteractiveState {
                extensions: vec![FlightDocumentInteractiveStateExtensionDescriptor {
                    fields: fields(vec![]),
                    kind: "acme.Outline".to_string(),
                }],
                ..Default::default()
            }),
            pressed: None,
        });
        let mut schemas = empty_schemas();
        schemas.interactive_state_extension_schemas = with_kind_map_entry(
            &schemas.interactive_state_extension_schemas,
            "acme.Outline".to_string(),
            outline_schema(vec![], false),
        );

        assert!(!is_interactive_state_binding_target_supported(
            &node,
            &document_node,
            &schemas
        ));
    }
}

mod read_interactive_state_binding_metadata {
    use super::*;

    #[test]
    fn clones_descriptors_and_elides_registered_default_fields() {
        let node = display_object(None);
        let mut binding = create_binding(&node);
        binding
            .interactive_states
            .hover
            .as_mut()
            .unwrap()
            .extensions
            .push(FlightDocumentInteractiveStateExtensionDescriptor {
                fields: fields(vec![("width", number(1.0))]),
                kind: "acme.Outline".to_string(),
            });
        binding.transition = Some(FlightDocumentInteractiveStateTransitionDescriptor {
            fields: fields(vec![("duration", number(100.0))]),
            kind: "acme.Transition".to_string(),
        });
        let mut schemas = empty_schemas();
        schemas.interactive_state_extension_schemas = with_kind_map_entry(
            &schemas.interactive_state_extension_schemas,
            "acme.Outline".to_string(),
            outline_schema(
                vec![FlightDocumentFieldSchema {
                    default_value: Some(number(1.0)),
                    name: "width".to_string(),
                    required: false,
                    validate: accept_all(),
                }],
                true,
            ),
        );
        schemas.interactive_state_transition_schemas = with_kind_map_entry(
            &schemas.interactive_state_transition_schemas,
            "acme.Transition".to_string(),
            FlightDocumentInteractiveStateTransitionSchema {
                create_transition: Arc::new(|_| None),
                fields: vec![FlightDocumentFieldSchema {
                    default_value: Some(number(100.0)),
                    name: "duration".to_string(),
                    required: false,
                    validate: accept_all(),
                }],
                kind: "acme.Transition".to_string(),
            },
        );
        let mut used = HashSet::new();
        let metadata = read_interactive_state_binding_metadata(
            &node,
            &create_interactive_state_binding_lookup(std::slice::from_ref(&binding)),
            &mut used,
            &schemas,
        );

        let states = metadata.interactive_states.expect("bound states");
        assert!(fields_equal(
            &states.hover.as_ref().unwrap().extensions[0].fields,
            &fields(vec![])
        ));
        assert!(fields_equal(
            &metadata.transition.unwrap().fields,
            &fields(vec![])
        ));
        // The metadata is a copy: the binding keeps its own authored default field.
        assert!(fields_equal(
            &binding
                .interactive_states
                .hover
                .as_ref()
                .unwrap()
                .extensions[0]
                .fields,
            &fields(vec![("width", number(1.0))])
        ));
        let uid = flight_entity::get_entity_uid(node.write().unwrap().node_fields_mut());
        assert!(used.contains(&uid));
    }
}
