// flight-lint: allow-file(f64) D1: document numbers are JS Numbers
use std::sync::Arc;

use flight_registry::with_kind_map_entry;
use flight_scene_document::contract::*;

use crate::support::*;

fn width_schema() -> Vec<FlightDocumentFieldSchema> {
    return vec![FlightDocumentFieldSchema {
        default_value: None,
        name: "width".to_string(),
        required: true,
        validate: Arc::new(|value| matches!(value, FlightDocumentValue::Number(_))),
    }];
}

mod check_flight_document_fields {
    use super::*;

    #[test]
    fn uses_registered_validators_and_rejects_unknown_fields() {
        let schema = width_schema();
        assert!(
            check_flight_document_fields(
                &fields(vec![("width", number(2.0))]),
                &schema,
                0,
                "scene"
            )
            .is_none()
        );
        let invalid = check_flight_document_fields(
            &fields(vec![("width", text("wide"))]),
            &schema,
            0,
            "scene",
        )
        .unwrap();
        assert_eq!(invalid.path, "scenes[0].scene.width");
        assert_eq!(invalid.reason, FlightDocumentRefusalReason::FieldInvalid);
        let extra = check_flight_document_fields(
            &fields(vec![
                ("extra", FlightDocumentValue::Boolean(true)),
                ("width", number(2.0)),
            ]),
            &schema,
            0,
            "scene",
        )
        .unwrap();
        assert_eq!(extra.path, "scenes[0].scene.extra");
        assert_eq!(extra.reason, FlightDocumentRefusalReason::FieldInvalid);
    }
}

mod check_flight_document_interactive_states {
    use super::*;

    #[test]
    fn refuses_an_unregistered_transition_descriptor() {
        let schemas = schemas_with_node_kind("TestKind");
        let mut node = document_node("TestKind", fields(vec![]), vec![]);
        node.interactive_states = Some(FlightDocumentInteractiveStates {
            disabled: None,
            hover: Some(FlightDocumentInteractiveState {
                alpha: Some(0.8),
                ..Default::default()
            }),
            pressed: None,
        });
        node.transition = Some(FlightDocumentInteractiveStateTransitionDescriptor {
            fields: fields(vec![]),
            kind: "acme.Missing".to_string(),
        });

        let refusal = check_flight_document_interactive_states(
            &node,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            0,
            "scene",
        )
        .unwrap();
        assert_eq!(refusal.kind.as_deref(), Some("acme.Missing"));
        assert_eq!(refusal.path, "scenes[0].scene.transition");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::InteractiveStateTransitionKindUnregistered
        );
    }

    #[test]
    fn refuses_a_property_outside_the_six_field_pilot_vocabulary() {
        // D15 non-representable typed call: the source casts `{ extensions: [], rotation: 45 }` into a
        // state and expects FieldInvalid at `scenes[0].scene.interactiveStates.hover.rotation`
        // (sceneDocumentRefusal.test.ts:58-74). A typed FlightDocumentInteractiveState has exactly the
        // six pilot properties, so the extra key cannot reach this check. The raw form of the same
        // authored phase refuses in the text reader, before validation, at the phase path.
        let explanation = explain_flight_document_text(
            "flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: TestKind\n      interactiveStates:\n        hover:\n          rotation: 45\n",
        )
        .unwrap();
        assert_eq!(explanation.path, "scenes[0].scene.interactiveStates.hover");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
    }
}

mod check_flight_document_node_fields {
    use super::*;

    #[test]
    fn walks_registered_nodes_recursively() {
        let mut schemas = schemas_with_node_kind("TestKind");
        schemas.node_schemas = with_kind_map_entry(
            &schemas.node_schemas,
            "TestKind".to_string(),
            node_schema(
                "TestKind",
                vec![FlightDocumentFieldSchema {
                    default_value: None,
                    name: "name".to_string(),
                    required: true,
                    validate: Arc::new(|value| matches!(value, FlightDocumentValue::String(_))),
                }],
            ),
        );
        let node = document_node(
            "TestKind",
            fields(vec![("name", text("root"))]),
            vec![document_node(
                "TestKind",
                fields(vec![("name", number(42.0))]),
                vec![],
            )],
        );

        let refusal = check_flight_document_node_fields(&node, &schemas, 1, "scene").unwrap();
        assert_eq!(refusal.path, "scenes[1].scene.children[0].name");
        assert_eq!(refusal.reason, FlightDocumentRefusalReason::FieldInvalid);
    }
}

mod check_unregistered_node_kinds {
    use super::*;

    #[test]
    fn returns_null_when_all_kinds_are_registered() {
        let schemas = schemas_with_node_kind("TestKind");
        let node = document_node("TestKind", fields(vec![]), vec![]);
        assert!(check_unregistered_node_kinds(&node, &schemas, 0, "scene").is_none());
    }

    #[test]
    fn returns_refusal_naming_the_unregistered_kind() {
        let schemas = schemas_with_node_kind("TestKind");
        let node = document_node("acme.Missing", fields(vec![]), vec![]);
        let refusal = check_unregistered_node_kinds(&node, &schemas, 0, "scene").unwrap();
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::NodeKindUnregistered
        );
        assert_eq!(refusal.kind.as_deref(), Some("acme.Missing"));
        assert_eq!(refusal.path, "scenes[0].scene");
    }

    #[test]
    fn walks_children_and_qualifies_nested_path() {
        let schemas = schemas_with_node_kind("TestKind");
        let node = document_node(
            "TestKind",
            fields(vec![]),
            vec![document_node(
                "TestKind",
                fields(vec![]),
                vec![document_node("acme.Deep", fields(vec![]), vec![])],
            )],
        );
        let refusal = check_unregistered_node_kinds(&node, &schemas, 0, "scene").unwrap();
        assert_eq!(refusal.path, "scenes[0].scene.children[0].children[0]");
        assert_eq!(refusal.kind.as_deref(), Some("acme.Deep"));
    }
}

mod check_unregistered_node_kinds_from_raw {
    use super::*;

    #[test]
    fn returns_null_for_non_object_value() {
        let schemas = schemas_with_node_kind("TestKind");
        assert!(
            check_unregistered_node_kinds_from_raw(
                &SceneDocumentYamlSubsetValue::Null,
                &schemas,
                0,
                "scene"
            )
            .is_none()
        );
        assert!(
            check_unregistered_node_kinds_from_raw(
                &SceneDocumentYamlSubsetValue::Number(42.0),
                &schemas,
                0,
                "scene"
            )
            .is_none()
        );
    }

    #[test]
    fn returns_refusal_for_unregistered_kind_in_raw_object() {
        let schemas = schemas_with_node_kind("TestKind");
        let raw = mapping(vec![
            ("children", SceneDocumentYamlSubsetValue::Sequence(vec![])),
            ("kind", yaml_string("acme.Unknown")),
        ]);
        let refusal = check_unregistered_node_kinds_from_raw(&raw, &schemas, 0, "scene").unwrap();
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::NodeKindUnregistered
        );
        assert_eq!(refusal.kind.as_deref(), Some("acme.Unknown"));
    }

    #[test]
    fn walks_raw_children_recursively() {
        let schemas = schemas_with_node_kind("TestKind");
        let raw = mapping(vec![
            (
                "children",
                SceneDocumentYamlSubsetValue::Sequence(vec![mapping(vec![
                    ("children", SceneDocumentYamlSubsetValue::Sequence(vec![])),
                    ("kind", yaml_string("acme.Nested")),
                ])]),
            ),
            ("kind", yaml_string("TestKind")),
        ]);
        let refusal = check_unregistered_node_kinds_from_raw(&raw, &schemas, 0, "scene").unwrap();
        assert_eq!(refusal.path, "scenes[0].scene.children[0]");
        assert_eq!(refusal.kind.as_deref(), Some("acme.Nested"));
    }
}

mod create_document_refusal {
    use super::*;

    #[test]
    fn produces_a_refusal_with_the_given_path() {
        let refusal =
            create_document_refusal(FlightDocumentRefusalReason::VersionUnsupported, "version");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::VersionUnsupported
        );
        assert_eq!(refusal.path, "version");
    }

    #[test]
    fn nulls_all_optional_fields() {
        let refusal = create_document_refusal(FlightDocumentRefusalReason::StructureInvalid, "");
        assert_eq!(refusal.actual, None);
        assert_eq!(refusal.column, None);
        assert_eq!(refusal.kind, None);
        assert_eq!(refusal.limit, None);
        assert_eq!(refusal.line, None);
        assert_eq!(refusal.offset, None);
        assert_eq!(refusal.resource_key, None);
        assert_eq!(refusal.version, None);
    }
}

mod create_scene_refusal {
    use super::*;

    #[test]
    fn qualifies_path_with_scene_index() {
        let refusal = create_scene_refusal(
            FlightDocumentRefusalReason::DuplicateAmbientLight,
            0,
            "lights",
        );
        assert_eq!(refusal.path, "scenes[0].lights");
    }

    #[test]
    fn qualifies_with_non_zero_scene_index() {
        let refusal = create_scene_refusal(
            FlightDocumentRefusalReason::DuplicateDirectionalLight,
            2,
            "lights",
        );
        assert_eq!(refusal.path, "scenes[2].lights");
    }

    #[test]
    fn omits_trailing_dot_for_empty_inner_path() {
        let refusal = create_scene_refusal(FlightDocumentRefusalReason::StructureInvalid, 1, "");
        assert_eq!(refusal.path, "scenes[1]");
    }

    #[test]
    fn carries_the_reason_through() {
        let refusal =
            create_scene_refusal(FlightDocumentRefusalReason::StructureInvalid, 0, "kind");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
        assert_eq!(refusal.path, "scenes[0].kind");
    }
}

mod initialize_document_refusal {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_document_refusal() {
        let mut out: FlightDocumentRefusalExplanation = flight_entity::allocate_entity();
        out.actual = Some(3);
        out.path = "stale".to_string();
        initialize_document_refusal(&mut out, FlightDocumentRefusalReason::ScenesEmpty, "scenes");
        let created = create_document_refusal(FlightDocumentRefusalReason::ScenesEmpty, "scenes");
        assert_eq!(out, created);
    }
}
