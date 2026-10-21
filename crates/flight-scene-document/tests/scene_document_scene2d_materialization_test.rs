// flight-lint: allow-file(f64) D1: document numbers are JS Numbers
use std::sync::{Arc, Mutex};

use flight_entity::{allocate_entity, get_record_keys, get_record_value, set_record_value};
use flight_node::{Node, NodeRef, add_node_child, get_node_children};
use flight_registry::with_kind_map_entry;
use flight_scene_document::contract::*;
use flight_scene2d::{
    DISPLAY_OBJECT_KIND, Node2DRef, PartialNode2D, SPRITE_KIND, Scene2DOptions, as_node2d_ref,
    create_display_object, create_scene2d, create_sprite,
};
use flight_scene3d::{NODE3D_KIND, Node3DFields, create_node3d};

use crate::support::*;

const FIELD_NAMES: [&str; 7] = ["name", "x", "y", "scaleX", "scaleY", "rotation", "alpha"];

fn transform_field_schemas() -> Vec<FlightDocumentFieldSchema> {
    let defaults = [
        None,
        Some(0.0),
        Some(0.0),
        Some(1.0),
        Some(1.0),
        Some(0.0),
        Some(1.0),
    ];
    return FIELD_NAMES
        .iter()
        .zip(defaults)
        .map(|(name, default)| FlightDocumentFieldSchema {
            default_value: default.map(number),
            name: name.to_string(),
            required: false,
            validate: if *name == "name" {
                Arc::new(|value| {
                    matches!(
                        value,
                        FlightDocumentValue::String(_) | FlightDocumentValue::Null
                    )
                })
            } else {
                Arc::new(|value| matches!(value, FlightDocumentValue::Number(_)))
            },
        })
        .collect();
}

fn apply_transform_fields(target: &NodeRef, fields: &FlightDocumentFields) {
    let node = as_node2d_ref(target).expect("a published 2D node");
    let mut node = node.write().unwrap();
    if let Some(FlightDocumentValue::String(name)) = get_record_value(fields, "name") {
        node.node_fields_mut().name = Some(name.clone());
    }
    let number_of = |name: &str| match get_record_value(fields, name) {
        Some(FlightDocumentValue::Number(value)) => Some(*value as f32),
        _ => None,
    };
    let node2d = node.node2d_fields_mut();
    if let Some(x) = number_of("x") {
        node2d.x = x;
    }
    if let Some(y) = number_of("y") {
        node2d.y = y;
    }
    if let Some(scale_x) = number_of("scaleX") {
        node2d.scale_x = scale_x;
    }
    if let Some(scale_y) = number_of("scaleY") {
        node2d.scale_y = scale_y;
    }
    if let Some(rotation) = number_of("rotation") {
        node2d.rotation = rotation;
    }
    if let Some(alpha) = number_of("alpha") {
        node2d.alpha = alpha;
    }
}

fn write_transform_fields(out: &mut FlightDocumentFields, source: &NodeRef) {
    let node = as_node2d_ref(source).expect("a published 2D node");
    let node = node.read().unwrap();
    if let Some(name) = &node.node_fields().name {
        set_record_value(out, "name".to_string(), text(name));
    }
    let node2d = node.node2d_fields();
    let entries = [
        ("x", node2d.x, 0.0),
        ("y", node2d.y, 0.0),
        ("scaleX", node2d.scale_x, 1.0),
        ("scaleY", node2d.scale_y, 1.0),
        ("rotation", node2d.rotation, 0.0),
        ("alpha", node2d.alpha, 1.0),
    ];
    for (name, value, default) in entries {
        if value != default {
            set_record_value(out, name.to_string(), number(f64::from(value)));
        }
    }
}

fn schema_for(kind: &str, create: fn() -> NodeRef) -> FlightDocumentNodeSchema {
    return FlightDocumentNodeSchema {
        create_node: Arc::new(move |fields, _| {
            let node = create();
            apply_transform_fields(&node, fields);
            return Some(node);
        }),
        fields: transform_field_schemas(),
        kind: kind.to_string(),
        write_node_fields: Arc::new(|out, source, _| {
            write_transform_fields(out, source);
            return true;
        }),
    };
}

fn create_test_schemas() -> FlightDocumentSchemaRegistry {
    let mut schemas = empty_schemas();
    schemas.node_schemas = with_kind_map_entry(
        &schemas.node_schemas,
        DISPLAY_OBJECT_KIND.to_string(),
        schema_for(DISPLAY_OBJECT_KIND, || create_display_object(None)),
    );
    schemas.node_schemas = with_kind_map_entry(
        &schemas.node_schemas,
        SPRITE_KIND.to_string(),
        schema_for(SPRITE_KIND, || create_sprite(None)),
    );
    return schemas;
}

fn node3d_schema(
    on_create: Arc<dyn Fn(&FlightDocumentResourceLookup) + Send + Sync>,
) -> FlightDocumentNodeSchema {
    return FlightDocumentNodeSchema {
        create_node: Arc::new(move |_, resources| {
            on_create(resources);
            let node: NodeRef = Arc::new(std::sync::RwLock::new(create_node3d::<Node3DFields>(
                None, None,
            )));
            return Some(node);
        }),
        fields: Vec::new(),
        kind: NODE3D_KIND.to_string(),
        write_node_fields: Arc::new(|_, _, _| true),
    };
}

fn scene2d_entry(scene: FlightDocumentNode) -> FlightDocumentScene {
    let mut out: FlightDocumentScene2D = allocate_entity();
    out.scene = scene;
    return FlightDocumentScene::Scene2D(out);
}

fn scene3d_entry(scene: FlightDocumentNode) -> FlightDocumentScene {
    let mut out: FlightDocumentScene3D = allocate_entity();
    out.scene = scene;
    return FlightDocumentScene::Scene3D(out);
}

fn create_test_document(scene: FlightDocumentScene) -> FlightDocument {
    return FlightDocument {
        default_scene: 0,
        resources: Vec::new(),
        scenes: vec![scene],
        version: 1.0,
    };
}

fn root_document2d(kind: &str, root_fields: FlightDocumentFields) -> FlightDocument {
    return create_test_document(scene2d_entry(document_node(kind, root_fields, vec![])));
}

fn scene2d_mut(document: &mut FlightDocument, index: usize) -> &mut FlightDocumentScene2D {
    let FlightDocumentScene::Scene2D(scene) = &mut document.scenes[index] else {
        panic!("expected a Scene2D entry");
    };
    return scene;
}

fn single_target_layout(target: &str) -> FlightDocumentLayoutDescriptor {
    return FlightDocumentLayoutDescriptor {
        targets: vec![target.to_string()],
        tree: Arc::new(FlightDocumentLayoutTree {
            nodes: vec![FlightDocumentLayoutNode {
                container_style: None,
                item_style: None,
                kind: "acme.Leaf".to_string(),
                parent_index: -1,
            }],
        }),
    };
}

fn root_of(materialization: &FlightDocumentScene2DMaterialization) -> NodeRef {
    return materialization.scene.read().unwrap().root.clone();
}

fn node_x(node: &NodeRef) -> f32 {
    return as_node2d_ref(node)
        .unwrap()
        .read()
        .unwrap()
        .node2d_fields()
        .x;
}

fn kind_of(node: &NodeRef) -> String {
    return node.read().unwrap().node_fields().kind.clone();
}

fn is_range_error<T>(result: std::thread::Result<T>) -> bool {
    return result.is_err_and(|payload| {
        return payload
            .downcast_ref::<flight_entity::FlightError>()
            .is_some_and(|error| error.kind == flight_entity::FlightErrorKind::RangeError);
    });
}

fn hover_alpha(alpha: f64) -> FlightDocumentInteractiveStates {
    return FlightDocumentInteractiveStates {
        disabled: None,
        hover: Some(FlightDocumentInteractiveState {
            alpha: Some(alpha),
            ..defaults()
        }),
        pressed: None,
    };
}

fn wrap(scene: FlightDocumentScene2D) -> FlightDocument {
    return create_test_document(FlightDocumentScene::Scene2D(scene));
}

mod create_flight_document_from_scene2d {
    use super::*;

    fn assert_entity<T: flight_entity::Entity>(_: &T) {}

    #[test]
    fn creates_a_model_from_an_empty_scene2d() {
        let scene = create_scene2d(None);
        let mut document = create_flight_document_from_scene2d(
            &scene.read().unwrap(),
            &create_test_schemas(),
            None,
            None,
        );
        assert_entity(&document);
        assert!(!flight_entity::get_entity_uid(&mut document).is_empty());
        assert!(
            matches!(wrap(document).scenes[0], FlightDocumentScene::Scene2D(ref scene) if scene.scene.children.is_empty())
        );
    }

    #[test]
    fn elides_default_valued_fields() {
        let scene = create_scene2d(None);
        let root: NodeRef = scene.read().unwrap().root.clone();
        add_node_child(&root, &display_object(Some("default")));
        let document = create_flight_document_from_scene2d(
            &scene.read().unwrap(),
            &create_test_schemas(),
            None,
            None,
        );
        let child = &document.scene.children[0];
        for name in ["x", "y", "scaleX", "rotation", "alpha"] {
            assert!(get_record_value(&child.fields, name).is_none(), "{name}");
        }
    }

    #[test]
    fn preserves_transform_fields() {
        let scene = create_scene2d(None);
        let root: NodeRef = scene.read().unwrap().root.clone();
        let obj = create_display_object(Some(&PartialNode2D {
            name: Some("moved".to_string()),
            ..defaults()
        }));
        {
            let mut obj = obj.write().unwrap();
            obj.x = 100.0;
            obj.y = 200.0;
            obj.scale_x = 2.0;
            obj.scale_y = 3.0;
            obj.rotation = 45.0;
            obj.alpha = 0.5;
        }
        let obj: NodeRef = obj;
        add_node_child(&root, &obj);
        let document = create_flight_document_from_scene2d(
            &scene.read().unwrap(),
            &create_test_schemas(),
            None,
            None,
        );
        let child = &document.scene.children[0].fields;
        for (name, expected) in [
            ("x", 100.0),
            ("y", 200.0),
            ("scaleX", 2.0),
            ("scaleY", 3.0),
            ("rotation", 45.0),
            ("alpha", 0.5),
        ] {
            assert!(
                matches!(get_record_value(child, name), Some(FlightDocumentValue::Number(value)) if *value == expected),
                "{name}"
            );
        }
    }

    #[test]
    fn writes_interactive_metadata_only_from_explicit_bindings() {
        let scene = create_scene2d(None);
        let states = hover_alpha(0.75);
        let root: NodeRef = scene.read().unwrap().root.clone();
        let without = create_flight_document_from_scene2d(
            &scene.read().unwrap(),
            &create_test_schemas(),
            None,
            None,
        );
        let with = create_flight_document_from_scene2d(
            &scene.read().unwrap(),
            &create_test_schemas(),
            Some(&[FlightDocumentInteractiveStateBinding {
                interactive_states: states.clone(),
                node: root,
                transition: None,
            }]),
            None,
        );

        assert!(without.scene.interactive_states.is_none());
        let written = with.scene.interactive_states.expect("bound states");
        assert_eq!(written.hover.and_then(|hover| hover.alpha), Some(0.75));
        assert!(written.disabled.is_none() && written.pressed.is_none());
    }

    #[test]
    fn rejects_duplicate_and_foreign_explicit_bindings() {
        let scene = create_scene2d(None);
        let root: NodeRef = scene.read().unwrap().root.clone();
        let binding = FlightDocumentInteractiveStateBinding {
            interactive_states: hover_alpha(0.75),
            node: root,
            transition: None,
        };
        let guard = scene.read().unwrap();

        assert!(is_range_error(std::panic::catch_unwind(
            std::panic::AssertUnwindSafe(|| {
                create_flight_document_from_scene2d(
                    &guard,
                    &create_test_schemas(),
                    Some(&[binding.clone(), binding.clone()]),
                    None,
                );
            })
        )));
        assert!(is_range_error(std::panic::catch_unwind(
            std::panic::AssertUnwindSafe(|| {
                create_flight_document_from_scene2d(
                    &guard,
                    &create_test_schemas(),
                    Some(&[FlightDocumentInteractiveStateBinding {
                        interactive_states: hover_alpha(0.75),
                        node: display_object(None),
                        transition: None,
                    }]),
                    None,
                );
            })
        )));
    }

    #[test]
    fn serializes_children_into_nested_nodes() {
        let scene = create_scene2d(None);
        let root: NodeRef = scene.read().unwrap().root.clone();
        let sprite: NodeRef = create_sprite(None);
        sprite.write().unwrap().node_fields_mut().name = Some("hero".to_string());
        add_node_child(&root, &sprite);
        let document = create_flight_document_from_scene2d(
            &scene.read().unwrap(),
            &create_test_schemas(),
            None,
            None,
        );
        assert_eq!(document.scene.children.len(), 1);
        assert_eq!(document.scene.children[0].kind, SPRITE_KIND);
    }

    #[test]
    fn writes_layouts_only_from_explicit_inert_bindings_and_preserves_unknown_kinds_and_styles() {
        let scene = create_scene2d(None);
        let root: NodeRef = scene.read().unwrap().root.clone();
        root.write().unwrap().node_fields_mut().name = Some("root".to_string());
        let child = display_object(Some("child"));
        add_node_child(&root, &child);
        let tree = Arc::new(FlightDocumentLayoutTree {
            nodes: vec![
                FlightDocumentLayoutNode {
                    container_style: Some(fields(vec![("gap", number(8.0))])),
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
        });

        let guard = scene.read().unwrap();
        assert!(
            create_flight_document_from_scene2d(&guard, &create_test_schemas(), None, None)
                .layouts
                .is_empty()
        );
        let document = create_flight_document_from_scene2d(
            &guard,
            &create_test_schemas(),
            Some(&[]),
            Some(&[FlightDocumentLayoutBinding {
                targets: vec![root.clone(), child.clone()],
                tree: tree.clone(),
            }]),
        );
        assert_eq!(document.layouts.len(), 1);
        assert_eq!(
            document.layouts[0].targets,
            vec!["root".to_string(), "child".to_string()]
        );
        assert_eq!(document.layouts[0].tree.nodes.len(), 2);
        assert_eq!(document.layouts[0].tree.nodes[0].kind, "acme.Flow");
        assert_eq!(document.layouts[0].tree.nodes[1].kind, "AnchorLayout");
        assert!(fields_equal(
            document.layouts[0].tree.nodes[0]
                .container_style
                .as_ref()
                .unwrap(),
            tree.nodes[0].container_style.as_ref().unwrap()
        ));
        assert!(fields_equal(
            document.layouts[0].tree.nodes[1]
                .item_style
                .as_ref()
                .unwrap(),
            tree.nodes[1].item_style.as_ref().unwrap()
        ));
    }

    #[test]
    fn rejects_foreign_unnamed_ambiguous_and_structurally_invalid_explicit_layout_bindings() {
        let scene = create_scene2d(None);
        let root: NodeRef = scene.read().unwrap().root.clone();
        root.write().unwrap().node_fields_mut().name = Some("root".to_string());
        add_node_child(&root, &display_object(Some("root")));
        let tree = Arc::new(FlightDocumentLayoutTree {
            nodes: vec![FlightDocumentLayoutNode {
                container_style: None,
                item_style: None,
                kind: "acme.Leaf".to_string(),
                parent_index: -1,
            }],
        });
        let guard = scene.read().unwrap();
        let attempt = |targets: Vec<NodeRef>| {
            return is_range_error(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
                || {
                    create_flight_document_from_scene2d(
                        &guard,
                        &create_test_schemas(),
                        Some(&[]),
                        Some(&[FlightDocumentLayoutBinding {
                            targets,
                            tree: tree.clone(),
                        }]),
                    );
                },
            )));
        };

        assert!(attempt(vec![display_object(Some("foreign"))]));
        assert!(attempt(vec![display_object(None)]));
        assert!(attempt(vec![root.clone()]));
        assert!(attempt(vec![]));
    }
}

mod create_flight_document_scene2d_materialization {
    use super::*;

    #[test]
    fn materializes_an_empty_scene2d_from_a_minimal_model() {
        let document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        let materialization = create_flight_document_scene2d_materialization(
            &document,
            &create_test_schemas(),
            None,
            None,
        )
        .expect("a materialization");
        assert_eq!(kind_of(&root_of(&materialization)), DISPLAY_OBJECT_KIND);
    }

    #[test]
    fn materializes_a_tree_with_nested_children() {
        let document = create_test_document(scene2d_entry(document_node(
            DISPLAY_OBJECT_KIND,
            fields(vec![]),
            vec![document_node(
                DISPLAY_OBJECT_KIND,
                fields(vec![]),
                vec![document_node(SPRITE_KIND, fields(vec![]), vec![])],
            )],
        )));
        let materialization = create_flight_document_scene2d_materialization(
            &document,
            &create_test_schemas(),
            None,
            None,
        )
        .unwrap();
        let root_children = get_node_children(&root_of(&materialization));
        assert_eq!(root_children.len(), 1);
        assert_eq!(kind_of(&root_children[0]), DISPLAY_OBJECT_KIND);
        let grandchildren = get_node_children(&root_children[0]);
        assert_eq!(grandchildren.len(), 1);
        assert_eq!(kind_of(&grandchildren[0]), SPRITE_KIND);
    }

    #[test]
    fn returns_null_for_a_scene3d_document() {
        let document = create_test_document(scene3d_entry(document_node(
            "Node3D",
            fields(vec![]),
            vec![],
        )));
        assert!(
            create_flight_document_scene2d_materialization(
                &document,
                &create_test_schemas(),
                None,
                None
            )
            .is_none()
        );
    }

    #[test]
    fn returns_null_for_an_unsupported_version() {
        let mut document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        document.version = 99.0;
        assert!(
            create_flight_document_scene2d_materialization(
                &document,
                &create_test_schemas(),
                None,
                None
            )
            .is_none()
        );
    }

    #[test]
    fn returns_inert_index_matched_layout_bindings_without_applying_rectangles() {
        let mut document = create_test_document(scene2d_entry(document_node(
            DISPLAY_OBJECT_KIND,
            fields(vec![("name", text("root")), ("x", number(4.0))]),
            vec![document_node(
                DISPLAY_OBJECT_KIND,
                fields(vec![("name", text("child")), ("x", number(12.0))]),
                vec![],
            )],
        )));
        scene2d_mut(&mut document, 0).layouts = vec![FlightDocumentLayoutDescriptor {
            targets: vec!["root".to_string(), "child".to_string()],
            tree: Arc::new(FlightDocumentLayoutTree {
                nodes: vec![
                    FlightDocumentLayoutNode {
                        container_style: Some(fields(vec![("gap", number(8.0))])),
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

        let materialization = create_flight_document_scene2d_materialization(
            &document,
            &create_test_schemas(),
            None,
            None,
        )
        .unwrap();

        let root = root_of(&materialization);
        assert_eq!(materialization.layout_bindings.len(), 1);
        assert!(same_node(
            &materialization.layout_bindings[0].targets[0],
            &root
        ));
        assert!(same_node(
            &materialization.layout_bindings[0].targets[1],
            &get_node_children(&root)[0]
        ));
        assert!(Arc::ptr_eq(
            &materialization.layout_bindings[0].tree,
            &scene2d_mut(&mut document, 0).layouts[0].tree
        ));
        assert_eq!(node_x(&root), 4.0);
        assert_eq!(node_x(&get_node_children(&root)[0]), 12.0);
    }

    #[test]
    fn projects_the_raw_background_color_through_js_to_uint32() {
        // Principal 68e645eb C3: the raw document number is kept, and the canonical Scene2D color
        // is its JS ToUint32 projection.
        let cases = [
            (f64::from(0x112233ffu32), Some(0x112233ffu32)),
            (-1.0, Some(0xffffffff)),
            (1.9, Some(1)),
            (-1.9, Some(0xffffffff)),
            (4_294_967_296.0, Some(0)),
            (4_294_967_297.5, Some(1)),
            (f64::NAN, Some(0)),
            (f64::INFINITY, Some(0)),
            (f64::NEG_INFINITY, Some(0)),
        ];
        for (raw, expected) in cases {
            let mut document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
            scene2d_mut(&mut document, 0).background_color = Some(raw);
            let materialization = create_flight_document_scene2d_materialization(
                &document,
                &create_test_schemas(),
                None,
                None,
            )
            .unwrap();
            assert_eq!(
                materialization.scene.read().unwrap().color,
                expected,
                "{raw}"
            );
        }
        let document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        let materialization = create_flight_document_scene2d_materialization(
            &document,
            &create_test_schemas(),
            None,
            None,
        )
        .unwrap();
        assert_eq!(materialization.scene.read().unwrap().color, None);
    }
}

mod create_flight_document_scene2d_materialization_from_text {
    use super::*;

    #[test]
    fn materializes_a_scene2d_from_yaml_text() {
        let yaml = [
            "flight: 1",
            "defaultScene: 0",
            "scenes:",
            "  - kind: Scene2D",
            "    scene:",
            "      kind: DisplayObject",
            "      children:",
            "        - kind: Sprite",
            "          name: bg",
        ]
        .join("\n");
        let materialization = create_flight_document_scene2d_materialization_from_text(
            &yaml,
            &create_test_schemas(),
            None,
            None,
        )
        .expect("a materialization");
        let children = get_node_children(&root_of(&materialization));
        assert_eq!(
            children[0].read().unwrap().node_fields().name.as_deref(),
            Some("bg")
        );
    }

    #[test]
    fn returns_null_for_a_scene3d_yaml_document() {
        let yaml = [
            "flight: 1",
            "defaultScene: 0",
            "scenes:",
            "  - kind: Scene3D",
            "    scene:",
            "      kind: Node3D",
        ]
        .join("\n");
        assert!(
            create_flight_document_scene2d_materialization_from_text(
                &yaml,
                &create_test_schemas(),
                None,
                None
            )
            .is_none()
        );
    }

    #[test]
    fn returns_null_for_unsupported_yaml_constructs() {
        let yaml = "flight: 1\nkind: Scene2D\nanchor: &ref value\n";
        assert!(
            create_flight_document_scene2d_materialization_from_text(
                yaml,
                &create_test_schemas(),
                None,
                None
            )
            .is_none()
        );
    }
}

mod explain_flight_document_refusal {
    use super::*;

    fn with_required(schemas: &mut FlightDocumentSchemaRegistry, field_name: &str) {
        let mut schema = schemas
            .node_schemas
            .entries
            .get(DISPLAY_OBJECT_KIND)
            .expect("expected DisplayObject schema")
            .clone();
        for field in &mut schema.fields {
            if field.name == field_name {
                field.required = true;
            }
        }
        schemas.node_schemas = with_kind_map_entry(
            &schemas.node_schemas,
            DISPLAY_OBJECT_KIND.to_string(),
            schema,
        );
    }

    #[test]
    fn allows_an_omitted_required_registered_field_when_its_runtime_default_is_declared() {
        let document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        let mut schemas = create_test_schemas();
        with_required(&mut schemas, "x");
        assert!(
            explain_flight_document_refusal(
                &document,
                FlightDocumentSceneDimension::Scene2D,
                &schemas,
                None
            )
            .is_none()
        );
    }

    #[test]
    fn explains_a_dimension_mismatch() {
        let document = create_test_document(scene3d_entry(document_node(
            "Node3D",
            fields(vec![]),
            vec![],
        )));
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &create_test_schemas(),
            None,
        )
        .unwrap();
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
        assert_eq!(explanation.path, "scenes[0].kind");
    }

    #[test]
    fn explains_an_invalid_registered_field_on_a_nested_node() {
        let document = create_test_document(scene2d_entry(document_node(
            DISPLAY_OBJECT_KIND,
            fields(vec![]),
            vec![document_node(
                SPRITE_KIND,
                fields(vec![("x", text("far"))]),
                vec![],
            )],
        )));
        let schemas = create_test_schemas();
        assert!(
            create_flight_document_scene2d_materialization(&document, &schemas, None, None)
                .is_none()
        );
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            None,
        )
        .unwrap();
        assert_eq!(explanation.path, "scenes[0].scene.children[0].x");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::FieldInvalid
        );
    }

    #[test]
    fn explains_a_missing_required_registered_field() {
        let document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        let mut schemas = create_test_schemas();
        with_required(&mut schemas, "name");
        assert!(
            create_flight_document_scene2d_materialization(&document, &schemas, None, None)
                .is_none()
        );
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            None,
        )
        .unwrap();
        assert_eq!(explanation.path, "scenes[0].scene.name");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::FieldInvalid
        );
    }

    #[test]
    fn explains_an_unknown_field_for_a_registered_node_kind() {
        let document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![("mystery", number(1.0))]));
        let schemas = create_test_schemas();
        assert!(
            create_flight_document_scene2d_materialization(&document, &schemas, None, None)
                .is_none()
        );
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            None,
        )
        .unwrap();
        assert_eq!(explanation.path, "scenes[0].scene.mystery");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::FieldInvalid
        );
    }

    #[test]
    fn explains_an_unsupported_version() {
        let mut document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        document.version = 99.0;
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &create_test_schemas(),
            None,
        )
        .unwrap();
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::VersionUnsupported
        );
        assert_eq!(explanation.version, Some(99.0));
    }

    #[test]
    fn returns_null_when_the_document_is_valid() {
        let document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        assert!(
            explain_flight_document_refusal(
                &document,
                FlightDocumentSceneDimension::Scene2D,
                &create_test_schemas(),
                None
            )
            .is_none()
        );
    }

    #[test]
    fn distinguishes_unresolved_and_ambiguous_layout_target_names_with_scene_qualified_paths() {
        let mut unresolved =
            root_document2d(DISPLAY_OBJECT_KIND, fields(vec![("name", text("root"))]));
        scene2d_mut(&mut unresolved, 0).layouts = vec![single_target_layout("missing")];
        assert!(
            create_flight_document_scene2d_materialization(
                &unresolved,
                &create_test_schemas(),
                None,
                None
            )
            .is_none()
        );
        let explanation = explain_flight_document_refusal(
            &unresolved,
            FlightDocumentSceneDimension::Scene2D,
            &create_test_schemas(),
            None,
        )
        .unwrap();
        assert_eq!(explanation.path, "scenes[0].layouts[0].targets[0]");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::LayoutTargetUnresolved
        );

        let mut ambiguous =
            root_document2d(DISPLAY_OBJECT_KIND, fields(vec![("name", text("same"))]));
        scene2d_mut(&mut ambiguous, 0)
            .scene
            .children
            .push(document_node(
                DISPLAY_OBJECT_KIND,
                fields(vec![("name", text("same"))]),
                vec![],
            ));
        scene2d_mut(&mut ambiguous, 0).layouts = vec![single_target_layout("same")];
        assert!(
            create_flight_document_scene2d_materialization(
                &ambiguous,
                &create_test_schemas(),
                None,
                None
            )
            .is_none()
        );
        let explanation = explain_flight_document_refusal(
            &ambiguous,
            FlightDocumentSceneDimension::Scene2D,
            &create_test_schemas(),
            None,
        )
        .unwrap();
        assert_eq!(explanation.path, "scenes[0].layouts[0].targets[0]");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::LayoutTargetAmbiguous
        );
    }

    #[test]
    fn does_not_resolve_a_layout_target_from_a_different_scene_entry() {
        let mut document =
            root_document2d(DISPLAY_OBJECT_KIND, fields(vec![("name", text("first"))]));
        scene2d_mut(&mut document, 0).layouts = vec![single_target_layout("second")];
        document.scenes.push(scene2d_entry(document_node(
            DISPLAY_OBJECT_KIND,
            fields(vec![("name", text("second"))]),
            vec![],
        )));
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &create_test_schemas(),
            Some(0),
        )
        .unwrap();
        assert_eq!(explanation.path, "scenes[0].layouts[0].targets[0]");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::LayoutTargetUnresolved
        );
    }

    #[test]
    fn model_and_text_explain_agree_on_each_parity_case() {
        let cases = [
            (
                "wrong dimension (scene 0)",
                create_test_document(scene3d_entry(document_node(
                    "Node3D",
                    fields(vec![]),
                    vec![],
                ))),
                FlightDocumentRefusalReason::StructureInvalid,
                "scenes[0].kind",
            ),
            (
                "unregistered node kind (scene 0)",
                create_test_document(scene2d_entry(document_node(
                    DISPLAY_OBJECT_KIND,
                    fields(vec![]),
                    vec![document_node("acme.Unknown", fields(vec![]), vec![])],
                ))),
                FlightDocumentRefusalReason::NodeKindUnregistered,
                "scenes[0].scene.children[0]",
            ),
        ];
        for (label, document, expected_reason, expected_path) in cases {
            let model = explain_flight_document_refusal(
                &document,
                FlightDocumentSceneDimension::Scene2D,
                &create_test_schemas(),
                None,
            )
            .expect(label);
            let text = format_flight_document_text(&document);
            let from_text = explain_flight_document_refusal_from_text(
                &text,
                FlightDocumentSceneDimension::Scene2D,
                &create_test_schemas(),
                None,
            )
            .expect(label);
            assert_eq!(from_text.reason, model.reason, "{label}");
            assert_eq!(from_text.path, model.path, "{label}");
            assert_eq!(model.reason, expected_reason, "{label}");
            assert_eq!(model.path, expected_path, "{label}");
        }
    }

    #[test]
    fn returns_inert_bindings_for_the_exact_root_and_nested_live_nodes() {
        let mut document =
            root_document2d(DISPLAY_OBJECT_KIND, fields(vec![("alpha", number(0.5))]));
        let scene = scene2d_mut(&mut document, 0);
        scene.scene.interactive_states = Some(hover_alpha(0.75));
        let mut nested = document_node(
            DISPLAY_OBJECT_KIND,
            fields(vec![("name", text("nested"))]),
            vec![],
        );
        nested.interactive_states = Some(FlightDocumentInteractiveStates {
            disabled: Some(FlightDocumentInteractiveState {
                alpha: Some(0.25),
                ..defaults()
            }),
            hover: None,
            pressed: None,
        });
        scene.scene.children = vec![nested];

        let materialization = create_flight_document_scene2d_materialization(
            &document,
            &create_test_schemas(),
            None,
            None,
        )
        .unwrap();

        let root = root_of(&materialization);
        let nested = get_node_children(&root)[0].clone();
        assert_eq!(materialization.interactive_state_bindings.len(), 2);
        assert!(same_node(
            &materialization.interactive_state_bindings[0].node,
            &root
        ));
        assert!(same_node(
            &materialization.interactive_state_bindings[1].node,
            &nested
        ));
        assert_eq!(
            as_node2d_ref(&root)
                .unwrap()
                .read()
                .unwrap()
                .node2d_fields()
                .alpha,
            0.5
        );
        assert!(
            root.read()
                .unwrap()
                .node_runtime()
                .interaction_signals
                .is_none()
        );
    }

    #[test]
    fn refuses_an_unregistered_extension_kind_with_its_exact_path() {
        let mut document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        scene2d_mut(&mut document, 0).scene.interactive_states =
            Some(FlightDocumentInteractiveStates {
                disabled: None,
                hover: Some(FlightDocumentInteractiveState {
                    extensions: vec![FlightDocumentInteractiveStateExtensionDescriptor {
                        fields: fields(vec![("width", number(2.0))]),
                        kind: "acme.Outline".to_string(),
                    }],
                    ..defaults()
                }),
                pressed: None,
            });
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &create_test_schemas(),
            None,
        )
        .unwrap();
        assert_eq!(explanation.kind.as_deref(), Some("acme.Outline"));
        assert_eq!(
            explanation.path,
            "scenes[0].scene.interactiveStates.hover.extensions[0]"
        );
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::InteractiveStateExtensionKindUnregistered
        );
    }

    #[test]
    fn validates_registered_extension_fields_through_the_shared_validator() {
        let mut schemas = create_test_schemas();
        schemas.interactive_state_extension_schemas = with_kind_map_entry(
            &schemas.interactive_state_extension_schemas,
            "acme.Outline".to_string(),
            FlightDocumentInteractiveStateExtensionSchema {
                create_extension: Arc::new(|_, _| None),
                fields: vec![FlightDocumentFieldSchema {
                    default_value: None,
                    name: "width".to_string(),
                    required: true,
                    validate: Arc::new(|value| matches!(value, FlightDocumentValue::Number(_))),
                }],
                is_supported: Arc::new(|_| true),
                kind: "acme.Outline".to_string(),
            },
        );
        let mut document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        scene2d_mut(&mut document, 0).scene.interactive_states =
            Some(FlightDocumentInteractiveStates {
                disabled: None,
                hover: Some(FlightDocumentInteractiveState {
                    extensions: vec![FlightDocumentInteractiveStateExtensionDescriptor {
                        fields: fields(vec![("width", text("wide"))]),
                        kind: "acme.Outline".to_string(),
                    }],
                    ..defaults()
                }),
                pressed: None,
            });
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            None,
        )
        .unwrap();
        assert_eq!(
            explanation.path,
            "scenes[0].scene.interactiveStates.hover.extensions[0].width"
        );
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::FieldInvalid
        );
    }

    #[test]
    fn refuses_an_unregistered_transition_kind() {
        let mut document = root_document2d(DISPLAY_OBJECT_KIND, fields(vec![]));
        let scene = scene2d_mut(&mut document, 0);
        scene.scene.interactive_states = Some(hover_alpha(0.8));
        scene.scene.transition = Some(FlightDocumentInteractiveStateTransitionDescriptor {
            fields: fields(vec![("duration", number(100.0))]),
            kind: "acme.Tween".to_string(),
        });
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &create_test_schemas(),
            None,
        )
        .unwrap();
        assert_eq!(explanation.kind.as_deref(), Some("acme.Tween"));
        assert_eq!(explanation.path, "scenes[0].scene.transition");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::InteractiveStateTransitionKindUnregistered
        );
    }

    #[test]
    fn preserves_the_authored_root_kind() {
        let document = root_document2d(SPRITE_KIND, fields(vec![]));
        let materialization = create_flight_document_scene2d_materialization(
            &document,
            &create_test_schemas(),
            None,
            None,
        )
        .unwrap();
        assert_eq!(kind_of(&root_of(&materialization)), SPRITE_KIND);
    }

    #[test]
    fn preserves_fields_authored_on_the_root() {
        let document = root_document2d(
            DISPLAY_OBJECT_KIND,
            fields(vec![("x", number(100.0)), ("y", number(200.0))]),
        );
        let materialization = create_flight_document_scene2d_materialization(
            &document,
            &create_test_schemas(),
            None,
            None,
        )
        .unwrap();
        let root = as_node2d_ref(&root_of(&materialization)).unwrap();
        let root = root.read().unwrap();
        assert_eq!(
            (root.node2d_fields().x, root.node2d_fields().y),
            (100.0, 200.0)
        );
    }

    #[test]
    fn attaches_the_adopted_root_to_its_scene_and_detaches_the_default_root() {
        let document = root_document2d(SPRITE_KIND, fields(vec![]));
        let materialization = create_flight_document_scene2d_materialization(
            &document,
            &create_test_schemas(),
            None,
            None,
        )
        .unwrap();
        let root: Node2DRef = materialization.scene.read().unwrap().root.clone();
        let attached = root
            .read()
            .unwrap()
            .node2d_fields()
            .node2d_runtime()
            .scene2d
            .clone();
        assert!(
            attached
                .and_then(|scene| scene.upgrade())
                .is_some_and(|scene| Arc::ptr_eq(&scene, &materialization.scene))
        );
    }

    #[test]
    fn round_trips_a_root_with_authored_fields_without_losing_them() {
        let schemas = create_test_schemas();
        let scene = create_scene2d(None);
        {
            let guard = scene.read().unwrap();
            let mut root = guard.root.write().unwrap();
            root.node2d_fields_mut().x = 7.0;
            root.node2d_fields_mut().y = 9.0;
        }
        let written =
            create_flight_document_from_scene2d(&scene.read().unwrap(), &schemas, None, None);
        let back =
            create_flight_document_scene2d_materialization(&wrap(written), &schemas, None, None)
                .unwrap();
        let root = as_node2d_ref(&root_of(&back)).unwrap();
        let root = root.read().unwrap();
        assert_eq!((root.node2d_fields().x, root.node2d_fields().y), (7.0, 9.0));
    }

    #[test]
    fn refuses_a_registered_root_whose_kind_belongs_to_the_other_dimension() {
        let mut schemas = create_test_schemas();
        schemas.node_schemas = with_kind_map_entry(
            &schemas.node_schemas,
            NODE3D_KIND.to_string(),
            node3d_schema(Arc::new(|_| {})),
        );
        let document = root_document2d(NODE3D_KIND, fields(vec![]));
        assert!(
            create_flight_document_scene2d_materialization(&document, &schemas, None, None)
                .is_none()
        );
        let explanation = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            None,
        )
        .unwrap();
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::RootKindMismatch
        );
    }

    #[test]
    fn passes_a_genuinely_empty_resource_map_to_a_root_dimension_probe() {
        let resource_keys: Arc<Mutex<Option<Vec<String>>>> = Arc::new(Mutex::new(None));
        let captured = resource_keys.clone();
        let mut schemas = create_test_schemas();
        schemas.node_schemas = with_kind_map_entry(
            &schemas.node_schemas,
            NODE3D_KIND.to_string(),
            node3d_schema(Arc::new(move |resources| {
                *captured.lock().unwrap() = Some({
                    let mut collected = Vec::new();
                    get_record_keys(&mut collected, resources);
                    collected
                });
            })),
        );

        explain_flight_document_refusal(
            &root_document2d(NODE3D_KIND, fields(vec![])),
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            None,
        );

        assert_eq!(
            resource_keys.lock().unwrap().clone(),
            Some(Vec::<String>::new())
        );
    }
}

mod explain_flight_document_refusal_from_text {
    use super::*;

    fn explain(yaml: &str) -> FlightDocumentRefusalExplanation {
        return explain_flight_document_refusal_from_text(
            yaml,
            FlightDocumentSceneDimension::Scene2D,
            &create_test_schemas(),
            None,
        )
        .expect("a refusal");
    }

    #[test]
    fn explains_an_anchor_refusal_with_parser_position() {
        let explanation = explain("flight: 1\nkind: Scene2D\nanchor: &ref value\n");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::AnchorUnsupported
        );
        assert!(explanation.line.is_some_and(|line| line > 0));
        assert!(explanation.column.is_some_and(|column| column > 0));
        assert!(explanation.offset.is_some());
    }

    #[test]
    fn explains_an_alias_refusal() {
        assert_eq!(
            explain("flight: 1\nkind: Scene2D\nref: *alias\n").reason,
            FlightDocumentRefusalReason::AliasUnsupported
        );
    }

    #[test]
    fn explains_a_tag_refusal() {
        assert_eq!(
            explain("flight: 1\nkind: Scene2D\ntyped: !custom value\n").reason,
            FlightDocumentRefusalReason::TagUnsupported
        );
    }

    #[test]
    fn explains_a_document_separator_refusal() {
        assert_eq!(
            explain("flight: 1\n---\nkind: Scene2D\n").reason,
            FlightDocumentRefusalReason::DocumentSeparatorUnsupported
        );
    }

    #[test]
    fn explains_a_key_limit_refusal_with_limit_and_actual() {
        let explanation = explain(&format!(
            "flight: 1\nkind: Scene2D\n{}: value\n",
            "k".repeat(300)
        ));
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::KeyCodeUnitsLimitExceeded
        );
        assert_eq!(explanation.limit, Some(256));
        assert_eq!(explanation.actual, Some(300));
        assert!(explanation.line.is_some_and(|line| line > 0));
        assert!(explanation.column.is_some_and(|column| column > 0));
        assert!(explanation.offset.is_some());
    }

    #[test]
    fn returns_null_for_valid_scene2d_text() {
        let yaml = "flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n";
        assert!(
            explain_flight_document_refusal_from_text(
                yaml,
                FlightDocumentSceneDimension::Scene2D,
                &create_test_schemas(),
                None
            )
            .is_none()
        );
    }

    #[test]
    fn explains_an_unsupported_version_in_valid_yaml() {
        let explanation = explain(
            "flight: 99\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n",
        );
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::VersionUnsupported
        );
        assert_eq!(explanation.path, "version");
        assert_eq!(explanation.version, Some(99.0));
    }

    #[test]
    fn explains_a_dimension_mismatch_in_valid_yaml() {
        let explanation = explain(
            "flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene3D\n    scene:\n      kind: Node3D\n",
        );
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
        assert_eq!(explanation.path, "scenes[0].kind");
    }

    #[test]
    fn round_trips_a_minimal_scene2d_through_model_and_text() {
        let scene = create_scene2d(None);
        let written = create_flight_document_from_scene2d(
            &scene.read().unwrap(),
            &create_test_schemas(),
            None,
            None,
        );
        let text = format_flight_document_text(&wrap(written));
        assert!(text.contains("flight: 1"));
        assert!(text.contains("kind: Scene2D"));
    }

    #[test]
    fn round_trips_a_scene2d_with_children_through_text() {
        let scene = create_scene2d(Some(&defaults()));
        let root: NodeRef = scene.read().unwrap().root.clone();
        let sprite = create_sprite(None);
        {
            let mut sprite = sprite.write().unwrap();
            sprite.node_fields_mut().name = Some("hero".to_string());
            sprite.x = 50.0;
            sprite.y = 100.0;
        }
        let sprite: NodeRef = sprite;
        add_node_child(&root, &sprite);
        let schemas = create_test_schemas();
        let written =
            create_flight_document_from_scene2d(&scene.read().unwrap(), &schemas, None, None);
        let text = format_flight_document_text(&wrap(written));
        assert!(
            create_flight_document_scene2d_materialization_from_text(&text, &schemas, None, None)
                .is_some()
        );
    }
}

mod initialize_flight_document_from_scene2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_flight_document_from_scene2d() {
        let scene = create_scene2d(Some(&Scene2DOptions {
            color: Some(0x10203040),
            ..defaults()
        }));
        let mut out: FlightDocumentScene2D = allocate_entity();
        initialize_flight_document_from_scene2d(
            &mut out,
            &scene.read().unwrap(),
            document_node(DISPLAY_OBJECT_KIND, fields(vec![]), vec![]),
            &[],
            &FlightDocumentWrittenNodes::new(),
        );
        assert_eq!(out.background_color, Some(f64::from(0x10203040u32)));
        assert_eq!(out.scene.kind, DISPLAY_OBJECT_KIND);
        assert!(out.layouts.is_empty() && out.tokens.is_empty());
    }
}

mod initialize_flight_document_scene2d_materialization {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_flight_document_scene2d_materialization() {
        let scene = create_scene2d(None);
        let mut out: FlightDocumentScene2DMaterialization = allocate_entity();
        initialize_flight_document_scene2d_materialization(
            &mut out,
            Vec::new(),
            Vec::new(),
            scene.clone(),
        );
        assert!(Arc::ptr_eq(&out.scene, &scene));
        assert!(out.interactive_state_bindings.is_empty() && out.layout_bindings.is_empty());
    }
}
