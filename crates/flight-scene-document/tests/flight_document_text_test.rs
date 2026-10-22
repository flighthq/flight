// flight-lint: allow-file(f64) D1: document numbers are JS Numbers
use std::sync::{Arc, RwLock};

use flight_camera::contract::{Projection, create_perspective_projection};
use flight_entity::{allocate_entity, get_record_value};
use flight_geometry::create_transform3d;
use flight_lighting::contract::create_ambient_light;
use flight_scene_document::contract::*;
use flight_scene3d::{Scene3DDocumentCamera, Scene3DDocumentLight};

use crate::support::*;

fn node(
    kind: &str,
    node_fields: FlightDocumentFields,
    children: Vec<FlightDocumentNode>,
) -> FlightDocumentNode {
    return FlightDocumentNode {
        children,
        fields: node_fields,
        interactive_states: None,
        kind: kind.to_string(),
        transition: None,
    };
}

fn scene2d(scene: FlightDocumentNode) -> FlightDocumentScene2D {
    let mut out: FlightDocumentScene2D = allocate_entity();
    out.scene = scene;
    return out;
}

fn document(scenes: Vec<FlightDocumentScene>) -> FlightDocument {
    return FlightDocument {
        default_scene: 0,
        resources: Vec::new(),
        scenes,
        version: 1.0,
    };
}

fn explain(text: &str) -> FlightDocumentRefusalExplanation {
    return explain_flight_document_text(text).expect("expected a refusal");
}

fn scene2d_of(document: &FlightDocument, index: usize) -> &FlightDocumentScene2D {
    let FlightDocumentScene::Scene2D(scene) = &document.scenes[index] else {
        panic!("expected a Scene2D entry");
    };
    return scene;
}

fn states_equal(
    left: &FlightDocumentInteractiveStates,
    right: &FlightDocumentInteractiveStates,
) -> bool {
    let phase_equal = |left: &Option<FlightDocumentInteractiveState>,
                       right: &Option<FlightDocumentInteractiveState>| {
        return match (left, right) {
            (None, None) => true,
            (Some(left), Some(right)) => {
                left.alpha == right.alpha
                    && left.scale_x == right.scale_x
                    && left.scale_y == right.scale_y
                    && left.visible == right.visible
                    && left.x == right.x
                    && left.y == right.y
                    && left.extensions.len() == right.extensions.len()
                    && left
                        .extensions
                        .iter()
                        .zip(&right.extensions)
                        .all(|(left, right)| {
                            return left.kind == right.kind
                                && fields_equal(&left.fields, &right.fields);
                        })
            }
            _ => false,
        };
    };
    return phase_equal(&left.disabled, &right.disabled)
        && phase_equal(&left.hover, &right.hover)
        && phase_equal(&left.pressed, &right.pressed);
}

fn nodes_equal(left: &FlightDocumentNode, right: &FlightDocumentNode) -> bool {
    let states = match (&left.interactive_states, &right.interactive_states) {
        (None, None) => true,
        (Some(left), Some(right)) => states_equal(left, right),
        _ => false,
    };
    let transition = match (&left.transition, &right.transition) {
        (None, None) => true,
        (Some(left), Some(right)) => {
            left.kind == right.kind && fields_equal(&left.fields, &right.fields)
        }
        _ => false,
    };
    return left.kind == right.kind
        && fields_equal(&left.fields, &right.fields)
        && states
        && transition
        && left.children.len() == right.children.len()
        && left
            .children
            .iter()
            .zip(&right.children)
            .all(|(left, right)| nodes_equal(left, right));
}

fn layouts_equal(
    left: &[FlightDocumentLayoutDescriptor],
    right: &[FlightDocumentLayoutDescriptor],
) -> bool {
    let style_equal = |left: &Option<FlightDocumentFields>,
                       right: &Option<FlightDocumentFields>| {
        return match (left, right) {
            (None, None) => true,
            (Some(left), Some(right)) => fields_equal(left, right),
            _ => false,
        };
    };
    return left.len() == right.len()
        && left.iter().zip(right).all(|(left, right)| {
            return left.targets == right.targets
                && left.tree.nodes.len() == right.tree.nodes.len()
                && left
                    .tree
                    .nodes
                    .iter()
                    .zip(&right.tree.nodes)
                    .all(|(left, right)| {
                        return left.kind == right.kind
                            && left.parent_index == right.parent_index
                            && style_equal(&left.container_style, &right.container_style)
                            && style_equal(&left.item_style, &right.item_style);
                    });
        });
}

fn tokens_equal(left: &[FlightDocumentToken], right: &[FlightDocumentToken]) -> bool {
    return left.len() == right.len()
        && left.iter().zip(right).all(|(left, right)| {
            return left.key == right.key
                && left.kind == right.kind
                && fields_equal(&left.values, &right.values);
        });
}

// The source's `toEqual` over two all-2D documents.
fn documents_equal(left: &FlightDocument, right: &FlightDocument) -> bool {
    return left.default_scene == right.default_scene
        && left.version == right.version
        && left.resources.len() == right.resources.len()
        && left
            .resources
            .iter()
            .zip(&right.resources)
            .all(|(left, right)| {
                return left.key == right.key
                    && left.kind == right.kind
                    && fields_equal(&left.fields, &right.fields);
            })
        && left.scenes.len() == right.scenes.len()
        && (0..left.scenes.len()).all(|index| {
            let (left, right) = (scene2d_of(left, index), scene2d_of(right, index));
            return left.background_color == right.background_color
                && nodes_equal(&left.scene, &right.scene)
                && layouts_equal(&left.layouts, &right.layouts)
                && tokens_equal(&left.tokens, &right.tokens);
        });
}

const SINGLE_2D: &str = "flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n";

mod create_flight_document_refusal_explanation {
    use super::*;

    #[test]
    fn allocates_an_empty_entity_explanation_through_its_initializer() {
        let mut out = create_flight_document_refusal_explanation();

        assert!(!flight_entity::get_entity_uid(&mut out).is_empty());
        assert!(out.actual.is_none() && out.column.is_none() && out.kind.is_none());
        assert!(out.limit.is_none() && out.line.is_none() && out.mode.is_none());
        assert!(out.offset.is_none() && out.resource_key.is_none() && out.token_key.is_none());
        assert!(out.version.is_none());
        assert_eq!(out.path, "");
        assert_eq!(out.reason, FlightDocumentRefusalReason::StructureInvalid);
    }
}

mod explain_flight_document_text {
    use super::*;

    #[test]
    fn names_an_empty_scenes_collection_independently() {
        let explanation = explain("flight: 1\ndefaultScene: 0\nscenes:\n");
        assert_eq!(explanation.path, "scenes");
        assert_eq!(explanation.reason, FlightDocumentRefusalReason::ScenesEmpty);
    }

    #[test]
    fn names_an_out_of_range_default_scene_without_clamping_it() {
        let explanation = explain(
            &[
                "flight: 1",
                "defaultScene: 1",
                "scenes:",
                "  - kind: Scene2D",
                "    scene:",
                "      kind: DisplayObject",
            ]
            .join("\n"),
        );
        assert_eq!(explanation.actual, Some(1));
        assert_eq!(explanation.limit, Some(0));
        assert_eq!(explanation.path, "defaultScene");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::DefaultSceneOutOfRange
        );
    }

    #[test]
    fn qualifies_a_structural_refusal_with_the_nonzero_scene_index() {
        let explanation = explain(
            &[
                "flight: 1",
                "defaultScene: 0",
                "scenes:",
                "  - kind: Scene2D",
                "    scene:",
                "      kind: DisplayObject",
                "  - kind: Scene3D",
                "    scene:",
                "      children:",
                "        - kind: Node3D",
            ]
            .join("\n"),
        );
        assert_eq!(explanation.path, "scenes[1].scene.kind");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
    }

    #[test]
    fn names_an_invalid_token_key_against_the_scene_that_declares_it() {
        let explanation = explain(&format!(
            "{SINGLE_2D}    tokens:\n      - kind: Color\n        key: \"has space\"\n        default: 1\n"
        ));
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenKeyInvalid
        );
        assert_eq!(explanation.path, "scenes[0].tokens[0].key");
    }

    #[test]
    fn qualifies_a_token_refusal_with_the_scene_that_declares_it_not_the_token_index_alone() {
        let explanation = explain(&format!(
            "{SINGLE_2D}  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n    tokens:\n      - kind: Color\n        key: \"9lives\"\n        default: 1\n"
        ));
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenKeyInvalid
        );
        assert_eq!(explanation.path, "scenes[1].tokens[0].key");
    }

    #[test]
    fn names_a_duplicate_token_key_rather_than_keeping_the_last_row() {
        let explanation = explain(&format!(
            "{SINGLE_2D}    tokens:\n      - kind: Color\n        key: color.primary\n        default: 1\n      - kind: Color\n        key: color.primary\n        default: 2\n"
        ));
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenKeyDuplicate
        );
        assert_eq!(explanation.token_key.as_deref(), Some("color.primary"));
        assert_eq!(explanation.path, "scenes[0].tokens[1].key");
    }

    #[test]
    fn refuses_a_mode_named_after_a_structural_key_it_would_collide_with() {
        let explanation = explain(&format!(
            "{SINGLE_2D}    tokens:\n      - kind: Color\n        key: color.primary\n        \"mode name\": 1\n"
        ));
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::TokenModeInvalid
        );
        assert_eq!(explanation.path, "scenes[0].tokens[0].mode name");
    }

    #[test]
    fn preserves_a_typed_yaml_subset_refusal_with_source_position() {
        let explanation = explain("flight: 1\nanchor: &root value\n");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::AnchorUnsupported
        );
        assert_eq!(explanation.line, Some(2));
        assert!(explanation.column.is_some_and(|column| column > 0));
    }
}

mod format_flight_document_text {
    use super::*;

    #[test]
    fn orders_nested_mapping_keys_by_utf16_code_unit() {
        // Principal d1eaec43: code-unit order is canonical (the source's localeCompare is a
        // host-collation determinism defect). Upper case sorts before lower case, and a non-ASCII
        // key after both.
        let style = FlightDocumentValue::Fields(fields(vec![
            ("b", text("lower")),
            ("é", text("accented")),
            ("B", text("upper")),
            ("a", text("first")),
        ]));
        let source = document(vec![FlightDocumentScene::Scene2D(scene2d(node(
            "DisplayObject",
            fields(vec![("style", style)]),
            vec![],
        )))]);

        let text = format_flight_document_text(&source);

        assert!(
            text.contains(
                "      style:\n        B: upper\n        a: first\n        b: lower\n        \"é\": accented\n"
            ),
            "{text}"
        );
    }

    #[test]
    fn emits_only_the_accepted_yaml_subset_and_round_trips_a_mixed_scene_container() {
        let mut camera_transform = create_transform3d();
        camera_transform.position.z = 8.0;
        let mut light_transform = create_transform3d();
        light_transform.position.y = 4.0;
        let mut sprite_scene = scene2d(node(
            "DisplayObject",
            fields(vec![]),
            vec![node(
                "Sprite",
                fields(vec![
                    (
                        "metadata",
                        FlightDocumentValue::Fields(fields(vec![(
                            "enabled",
                            FlightDocumentValue::Boolean(true),
                        )])),
                    ),
                    (
                        "tags",
                        FlightDocumentValue::Array(vec![text("hud"), text("shared")]),
                    ),
                    ("texture", text("shared")),
                ]),
                vec![],
            )],
        ));
        sprite_scene.background_color = Some(f64::from(0x112233ffu32));
        let mut scene3d: FlightDocumentScene3D = allocate_entity();
        let projection = create_perspective_projection();
        {
            let mut projection = projection.write().unwrap();
            projection.aspect = 16.0 / 9.0;
            projection.fov_y = 1.0;
        }
        scene3d.cameras = vec![Scene3DDocumentCamera {
            far: 1000.0,
            name: Some("main camera".to_string()),
            near: 0.1,
            node: None,
            projection: Projection::Perspective(projection),
            transform: camera_transform,
        }];
        let mut ambient = create_ambient_light();
        ambient.intensity = 0.4;
        scene3d.lights = vec![Scene3DDocumentLight {
            descriptor: Arc::new(RwLock::new(ambient)),
            name: None,
            node: None,
            transform: light_transform,
        }];
        scene3d.scene = node("Node3D", fields(vec![]), vec![]);
        let source = FlightDocument {
            default_scene: 1,
            resources: vec![FlightDocumentResourceDescriptor {
                fields: fields(vec![("source", text("shared image.png"))]),
                key: "shared".to_string(),
                kind: "Texture".to_string(),
            }],
            scenes: vec![
                FlightDocumentScene::Scene2D(sprite_scene),
                FlightDocumentScene::Scene3D(scene3d),
            ],
            version: 1.0,
        };

        let formatted = format_flight_document_text(&source);
        assert!(matches!(
            parse_scene_document_yaml_subset(&formatted),
            SceneDocumentYamlSubsetResult::Ok(_)
        ));
        assert!(!formatted.contains('['));
        assert!(!formatted.contains('&'));

        let reparsed =
            parse_flight_document_text(&formatted).expect("the formatted text reads back");
        assert_eq!(reparsed.default_scene, 1);
        assert_eq!(reparsed.resources.len(), 1);
        assert_eq!(reparsed.resources[0].key, "shared");
        assert_eq!(reparsed.resources[0].kind, "Texture");
        assert!(fields_equal(
            &reparsed.resources[0].fields,
            &source.resources[0].fields
        ));
        assert!(matches!(
            reparsed.scenes[0],
            FlightDocumentScene::Scene2D(_)
        ));
        let FlightDocumentScene::Scene2D(original_2d) = &source.scenes[0] else {
            unreachable!()
        };
        assert!(fields_equal(
            &scene2d_of(&reparsed, 0).scene.children[0].fields,
            &original_2d.scene.children[0].fields
        ));
        let FlightDocumentScene::Scene3D(reparsed_3d) = &reparsed.scenes[1] else {
            panic!("expected Scene3D fixture");
        };
        assert_eq!(reparsed_3d.cameras[0].name.as_deref(), Some("main camera"));
        assert_eq!(reparsed_3d.cameras[0].transform.position.z, 8.0);
        let descriptor = reparsed_3d.lights[0].descriptor.read().unwrap();
        assert_eq!(descriptor.kind(), "AmbientLight");
        let any: &dyn std::any::Any = &*descriptor;
        let descriptor = any
            .downcast_ref::<FlightDocumentLightDescriptor>()
            .expect("an open-kind descriptor");
        assert!(matches!(
            get_record_value(&descriptor.fields, "intensity"),
            Some(FlightDocumentValue::Number(intensity)) if *intensity == 0.4
        ));
    }

    #[test]
    fn round_trips_normalized_interactive_states_and_kind_tagged_descriptors_using_the_node_name_field()
     {
        let mut scene_node = node(
            "DisplayObject",
            fields(vec![("name", text("submit-button"))]),
            vec![],
        );
        scene_node.interactive_states = Some(FlightDocumentInteractiveStates {
            disabled: Some(FlightDocumentInteractiveState {
                alpha: Some(0.4),
                ..defaults()
            }),
            hover: Some(FlightDocumentInteractiveState {
                alpha: Some(0.8),
                extensions: vec![FlightDocumentInteractiveStateExtensionDescriptor {
                    fields: fields(vec![
                        ("color", number(1722486783.0)),
                        ("width", number(2.0)),
                    ]),
                    kind: "acme.Outline".to_string(),
                }],
                ..defaults()
            }),
            pressed: Some(FlightDocumentInteractiveState {
                scale_x: Some(0.95),
                scale_y: Some(0.95),
                ..defaults()
            }),
        });
        scene_node.transition = Some(FlightDocumentInteractiveStateTransitionDescriptor {
            fields: fields(vec![
                ("duration", number(150.0)),
                ("easing", text("easeOut")),
            ]),
            kind: "acme.Tween".to_string(),
        });
        let source = document(vec![FlightDocumentScene::Scene2D(scene2d(scene_node))]);

        let formatted = format_flight_document_text(&source);

        assert!(formatted.contains("name: submit-button"));
        assert!(!formatted.contains("id:"));
        assert!(formatted.contains("interactiveStates:"));
        assert!(formatted.contains("kind: acme.Outline"));
        assert!(formatted.contains("kind: acme.Tween"));
        assert!(documents_equal(
            &parse_flight_document_text(&formatted).unwrap(),
            &source
        ));
    }

    #[test]
    fn round_trips_a_token_section_through_text_and_back() {
        let source = format!(
            "{SINGLE_2D}    tokens:\n      - kind: Color\n        key: color.card\n        default: \"$color.background\"\n      - kind: Color\n        key: color.background\n        dark: 439812095\n        light: 4294967295\n"
        );
        let document =
            parse_flight_document_text(&source).expect("expected the token fixture to parse");
        assert_eq!(format_flight_document_text(&document), source);
        assert!(documents_equal(
            &parse_flight_document_text(&format_flight_document_text(&document)).unwrap(),
            &document
        ));
    }

    #[test]
    fn round_trips_scene_local_layouts_with_unknown_custom_kinds_and_document_safe_styles() {
        let source = concat!(
            "flight: 1\ndefaultScene: 0\nscenes:\n",
            "  - kind: Scene2D\n",
            "    scene:\n      kind: DisplayObject\n      name: panel\n      children:\n",
            "        - kind: DisplayObject\n          name: header\n",
            "    layouts:\n",
            "      - targets:\n          - panel\n          - header\n",
            "        tree:\n          nodes:\n",
            "            - kind: acme.Flow\n              parentIndex: -1\n",
            "              containerStyle:\n                gap: 8\n                policy:\n                  dense: true\n",
            "            - kind: AnchorLayout\n              parentIndex: 0\n",
            "              itemStyle:\n                grow: 1\n",
        );

        let document = parse_flight_document_text(source).expect("the layout fixture reads");
        let expected = vec![FlightDocumentLayoutDescriptor {
            targets: vec!["panel".to_string(), "header".to_string()],
            tree: Arc::new(FlightDocumentLayoutTree {
                nodes: vec![
                    FlightDocumentLayoutNode {
                        container_style: Some(fields(vec![
                            ("gap", number(8.0)),
                            (
                                "policy",
                                FlightDocumentValue::Fields(fields(vec![(
                                    "dense",
                                    FlightDocumentValue::Boolean(true),
                                )])),
                            ),
                        ])),
                        item_style: None,
                        kind: "acme.Flow".to_string(),
                        parent_index: -1,
                    },
                    FlightDocumentLayoutNode {
                        container_style: None,
                        item_style: Some(fields(vec![("grow", number(1.0))])),
                        kind: "AnchorLayout".to_string(),
                        parent_index: 0,
                    },
                ],
            }),
        }];
        assert!(layouts_equal(&scene2d_of(&document, 0).layouts, &expected));
        assert_eq!(format_flight_document_text(&document), source);
        assert!(documents_equal(
            &parse_flight_document_text(&format_flight_document_text(&document)).unwrap(),
            &document
        ));
    }
}

mod initialize_flight_document_refusal_explanation {
    use super::*;

    #[test]
    fn resets_every_field_of_a_reused_explanation() {
        let mut out = create_flight_document_refusal_explanation();
        let uid = flight_entity::get_entity_uid(&mut out);
        out.actual = Some(5);
        out.column = Some(3);
        out.kind = Some("acme.Kind".to_string());
        out.limit = Some(4);
        out.line = Some(2);
        out.mode = Some("dark".to_string());
        out.offset = Some(9);
        out.path = "scenes[0]".to_string();
        out.reason = FlightDocumentRefusalReason::TokenUnresolved;
        out.resource_key = Some("resource".to_string());
        out.token_key = Some("token".to_string());
        out.version = Some(2.0);

        initialize_flight_document_refusal_explanation(&mut out);

        assert!(out.actual.is_none() && out.column.is_none() && out.kind.is_none());
        assert!(out.limit.is_none() && out.line.is_none() && out.mode.is_none());
        assert!(out.offset.is_none() && out.resource_key.is_none() && out.token_key.is_none());
        assert!(out.version.is_none());
        assert_eq!(out.path, "");
        assert_eq!(out.reason, FlightDocumentRefusalReason::StructureInvalid);
        assert_eq!(flight_entity::get_entity_uid(&mut out), uid);
    }
}

mod parse_flight_document_text {
    use super::*;

    #[test]
    fn parses_mixed_dimensions_over_one_shared_resource_table() {
        let document = parse_flight_document_text(
            &[
                "flight: 1",
                "defaultScene: 1",
                "resources:",
                "  - kind: Texture",
                "    key: shared",
                "    source: shared.png",
                "scenes:",
                "  - kind: Scene2D",
                "    backgroundColor: 287454207",
                "    scene:",
                "      kind: DisplayObject",
                "      children:",
                "        - kind: Sprite",
                "          texture: shared",
                "  - kind: Scene3D",
                "    scene:",
                "      kind: Node3D",
                "      children:",
                "        - kind: Mesh",
                "          texture: shared",
            ]
            .join("\n"),
        )
        .expect("the mixed fixture reads");

        assert_eq!(document.default_scene, 1);
        assert_eq!(document.resources.len(), 1);
        assert_eq!(
            (
                document.resources[0].key.as_str(),
                document.resources[0].kind.as_str()
            ),
            ("shared", "Texture")
        );
        assert!(fields_equal(
            &document.resources[0].fields,
            &fields(vec![("source", text("shared.png"))])
        ));
        assert!(matches!(
            document.scenes[0],
            FlightDocumentScene::Scene2D(_)
        ));
        assert!(matches!(
            document.scenes[1],
            FlightDocumentScene::Scene3D(_)
        ));
        let shared = |scene: &FlightDocumentNode| {
            return matches!(get_record_value(&scene.children[0].fields, "texture"), Some(FlightDocumentValue::String(value)) if value == "shared");
        };
        assert!(shared(&scene2d_of(&document, 0).scene));
        let FlightDocumentScene::Scene3D(scene3d) = &document.scenes[1] else {
            unreachable!()
        };
        assert!(shared(&scene3d.scene));
    }

    #[test]
    fn reads_kind_tagged_token_rows_on_the_scene_entry_that_declares_them() {
        let document = parse_flight_document_text(&format!(
            "{SINGLE_2D}    tokens:\n      - kind: Color\n        key: color.background\n        light: 4294967295\n        dark: 439812095\n      - kind: Number\n        key: space.gutter\n        default: 8\n"
        ))
        .unwrap();
        let expected = vec![
            FlightDocumentToken {
                key: "color.background".to_string(),
                kind: "Color".to_string(),
                values: fields(vec![
                    ("dark", number(439812095.0)),
                    ("light", number(4294967295.0)),
                ]),
            },
            FlightDocumentToken {
                key: "space.gutter".to_string(),
                kind: "Number".to_string(),
                values: fields(vec![("default", number(8.0))]),
            },
        ];
        assert!(tokens_equal(&scene2d_of(&document, 0).tokens, &expected));
    }

    #[test]
    fn leaves_tokens_empty_when_a_scene_entry_declares_no_section() {
        let document = parse_flight_document_text(SINGLE_2D).unwrap();
        assert!(scene2d_of(&document, 0).tokens.is_empty());
        assert!(scene2d_of(&document, 0).layouts.is_empty());
    }

    #[test]
    fn refuses_malformed_layout_structure() {
        let cases = [
            (
                "empty descriptor",
                "    layouts:\n      - targets:\n        tree:\n          nodes:\n",
                "scenes[0].layouts[0].targets",
            ),
            (
                "target/node count mismatch",
                "    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n            - kind: AnchorLayout\n              parentIndex: 0\n",
                "scenes[0].layouts[0].targets",
            ),
            (
                "duplicate target",
                "    layouts:\n      - targets:\n          - root\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n            - kind: AnchorLayout\n              parentIndex: 0\n",
                "scenes[0].layouts[0].targets[1]",
            ),
            (
                "forward parent",
                "    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: 0\n",
                "scenes[0].layouts[0].tree.nodes[0].parentIndex",
            ),
            (
                "fractional parent",
                "    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -0.5\n",
                "scenes[0].layouts[0].tree.nodes[0].parentIndex",
            ),
            (
                "empty target name",
                "    layouts:\n      - targets:\n          - \"\"\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n",
                "scenes[0].layouts[0].targets[0]",
            ),
            (
                "scalar style",
                "    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n              containerStyle: row\n",
                "scenes[0].layouts[0].tree.nodes[0].containerStyle",
            ),
            (
                "unknown node key",
                "    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n              resolver: hidden\n",
                "scenes[0].layouts[0].tree.nodes[0]",
            ),
        ];
        for (label, layout_text, path) in cases {
            let explanation = explain(&format!("{SINGLE_2D}{layout_text}"));
            assert_eq!(explanation.path, path, "{label}");
            assert_eq!(
                explanation.reason,
                FlightDocumentRefusalReason::StructureInvalid,
                "{label}"
            );
        }
    }

    #[test]
    fn returns_null_whenever_the_explain_seam_reports_a_structural_refusal() {
        let text = [
            "flight: 1",
            "defaultScene: 2",
            "scenes:",
            "  - kind: Scene2D",
            "    scene:",
            "      kind: DisplayObject",
        ]
        .join("\n");
        assert!(parse_flight_document_text(&text).is_none());
        assert_eq!(
            explain(&text).reason,
            FlightDocumentRefusalReason::DefaultSceneOutOfRange
        );
    }

    #[test]
    fn refuses_an_orphan_transition_without_interactive_states() {
        let text = [
            "flight: 1",
            "defaultScene: 0",
            "scenes:",
            "  - kind: Scene2D",
            "    scene:",
            "      kind: DisplayObject",
            "      transition:",
            "        kind: acme.Tween",
        ]
        .join("\n");
        let explanation = explain(&text);
        assert_eq!(explanation.path, "scenes[0].scene.transition");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
    }

    #[test]
    fn refuses_duplicate_extension_kinds_within_one_phase() {
        let text = [
            "flight: 1",
            "defaultScene: 0",
            "scenes:",
            "  - kind: Scene2D",
            "    scene:",
            "      kind: DisplayObject",
            "      interactiveStates:",
            "        hover:",
            "          extensions:",
            "            - kind: acme.Outline",
            "              width: 1",
            "            - kind: acme.Outline",
            "              width: 2",
        ]
        .join("\n");
        let explanation = explain(&text);
        assert_eq!(explanation.kind.as_deref(), Some("acme.Outline"));
        assert_eq!(
            explanation.path,
            "scenes[0].scene.interactiveStates.hover.extensions[1]"
        );
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::InteractiveStateExtensionKindDuplicate
        );
    }

    #[test]
    fn refuses_2d_transform_properties_on_a_3d_interactive_state() {
        let text = [
            "flight: 1",
            "defaultScene: 0",
            "scenes:",
            "  - kind: Scene3D",
            "    scene:",
            "      kind: Node3D",
            "      interactiveStates:",
            "        pressed:",
            "          x: 4",
        ]
        .join("\n");
        let explanation = explain(&text);
        assert_eq!(
            explanation.path,
            "scenes[0].scene.interactiveStates.pressed.x"
        );
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
    }
}
