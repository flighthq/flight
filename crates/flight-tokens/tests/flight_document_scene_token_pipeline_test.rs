// flight-lint: allow-file(f64) D1: document numbers are JavaScript Numbers
use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::get_record_value;
use flight_node::{NodeRef, get_node_children};
use flight_registry::{KindMap, with_kind_map_entry};
use flight_scene_document::contract::*;
use flight_scene2d::{
    DISPLAY_OBJECT_KIND, SPRITE_KIND, as_node2d_ref, create_display_object, create_sprite,
};
use flight_tokens::contract::*;

// The one flow no single package can cover: authored text, through resolution and substitution,
// into a materialized scene. Each stage's own behavior is unit-tested where it lives.

const AUTHORED: &str = concat!(
    "flight: 1\ndefaultScene: 0\nscenes:\n",
    "  - kind: Scene2D\n",
    "    scene:\n      kind: DisplayObject\n      children:\n",
    "        - kind: Sprite\n          alpha: \"$opacity.panel\"\n          x: \"$space.inset\"\n",
    "    tokens:\n",
    "      - kind: Number\n        key: opacity.panel\n        dark: 0.25\n        light: 1\n",
    "      - kind: Number\n        key: space.inset\n        default: 40\n",
);

fn empty_kind_map<T>() -> KindMap<T> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

fn parse_authored_document() -> FlightDocument {
    return parse_flight_document_text(AUTHORED)
        .expect("expected the authored token fixture to parse");
}

fn substitute_scene(document: &FlightDocument, mode: &str) -> FlightDocumentScene {
    let scene = &document.scenes[0];
    assert!(
        matches!(scene, FlightDocumentScene::Scene2D(_)),
        "expected a 2D fixture entry"
    );
    let registry = create_flight_document_token_resolver_registry();
    let resolution = resolve_flight_document_scene_tokens(scene, mode, Some(&registry))
        .expect("expected the fixture token table to resolve");
    return substitute_flight_document_scene_tokens(scene, &resolution)
        .expect("expected every authored reference to substitute");
}

// Deliberately assigns only when the field is already a number: a reference that failed to
// substitute arrives as a string, and this fixture must leave the default in place rather than
// coerce it, so a broken substitution shows up as a failed assertion.
fn apply_fields(target: &NodeRef, node_fields: &FlightDocumentFields) {
    let node = as_node2d_ref(target).expect("a 2D node");
    let mut node = node.write().unwrap();
    if let Some(FlightDocumentValue::Number(alpha)) = get_record_value(node_fields, "alpha") {
        node.node2d_fields_mut().alpha = *alpha as f32;
    }
    if let Some(FlightDocumentValue::Number(x)) = get_record_value(node_fields, "x") {
        node.node2d_fields_mut().x = *x as f32;
    }
}

fn schema(
    kind: &str,
    create: fn() -> NodeRef,
    field_schemas: Vec<FlightDocumentFieldSchema>,
) -> FlightDocumentNodeSchema {
    return FlightDocumentNodeSchema {
        create_node: Arc::new(move |node_fields, _resources| {
            let node = create();
            apply_fields(&node, node_fields);
            return Some(node);
        }),
        fields: field_schemas,
        kind: kind.to_string(),
        write_node_fields: Arc::new(|_out, _source, _resources| true),
    };
}

fn number_field(name: &str, default_value: f64) -> FlightDocumentFieldSchema {
    return FlightDocumentFieldSchema {
        default_value: Some(FlightDocumentValue::Number(default_value)),
        name: name.to_string(),
        required: false,
        validate: Arc::new(|value| matches!(value, FlightDocumentValue::Number(_))),
    };
}

fn create_test_schemas() -> FlightDocumentSchemaRegistry {
    let mut node_schemas = empty_kind_map();
    node_schemas = with_kind_map_entry(
        &node_schemas,
        DISPLAY_OBJECT_KIND.to_string(),
        schema(DISPLAY_OBJECT_KIND, || create_display_object(), vec![]),
    );
    node_schemas = with_kind_map_entry(
        &node_schemas,
        SPRITE_KIND.to_string(),
        schema(
            SPRITE_KIND,
            || create_sprite(),
            vec![number_field("alpha", 1.0), number_field("x", 0.0)],
        ),
    );
    return FlightDocumentSchemaRegistry {
        interactive_state_extension_schemas: empty_kind_map(),
        interactive_state_transition_schemas: empty_kind_map(),
        node_schemas,
        resource_schemas: empty_kind_map(),
        shape_command_schemas: empty_kind_map(),
    };
}

// Materializes the document with its one scene replaced (the source's `{ ...document, scenes: [s] }`)
// and reads the first child of the root.
fn materialized_child_alpha_and_x(
    document: &FlightDocument,
    substituted: FlightDocumentScene,
) -> (f32, f32) {
    let document = FlightDocument {
        default_scene: document.default_scene,
        resources: document.resources.clone(),
        scenes: vec![substituted],
        version: document.version,
    };
    let materialization = create_flight_document_scene2d_materialization(
        &document,
        &create_test_schemas(),
        None,
        None,
    )
    .expect("a materialized scene");
    let root: NodeRef = materialization.scene.read().unwrap().root.clone();
    let mut children = Vec::new();
    get_node_children(&mut children, &root);
    let child = as_node2d_ref(&children[0]).expect("a 2D child");
    let child = child.read().unwrap();
    return (child.node2d_fields().alpha, child.node2d_fields().x);
}

mod flight_document_scene_token_pipeline {
    use super::*;

    #[test]
    fn carries_an_authored_reference_through_to_the_materialized_node_for_the_requested_mode() {
        let document = parse_authored_document();
        let substituted = substitute_scene(&document, "dark");
        // 0.25 and 40 are the dark variants written in the fixture text, restated here rather than
        // read back out of the document: sourcing them from the parsed tokens would pass for any mapping.
        assert_eq!(
            materialized_child_alpha_and_x(&document, substituted),
            (0.25, 40.0)
        );
    }

    #[test]
    fn produces_the_other_mode_values_from_the_same_authored_document() {
        let document = parse_authored_document();
        let substituted = substitute_scene(&document, "light");
        assert_eq!(
            materialized_child_alpha_and_x(&document, substituted),
            (1.0, 40.0)
        );
    }

    #[test]
    fn refuses_the_whole_flow_when_a_referenced_token_is_not_declared() {
        let document = parse_flight_document_text(
            "flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n      children:\n        - kind: Sprite\n          alpha: \"$opacity.absent\"\n",
        )
        .expect("expected the fixture to parse");
        let scene = &document.scenes[0];
        let registry = create_flight_document_token_resolver_registry();
        let resolution = resolve_flight_document_scene_tokens(scene, "dark", Some(&registry))
            .expect("expected an empty token table to resolve");
        assert!(substitute_flight_document_scene_tokens(scene, &resolution).is_none());
    }
}
