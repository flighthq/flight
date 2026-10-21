// flight-lint: allow-file(f64) D1: token values are JavaScript Numbers
use std::sync::Arc;

use flight_entity::get_record_value;
use flight_scene_document::{
    FlightDocumentLayoutDescriptor, FlightDocumentLayoutNode, FlightDocumentLayoutTree,
    FlightDocumentNode, FlightDocumentRefusalReason, FlightDocumentScene, FlightDocumentScene3D,
    FlightDocumentTokenResolution, FlightDocumentValue,
};
use flight_tokens::contract::*;

use crate::support::*;

fn color(value: u32) -> FlightDocumentValue {
    return number(f64::from(value));
}

fn resolution_of(scene: &FlightDocumentScene, mode: &str) -> FlightDocumentTokenResolution {
    let registry = create_flight_document_token_resolver_registry();
    return resolve_flight_document_scene_tokens(scene, mode, Some(&registry))
        .expect("expected the fixture token table to resolve");
}

fn root_of(scene: &FlightDocumentScene) -> &FlightDocumentNode {
    return match scene {
        FlightDocumentScene::Scene2D(entry) => &entry.scene,
        FlightDocumentScene::Scene3D(entry) => &entry.scene,
    };
}

fn background_token() -> flight_scene_document::FlightDocumentToken {
    return keyed_token(
        "color.background",
        "Color",
        vec![("default", color(0xffffffff))],
    );
}

mod explain_flight_document_scene_token_substitution {
    use super::*;

    #[test]
    fn names_a_reference_no_resolved_token_covers_with_the_field_that_carries_it() {
        let scene = scene_with(
            node(
                "Shape",
                fields(vec![("fill", text("$color.absent"))]),
                vec![],
            ),
            vec![background_token()],
        );
        let explanation = explain_flight_document_scene_token_substitution(
            &scene,
            &resolution_of(&scene, "default"),
        )
        .unwrap();
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenUnresolved
        );
        assert_eq!(explanation.token_key.as_deref(), Some("color.absent"));
        assert_eq!(explanation.path, "scene.fields.fill");
        assert_eq!(explanation.mode.as_deref(), Some("default"));
    }

    #[test]
    fn names_a_malformed_reference_rather_than_passing_the_raw_string_through() {
        let scene = scene_with(
            node("Shape", fields(vec![("fill", text("$9lives"))]), vec![]),
            vec![],
        );
        let explanation = explain_flight_document_scene_token_substitution(
            &scene,
            &resolution_of(&scene, "default"),
        )
        .unwrap();
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenReferenceInvalid
        );
        assert_eq!(explanation.path, "scene.fields.fill");
    }

    #[test]
    fn qualifies_the_path_of_a_reference_nested_in_a_descendant_command_list() {
        let shape_commands = array(vec![object(vec![(
            "beginFill",
            object(vec![("color", text("$color.absent"))]),
        )])]);
        let scene = scene_with(
            node(
                "DisplayObject",
                fields(vec![]),
                vec![
                    node("Sprite", fields(vec![]), vec![]),
                    node("Shape", fields(vec![("commands", shape_commands)]), vec![]),
                ],
            ),
            vec![],
        );
        let explanation = explain_flight_document_scene_token_substitution(
            &scene,
            &resolution_of(&scene, "default"),
        )
        .unwrap();
        assert_eq!(
            explanation.path,
            "scene.children[1].fields.commands[0].beginFill.color"
        );
    }

    #[test]
    fn reports_nothing_when_every_reference_resolves() {
        let scene = scene_with(
            node(
                "Shape",
                fields(vec![("fill", text("$color.background"))]),
                vec![],
            ),
            vec![background_token()],
        );
        assert!(
            explain_flight_document_scene_token_substitution(
                &scene,
                &resolution_of(&scene, "default")
            )
            .is_none()
        );
    }
}

mod substitute_flight_document_scene_tokens {
    use super::*;

    #[test]
    fn replaces_a_reference_nested_inside_a_command_argument_map_inside_an_array() {
        let commands = array(vec![
            object(vec![(
                "beginFill",
                object(vec![
                    ("alpha", number(1.0)),
                    ("color", text("$color.background")),
                ]),
            )]),
            object(vec![(
                "drawRectangle",
                object(vec![
                    ("height", text("$space.gutter")),
                    ("width", number(120.0)),
                ]),
            )]),
        ]);
        let scene = scene_with(
            node(
                "DisplayObject",
                fields(vec![]),
                vec![node("Shape", fields(vec![("commands", commands)]), vec![])],
            ),
            vec![
                keyed_token(
                    "color.background",
                    "Color",
                    vec![("dark", color(0x1a1a1aff)), ("light", color(0xffffffff))],
                ),
                keyed_token("space.gutter", "Number", vec![("default", number(8.0))]),
            ],
        );
        let substituted =
            substitute_flight_document_scene_tokens(&scene, &resolution_of(&scene, "dark"))
                .unwrap();
        // The expected values are literals, not reads back out of the token rows the substitution
        // used: a test that sourced them from scene.tokens would pass for any mapping.
        let expected = array(vec![
            object(vec![(
                "beginFill",
                object(vec![("alpha", number(1.0)), ("color", color(0x1a1a1aff))]),
            )]),
            object(vec![(
                "drawRectangle",
                object(vec![("height", number(8.0)), ("width", number(120.0))]),
            )]),
        ]);
        let child = &root_of(&substituted).children[0];
        assert!(value_equal(
            get_record_value(&child.fields, "commands").unwrap(),
            &expected
        ));
    }

    #[test]
    fn leaves_a_scene_without_references_structurally_equal_to_its_input() {
        let scene = scene_with(
            node("Sprite", fields(vec![("x", number(12.0))]), vec![]),
            vec![],
        );
        let substituted =
            substitute_flight_document_scene_tokens(&scene, &resolution_of(&scene, "default"))
                .unwrap();
        let (FlightDocumentScene::Scene2D(input), FlightDocumentScene::Scene2D(output)) =
            (&scene, &substituted)
        else {
            panic!("expected the 2D dimension to be preserved");
        };
        assert!(node_equal(&output.scene, &input.scene));
        assert_eq!(output.background_color, input.background_color);
        assert!(tokens_equal(&output.tokens, &input.tokens));
        assert_eq!(output.layouts.len(), input.layouts.len());
    }

    #[test]
    fn never_mutates_the_scene_it_was_given() {
        let scene = scene_with(
            node(
                "Shape",
                fields(vec![("fill", text("$color.background"))]),
                vec![],
            ),
            vec![background_token()],
        );
        substitute_flight_document_scene_tokens(&scene, &resolution_of(&scene, "default")).unwrap();
        assert!(value_equal(
            get_record_value(&root_of(&scene).fields, "fill").unwrap(),
            &text("$color.background")
        ));
    }

    #[test]
    fn keeps_the_token_section_so_the_palette_still_round_trips() {
        let scene = scene_with(
            node(
                "Shape",
                fields(vec![("fill", text("$color.background"))]),
                vec![],
            ),
            vec![background_token()],
        );
        let substituted =
            substitute_flight_document_scene_tokens(&scene, &resolution_of(&scene, "default"))
                .unwrap();
        let (FlightDocumentScene::Scene2D(input), FlightDocumentScene::Scene2D(output)) =
            (&scene, &substituted)
        else {
            panic!("expected the 2D dimension to be preserved");
        };
        assert!(tokens_equal(&output.tokens, &input.tokens));
    }

    #[test]
    fn preserves_inert_layout_metadata_while_substituting_node_fields() {
        let mut entry = scene2d_with(
            node(
                "Shape",
                fields(vec![
                    ("fill", text("$color.background")),
                    ("name", text("root")),
                ]),
                vec![],
            ),
            vec![background_token()],
        );
        entry.layouts.push(FlightDocumentLayoutDescriptor {
            targets: vec!["root".to_string()],
            tree: Arc::new(FlightDocumentLayoutTree {
                nodes: vec![FlightDocumentLayoutNode {
                    container_style: Some(fields(vec![("gap", number(8.0))])),
                    item_style: None,
                    kind: "acme.Flow".to_string(),
                    parent_index: -1,
                }],
            }),
        });
        let scene = FlightDocumentScene::Scene2D(entry);
        let substituted =
            substitute_flight_document_scene_tokens(&scene, &resolution_of(&scene, "default"))
                .unwrap();
        let (FlightDocumentScene::Scene2D(input), FlightDocumentScene::Scene2D(output)) =
            (&scene, &substituted)
        else {
            panic!("expected the 2D dimension to be preserved");
        };
        // TS `toBe(scene.layouts)`: Rust owns the Vec per entry, so identity is asserted on what IS
        // shared, each descriptor's layout tree handle.
        assert_eq!(output.layouts.len(), 1);
        assert_eq!(output.layouts[0].targets, input.layouts[0].targets);
        assert!(Arc::ptr_eq(&output.layouts[0].tree, &input.layouts[0].tree));
    }

    #[test]
    fn resolves_an_escaped_dollar_sign_to_a_literal_instead_of_looking_it_up() {
        let scene = scene_with(
            node("TextLabel", fields(vec![("text", text("$$5.00"))]), vec![]),
            vec![],
        );
        let substituted =
            substitute_flight_document_scene_tokens(&scene, &resolution_of(&scene, "default"))
                .unwrap();
        assert!(value_equal(
            get_record_value(&root_of(&substituted).fields, "text").unwrap(),
            &text("$5.00")
        ));
    }

    #[test]
    fn preserves_the_3d_dimension_and_its_camera_and_light_sections() {
        let mut entry: FlightDocumentScene3D = flight_entity::allocate_entity();
        entry.cameras = Vec::new();
        entry.layouts = Vec::new();
        entry.lights = Vec::new();
        entry.scene = node(
            "Node3D",
            fields(vec![("alpha", text("$opacity.dim"))]),
            vec![],
        );
        entry.tokens = vec![keyed_token(
            "opacity.dim",
            "Number",
            vec![("default", number(0.5))],
        )];
        let scene = FlightDocumentScene::Scene3D(entry);
        let resolution = resolution_of(&scene, "dark");
        let substituted = substitute_flight_document_scene_tokens(&scene, &resolution).unwrap();
        let FlightDocumentScene::Scene3D(output) = &substituted else {
            panic!("expected the 3D dimension to be preserved");
        };
        assert!(output.cameras.is_empty());
        assert!(value_equal(
            get_record_value(&output.scene.fields, "alpha").unwrap(),
            &number(0.5)
        ));
    }

    #[test]
    fn accepts_the_scene_union_a_caller_reads_out_of_document_scenes_without_narrowing_it_first() {
        let entries: Vec<FlightDocumentScene> = vec![scene_with(
            node(
                "Shape",
                fields(vec![("fill", text("$color.background"))]),
                vec![],
            ),
            vec![background_token()],
        )];
        let substituted = substitute_flight_document_scene_tokens(
            &entries[0],
            &resolution_of(&entries[0], "default"),
        )
        .unwrap();
        assert!(matches!(substituted, FlightDocumentScene::Scene2D(_)));
    }

    #[test]
    fn returns_null_wherever_the_explain_seam_reports_a_refusal() {
        let scene = scene_with(
            node(
                "Shape",
                fields(vec![("fill", text("$color.absent"))]),
                vec![],
            ),
            vec![],
        );
        assert!(
            substitute_flight_document_scene_tokens(&scene, &resolution_of(&scene, "default"))
                .is_none()
        );
    }
}
