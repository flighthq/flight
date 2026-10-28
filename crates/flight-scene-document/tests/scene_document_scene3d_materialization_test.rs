// flight-lint: allow-file(f64) D1: document numbers are JS Numbers
use std::sync::{Arc, Mutex, RwLock};

use flight_camera::{
    CameraGuardState, CameraGuardStateRef, Projection, create_perspective_projection,
};
use flight_entity::{allocate_entity, get_record_keys, get_record_value};
use flight_geometry::contract::{
    Transform3D, create_transform3d, create_vector3, set_quaternion_from_axis_angle,
};
use flight_lighting::{
    AMBIENT_LIGHT_KIND, AmbientLightOptions, DirectionalLightOptions, LightRef, Scene3DLights,
    SpotLightOptions, create_ambient_light, create_directional_light, create_hemisphere_light,
    create_point_light, create_spot_light,
};
use flight_node::{NodeRef, get_node_children, invalidate_node_local_transform};
use flight_registry::with_kind_map_entry;
use flight_scene_document::contract::*;
use flight_scene2d::{DISPLAY_OBJECT_KIND, create_display_object};
use flight_scene3d::{
    NODE3D_KIND, Node3DFields, Scene3DDocumentCamera, Scene3DDocumentLight, as_node3d_ref,
    create_node3d, create_scene3d, publish_node3d,
};

use crate::support::*;

fn camera_guards() -> CameraGuardStateRef {
    return Arc::new(RwLock::new(defaults::<CameraGuardState>()));
}

fn materialize(
    document: &FlightDocument,
    schemas: &FlightDocumentSchemaRegistry,
) -> Option<FlightDocumentScene3DMaterialization> {
    return create_flight_document_scene3d_materialization(
        document,
        schemas,
        None,
        None,
        &camera_guards(),
    );
}

fn materialize_text(
    text: &str,
    schemas: &FlightDocumentSchemaRegistry,
) -> Option<FlightDocumentScene3DMaterialization> {
    return create_flight_document_scene3d_materialization_from_text(
        text,
        schemas,
        None,
        None,
        &camera_guards(),
    );
}

fn create_node3d_ref(name: Option<String>) -> NodeRef {
    let node: NodeRef = publish_node3d({
        let mut out = create_node3d::<Node3DFields>(None);
        out.name = name;
        out
    });
    return node;
}

fn string_field(fields: &FlightDocumentFields, name: &str) -> Option<String> {
    return match get_record_value(fields, name) {
        Some(FlightDocumentValue::String(value)) => Some(value.clone()),
        _ => None,
    };
}

fn create_test_schemas() -> FlightDocumentSchemaRegistry {
    let node3d_schema = FlightDocumentNodeSchema {
        create_node: Arc::new(|fields, _| {
            let node = create_node3d_ref(string_field(fields, "name"));
            if let Some(FlightDocumentValue::Number(position_x)) =
                get_record_value(fields, "positionX")
            {
                let live = as_node3d_ref(&node).expect("a published 3D node");
                live.write().unwrap().node3d_fields_mut().position.x = *position_x as f32;
                invalidate_node_local_transform(&node);
            }
            return Some(node);
        }),
        fields: vec![
            FlightDocumentFieldSchema {
                default_value: None,
                name: "name".to_string(),
                required: false,
                validate: Arc::new(|value| {
                    matches!(
                        value,
                        FlightDocumentValue::String(_) | FlightDocumentValue::Null
                    )
                }),
            },
            FlightDocumentFieldSchema {
                default_value: None,
                name: "positionX".to_string(),
                required: false,
                validate: Arc::new(|value| matches!(value, FlightDocumentValue::Number(_))),
            },
        ],
        kind: NODE3D_KIND.to_string(),
        write_node_fields: Arc::new(|out, source, _| {
            if let Some(name) = &source.read().unwrap().node_fields().name {
                flight_entity::set_record_value(out, "name".to_string(), text(name));
            }
            return true;
        }),
    };
    let mut schemas = empty_schemas();
    schemas.node_schemas = with_kind_map_entry(
        &schemas.node_schemas,
        NODE3D_KIND.to_string(),
        node3d_schema,
    );
    return schemas;
}

// The source's `rootDocument3D`: re-registers the 3D kind with a name-only schema and authors a
// one-scene document whose root has `kind` and `root_fields`.
fn root_document3d(
    kind: &str,
    root_fields: FlightDocumentFields,
    schemas: &mut FlightDocumentSchemaRegistry,
) -> FlightDocument {
    schemas.node_schemas = with_kind_map_entry(
        &schemas.node_schemas,
        NODE3D_KIND.to_string(),
        FlightDocumentNodeSchema {
            create_node: Arc::new(|fields, _| {
                return Some(create_node3d_ref(string_field(fields, "name")));
            }),
            fields: vec![FlightDocumentFieldSchema {
                default_value: None,
                name: "name".to_string(),
                required: false,
                validate: Arc::new(|value| {
                    matches!(
                        value,
                        FlightDocumentValue::String(_) | FlightDocumentValue::Null
                    )
                }),
            }],
            kind: NODE3D_KIND.to_string(),
            write_node_fields: Arc::new(|_, _, _| true),
        },
    );
    return create_test_document(scene3d(
        document_node(kind, root_fields, vec![]),
        vec![],
        vec![],
    ));
}

fn display_object_schema(
    on_create: Arc<dyn Fn(&FlightDocumentResourceLookup) + Send + Sync>,
) -> FlightDocumentNodeSchema {
    return FlightDocumentNodeSchema {
        create_node: Arc::new(move |_, resources| {
            on_create(resources);
            return Some(create_display_object());
        }),
        fields: Vec::new(),
        kind: DISPLAY_OBJECT_KIND.to_string(),
        write_node_fields: Arc::new(|_, _, _| true),
    };
}

fn scene3d(
    scene: FlightDocumentNode,
    cameras: Vec<Scene3DDocumentCamera>,
    lights: Vec<Scene3DDocumentLight>,
) -> FlightDocumentScene {
    let mut out: FlightDocumentScene3D = allocate_entity();
    out.cameras = cameras;
    out.lights = lights;
    out.scene = scene;
    return FlightDocumentScene::Scene3D(out);
}

fn empty_scene3d() -> FlightDocumentScene {
    return scene3d(
        document_node(NODE3D_KIND, fields(vec![]), vec![]),
        vec![],
        vec![],
    );
}

fn scene2d() -> FlightDocumentScene {
    let mut out: FlightDocumentScene2D = allocate_entity();
    out.scene = document_node(DISPLAY_OBJECT_KIND, fields(vec![]), vec![]);
    return FlightDocumentScene::Scene2D(out);
}

fn create_test_document(scene: FlightDocumentScene) -> FlightDocument {
    return FlightDocument {
        default_scene: 0,
        resources: Vec::new(),
        scenes: vec![scene],
        version: 1.0,
    };
}

fn scene3d_mut(document: &mut FlightDocument) -> &mut FlightDocumentScene3D {
    let FlightDocumentScene::Scene3D(scene) = &mut document.scenes[0] else {
        panic!("expected a Scene3D entry");
    };
    return scene;
}

fn perspective(aspect: f32, fov_y: f32) -> Projection {
    let projection = create_perspective_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.aspect = aspect;
        projection.fov_y = fov_y;
    }
    return Projection::Perspective(projection);
}

fn document_camera(
    far: f32,
    near: f32,
    node: Option<i32>,
    transform: Transform3D,
) -> Scene3DDocumentCamera {
    return Scene3DDocumentCamera {
        far,
        name: None,
        near,
        node,
        projection: perspective(1.77, 1.047),
        transform,
    };
}

fn document_light(
    descriptor: LightRef,
    node: Option<i32>,
    transform: Transform3D,
) -> Scene3DDocumentLight {
    return Scene3DDocumentLight {
        descriptor,
        name: None,
        node,
        transform,
    };
}

fn ambient(options: Option<&AmbientLightOptions>) -> LightRef {
    let mut light = create_ambient_light();
    if let Some(options) = options {
        if let Some(color) = options.color {
            light.color = color;
        }
        if let Some(enabled) = options.enabled {
            light.enabled = enabled;
        }
        if let Some(intensity) = options.intensity {
            light.intensity = intensity;
        }
        if let Some(intensity_unit) = options.intensity_unit {
            light.intensity_unit = intensity_unit;
        }
    }
    return Arc::new(RwLock::new(light));
}

fn directional(options: Option<&DirectionalLightOptions>) -> LightRef {
    return Arc::new(RwLock::new(create_directional_light(options)));
}

fn duplicate_ambient_lights() -> Vec<Scene3DDocumentLight> {
    return vec![
        document_light(ambient(None), None, create_transform3d()),
        document_light(
            ambient(Some(&AmbientLightOptions {
                color: Some(0xccccccff),
                intensity: Some(0.5),
                ..defaults()
            })),
            None,
            create_transform3d(),
        ),
    ];
}

fn duplicate_directional_lights() -> Vec<Scene3DDocumentLight> {
    return vec![
        document_light(directional(None), None, create_transform3d()),
        document_light(
            directional(Some(&DirectionalLightOptions {
                color: Some(0xccccccff),
                intensity: Some(0.5),
                ..defaults()
            })),
            None,
            create_transform3d(),
        ),
    ];
}

fn lights_document(lights: Vec<Scene3DDocumentLight>) -> FlightDocument {
    return create_test_document(scene3d(
        document_node(NODE3D_KIND, fields(vec![]), vec![]),
        vec![],
        lights,
    ));
}

// The root, one child at `positionX: 2` and its child at `positionX: 3`: depth-first index 2 sits
// at world x = 5.
fn nested_positioned_scene() -> FlightDocumentNode {
    return document_node(
        NODE3D_KIND,
        fields(vec![]),
        vec![document_node(
            NODE3D_KIND,
            fields(vec![("positionX", number(2.0))]),
            vec![document_node(
                NODE3D_KIND,
                fields(vec![("positionX", number(3.0))]),
                vec![],
            )],
        )],
    );
}

fn nested_unknown_scene() -> FlightDocumentNode {
    return document_node(
        NODE3D_KIND,
        fields(vec![]),
        vec![document_node(
            NODE3D_KIND,
            fields(vec![]),
            vec![document_node("acme.Unknown", fields(vec![]), vec![])],
        )],
    );
}

fn unknown_child_scene() -> FlightDocumentNode {
    return document_node(
        NODE3D_KIND,
        fields(vec![]),
        vec![document_node("acme.Unknown", fields(vec![]), vec![])],
    );
}

fn camera_view_m12(materialization: &FlightDocumentScene3DMaterialization) -> f32 {
    return materialization.cameras[0].view.read().unwrap().m[12];
}

fn root_of(materialization: &FlightDocumentScene3DMaterialization) -> NodeRef {
    let root: NodeRef = materialization.scene.root.clone();
    return root;
}

fn kind_of(node: &NodeRef) -> String {
    return node.read().unwrap().node_fields().kind.clone();
}

fn get_scene3d_light_kinds(lights: &Scene3DLights) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(light) = &lights.ambient {
        out.push(light.read().unwrap().kind.clone());
    }
    if let Some(light) = &lights.directional {
        out.push(light.read().unwrap().kind.clone());
    }
    out.extend(
        lights
            .hemisphere
            .iter()
            .map(|light| light.read().unwrap().kind.clone()),
    );
    out.extend(
        lights
            .point
            .iter()
            .map(|light| light.read().unwrap().kind.clone()),
    );
    out.extend(
        lights
            .spot
            .iter()
            .map(|light| light.read().unwrap().kind.clone()),
    );
    out.sort();
    return out;
}

fn assert_close(actual: f32, expected: f32) {
    // vitest `toBeCloseTo` default precision: |actual - expected| < 0.005.
    assert!(
        (actual - expected).abs() < 0.005,
        "{actual} is not close to {expected}"
    );
}

mod create_flight_document_from_scene3d {
    use super::*;

    fn assert_entity<T: flight_entity::Entity>(_: &T) {}

    #[test]
    fn creates_a_model_from_an_empty_scene3d() {
        let scene = create_scene3d();
        let mut document = create_flight_document_from_scene3d(
            &scene,
            &[],
            &[],
            &create_test_schemas(),
            None,
            None,
        );

        assert_entity(&document);
        assert!(!flight_entity::get_entity_uid(&mut document).is_empty());
        assert!(document.scene.children.is_empty());
        assert!(document.cameras.is_empty());
        assert!(document.lights.is_empty());
    }

    #[test]
    fn preserves_cameras_and_lights() {
        let scene = create_scene3d();
        let cameras = vec![Scene3DDocumentCamera {
            far: 1000.0,
            name: Some("main".to_string()),
            near: 0.1,
            node: None,
            projection: perspective(1.5, 1.0),
            transform: create_transform3d(),
        }];
        let lights = vec![Scene3DDocumentLight {
            descriptor: ambient(None),
            name: Some("ambient".to_string()),
            node: None,
            transform: create_transform3d(),
        }];

        let document = create_flight_document_from_scene3d(
            &scene,
            &cameras,
            &lights,
            &create_test_schemas(),
            None,
            None,
        );

        assert_eq!(document.cameras.len(), 1);
        assert_eq!(document.cameras[0].far, 1000.0);
        assert_eq!(document.lights.len(), 1);
        assert_eq!(
            document.lights[0].descriptor.read().unwrap().kind(),
            AMBIENT_LIGHT_KIND
        );
    }

    #[test]
    fn writes_interactive_metadata_only_from_explicit_bindings() {
        let scene = create_scene3d();
        let states = FlightDocumentInteractiveStates {
            disabled: Some(FlightDocumentInteractiveState {
                alpha: Some(0.4),
                ..defaults()
            }),
            hover: None,
            pressed: None,
        };
        let root: NodeRef = scene.root.clone();

        let without = create_flight_document_from_scene3d(
            &scene,
            &[],
            &[],
            &create_test_schemas(),
            None,
            None,
        );
        let with = create_flight_document_from_scene3d(
            &scene,
            &[],
            &[],
            &create_test_schemas(),
            Some(&[FlightDocumentInteractiveStateBinding {
                interactive_states: states,
                node: root,
                transition: None,
            }]),
            None,
        );

        assert!(without.scene.interactive_states.is_none());
        let written = with.scene.interactive_states.expect("bound states");
        assert_eq!(
            written.disabled.and_then(|disabled| disabled.alpha),
            Some(0.4)
        );
        assert!(written.hover.is_none() && written.pressed.is_none());
    }

    #[test]
    fn writes_layouts_only_from_the_optional_explicit_binding_argument_after_interactive_bindings()
    {
        let scene = {
            let out = create_scene3d();
            {
                let mut fields = out.root.write().unwrap();
                fields.node3d_fields_mut().name = Some("world".to_string());
            }
            out
        };
        let root: NodeRef = scene.root.clone();
        let tree = Arc::new(FlightDocumentLayoutTree {
            nodes: vec![FlightDocumentLayoutNode {
                container_style: Some(fields(vec![("custom", FlightDocumentValue::Boolean(true))])),
                item_style: None,
                kind: "acme.World".to_string(),
                parent_index: -1,
            }],
        });

        let without = create_flight_document_from_scene3d(
            &scene,
            &[],
            &[],
            &create_test_schemas(),
            None,
            None,
        );
        let with = create_flight_document_from_scene3d(
            &scene,
            &[],
            &[],
            &create_test_schemas(),
            Some(&[]),
            Some(&[FlightDocumentLayoutBinding {
                targets: vec![root],
                tree: tree.clone(),
            }]),
        );

        assert!(without.layouts.is_empty());
        assert_eq!(with.layouts.len(), 1);
        assert_eq!(with.layouts[0].targets, vec!["world".to_string()]);
        let written = &with.layouts[0].tree.nodes[0];
        assert_eq!(written.kind, "acme.World");
        assert_eq!(written.parent_index, -1);
        assert!(written.item_style.is_none());
        assert!(
            written
                .container_style
                .as_ref()
                .is_some_and(|style| fields_equal(
                    style,
                    tree.nodes[0].container_style.as_ref().unwrap()
                ))
        );
    }
}

mod create_flight_document_scene3d_materialization {
    use super::*;

    #[test]
    fn materializes_an_empty_scene3d_from_a_minimal_model() {
        let materialization = materialize(
            &create_test_document(empty_scene3d()),
            &create_test_schemas(),
        )
        .expect("a materialization");

        assert!(materialization.cameras.is_empty());
        assert_eq!(kind_of(&root_of(&materialization)), NODE3D_KIND);
        assert!(get_scene3d_light_kinds(&materialization.lights).is_empty());
    }

    #[test]
    fn materializes_cameras_from_document_camera_descriptors() {
        let document = create_test_document(scene3d(
            document_node(NODE3D_KIND, fields(vec![]), vec![]),
            vec![document_camera(500.0, 0.5, None, create_transform3d())],
            vec![],
        ));

        let materialization =
            materialize(&document, &create_test_schemas()).expect("a materialization");

        assert_eq!(materialization.cameras.len(), 1);
        assert_eq!(materialization.cameras[0].far, 500.0);
        assert_eq!(materialization.cameras[0].near, 0.5);
        assert!(matches!(
            materialization.cameras[0].projection,
            Projection::Perspective(_)
        ));
    }

    #[test]
    fn applies_authored_camera_placement_to_the_runtime_view_matrix() {
        let mut transform = create_transform3d();
        transform.position.x = 7.0;
        let document = create_test_document(scene3d(
            document_node(NODE3D_KIND, fields(vec![]), vec![]),
            vec![document_camera(500.0, 0.5, None, transform)],
            vec![],
        ));

        let materialization =
            materialize(&document, &create_test_schemas()).expect("a materialization");

        assert_eq!(camera_view_m12(&materialization), -7.0);
    }

    #[test]
    fn applies_a_bound_depth_first_node_placement_to_the_runtime_camera() {
        let mut transform = create_transform3d();
        transform.position.x = 7.0;
        let document = create_test_document(scene3d(
            nested_positioned_scene(),
            vec![document_camera(500.0, 0.5, Some(2), transform)],
            vec![],
        ));

        let materialization =
            materialize(&document, &create_test_schemas()).expect("a materialization");

        assert_eq!(camera_view_m12(&materialization), -5.0);
    }

    #[test]
    fn preserves_the_source_derived_representable_light_population_and_authored_placement() {
        let mut transform = create_transform3d();
        transform.position = create_vector3(10.0, 20.0, 30.0);
        transform.scale = create_vector3(2.0, 3.0, 4.0);
        set_quaternion_from_axis_angle(
            &mut transform.rotation,
            &create_vector3(0.0, 1.0, 0.0),
            std::f32::consts::FRAC_PI_2,
        );
        let mut authored_point = create_point_light();
        authored_point.position = create_vector3(1.0, 0.0, 0.0);
        let authored: Vec<LightRef> = vec![
            ambient(None),
            directional(Some(&DirectionalLightOptions {
                direction: Some(create_vector3(0.0, 0.0, -1.0)),
                ..defaults()
            })),
            Arc::new(RwLock::new(create_hemisphere_light())),
            Arc::new(RwLock::new(authored_point)),
            Arc::new(RwLock::new(create_spot_light(Some(&SpotLightOptions {
                direction: Some(create_vector3(0.0, 0.0, -1.0)),
                position: Some(create_vector3(1.0, 0.0, 0.0)),
                ..defaults()
            })))),
        ];
        let mut authored_kinds: Vec<String> = authored
            .iter()
            .map(|light| light.read().unwrap().kind().to_string())
            .collect();
        authored_kinds.sort();
        let lights = authored
            .into_iter()
            .map(|descriptor| document_light(descriptor, None, transform.clone()))
            .collect();

        let materialization = materialize(&lights_document(lights), &create_test_schemas())
            .expect("a materialization");

        let result = &materialization.lights;
        assert_eq!(get_scene3d_light_kinds(result), authored_kinds);
        let directional = result.directional.as_ref().unwrap().read().unwrap();
        assert_close(directional.direction.x, -1.0);
        assert_close(directional.direction.y, 0.0);
        assert_close(directional.direction.z, 0.0);
        let point = result.point[0].read().unwrap();
        assert_eq!(
            (point.position.x, point.position.y, point.position.z),
            (10.0, 20.0, 28.0)
        );
        let spot = result.spot[0].read().unwrap();
        assert_eq!(
            (spot.position.x, spot.position.y, spot.position.z),
            (10.0, 20.0, 28.0)
        );
        assert_close(spot.direction.x, -1.0);
        assert_close(spot.direction.y, 0.0);
        assert_close(spot.direction.z, 0.0);
    }

    #[test]
    fn applies_a_bound_depth_first_node_placement_to_a_punctual_light() {
        let mut transform = create_transform3d();
        transform.position.x = 7.0;
        let point: LightRef = Arc::new(RwLock::new(create_point_light()));
        let document = create_test_document(scene3d(
            nested_positioned_scene(),
            vec![],
            vec![document_light(point, Some(2), transform)],
        ));

        let materialization =
            materialize(&document, &create_test_schemas()).expect("a materialization");

        let point = materialization.lights.point[0].read().unwrap();
        assert_eq!(
            (point.position.x, point.position.y, point.position.z),
            (5.0, 0.0, 0.0)
        );
    }

    #[test]
    fn materializes_a_tree_with_children() {
        let document = create_test_document(scene3d(
            document_node(
                NODE3D_KIND,
                fields(vec![]),
                vec![document_node(NODE3D_KIND, fields(vec![]), vec![])],
            ),
            vec![],
            vec![],
        ));

        let materialization =
            materialize(&document, &create_test_schemas()).expect("a materialization");

        let root_children = {
            let mut collected = Vec::new();
            get_node_children(&mut collected, &root_of(&materialization));
            collected
        };
        assert_eq!(root_children.len(), 1);
        assert_eq!(kind_of(&root_children[0]), NODE3D_KIND);
    }

    #[test]
    fn returns_null_for_a_scene2d_document() {
        assert!(materialize(&create_test_document(scene2d()), &create_test_schemas()).is_none());
    }

    #[test]
    fn returns_null_for_an_unsupported_version() {
        let mut document = create_test_document(empty_scene3d());
        document.version = 99.0;

        assert!(materialize(&document, &create_test_schemas()).is_none());
    }

    #[test]
    fn returns_null_for_duplicate_ambient_lights() {
        assert!(
            materialize(
                &lights_document(duplicate_ambient_lights()),
                &create_test_schemas()
            )
            .is_none()
        );
    }

    #[test]
    fn returns_null_for_duplicate_directional_lights() {
        assert!(
            materialize(
                &lights_document(duplicate_directional_lights()),
                &create_test_schemas()
            )
            .is_none()
        );
    }

    // NodeKindUnregistered
    #[test]
    fn materializer_returns_null_for_nested_unregistered_kind_two_levels_deep() {
        let document = create_test_document(scene3d(nested_unknown_scene(), vec![], vec![]));

        assert!(materialize(&document, &create_test_schemas()).is_none());
    }

    #[test]
    fn registration_mutation_control_same_tree_passes_when_kind_is_registered() {
        let document = create_test_document(scene3d(
            document_node(
                NODE3D_KIND,
                fields(vec![]),
                vec![document_node(
                    NODE3D_KIND,
                    fields(vec![]),
                    vec![document_node(NODE3D_KIND, fields(vec![]), vec![])],
                )],
            ),
            vec![],
            vec![],
        ));

        assert!(materialize(&document, &create_test_schemas()).is_some());
        assert!(
            explain_flight_document_scene3d_refusal(&document, &create_test_schemas(), None)
                .is_none()
        );
    }

    // Scene3D interactive-state materialization
    #[test]
    fn returns_an_inert_binding_for_the_exact_live_root() {
        let mut schemas = create_test_schemas();
        let mut document = root_document3d(NODE3D_KIND, fields(vec![]), &mut schemas);
        scene3d_mut(&mut document).scene.interactive_states =
            Some(FlightDocumentInteractiveStates {
                disabled: Some(FlightDocumentInteractiveState {
                    alpha: Some(0.4),
                    ..defaults()
                }),
                hover: None,
                pressed: None,
            });

        let materialization = materialize(&document, &schemas).expect("a materialization");

        assert_eq!(materialization.interactive_state_bindings.len(), 1);
        assert!(same_node(
            &materialization.interactive_state_bindings[0].node,
            &root_of(&materialization)
        ));
        assert_eq!(
            materialization
                .scene
                .root
                .read()
                .unwrap()
                .node3d_fields()
                .alpha,
            1.0
        );
    }

    // Scene3D layout materialization
    #[test]
    fn returns_an_inert_binding_for_a_named_3d_root_without_consulting_a_layout_resolver() {
        let mut schemas = create_test_schemas();
        let mut document = root_document3d(
            NODE3D_KIND,
            fields(vec![("name", text("world"))]),
            &mut schemas,
        );
        scene3d_mut(&mut document).layouts = vec![FlightDocumentLayoutDescriptor {
            targets: vec!["world".to_string()],
            tree: Arc::new(FlightDocumentLayoutTree {
                nodes: vec![FlightDocumentLayoutNode {
                    container_style: Some(fields(vec![(
                        "custom",
                        FlightDocumentValue::Boolean(true),
                    )])),
                    item_style: None,
                    kind: "acme.World".to_string(),
                    parent_index: -1,
                }],
            }),
        }];

        let materialization = materialize(&document, &schemas).expect("a materialization");

        let binding = &materialization.layout_bindings[0];
        assert_eq!(binding.targets.len(), 1);
        assert!(same_node(&binding.targets[0], &root_of(&materialization)));
        assert!(Arc::ptr_eq(
            &binding.tree,
            &scene3d_mut(&mut document).layouts[0].tree
        ));
    }

    // Scene3D root fidelity
    #[test]
    fn preserves_the_authored_root_kind() {
        let mut schemas = create_test_schemas();
        let document = root_document3d(NODE3D_KIND, fields(vec![]), &mut schemas);

        let materialization = materialize(&document, &schemas).expect("a materialization");

        assert_eq!(kind_of(&root_of(&materialization)), NODE3D_KIND);
    }

    #[test]
    fn preserves_fields_authored_on_the_root() {
        let mut schemas = create_test_schemas();
        let document = root_document3d(
            NODE3D_KIND,
            fields(vec![("name", text("authored-root"))]),
            &mut schemas,
        );

        let materialization = materialize(&document, &schemas).expect("a materialization");

        assert_eq!(
            root_of(&materialization)
                .read()
                .unwrap()
                .node_fields()
                .name
                .as_deref(),
            Some("authored-root")
        );
    }

    #[test]
    fn adopts_the_original_published_root_handle() {
        // The authored root is the very node its schema built, recovered through its own family
        // handle (Principal 68e645eb C1) rather than copied.
        let built: Arc<Mutex<Option<NodeRef>>> = Arc::new(Mutex::new(None));
        let mut schemas = create_test_schemas();
        let built_in_schema = built.clone();
        schemas.node_schemas = with_kind_map_entry(
            &schemas.node_schemas,
            NODE3D_KIND.to_string(),
            FlightDocumentNodeSchema {
                create_node: Arc::new(move |_, _| {
                    let node = create_node3d_ref(None);
                    *built_in_schema.lock().unwrap() = Some(node.clone());
                    return Some(node);
                }),
                fields: Vec::new(),
                kind: NODE3D_KIND.to_string(),
                write_node_fields: Arc::new(|_, _, _| true),
            },
        );

        let materialization = materialize(&create_test_document(empty_scene3d()), &schemas)
            .expect("a materialization");

        let built = built
            .lock()
            .unwrap()
            .clone()
            .expect("the schema built the root");
        assert!(same_node(&root_of(&materialization), &built));
    }

    #[test]
    fn refuses_a_registered_root_whose_kind_belongs_to_the_other_dimension() {
        let mut schemas = create_test_schemas();
        schemas.node_schemas = with_kind_map_entry(
            &schemas.node_schemas,
            DISPLAY_OBJECT_KIND.to_string(),
            display_object_schema(Arc::new(|_| {})),
        );
        let document = root_document3d(DISPLAY_OBJECT_KIND, fields(vec![]), &mut schemas);

        assert!(materialize(&document, &schemas).is_none());
        let refusal =
            explain_flight_document_scene3d_refusal(&document, &schemas, None).expect("a refusal");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::RootKindMismatch
        );
    }
}

mod create_flight_document_scene3d_materialization_from_text {
    use super::*;

    #[test]
    fn materializes_a_scene3d_from_yaml_text() {
        let yaml = [
            "flight: 1",
            "defaultScene: 0",
            "scenes:",
            "  - kind: Scene3D",
            "    scene:",
            "      kind: Node3D",
        ]
        .join("\n");

        let materialization =
            materialize_text(&yaml, &create_test_schemas()).expect("a materialization");

        assert_eq!(kind_of(&root_of(&materialization)), NODE3D_KIND);
    }

    #[test]
    fn returns_null_for_a_scene2d_yaml_document() {
        let yaml = [
            "flight: 1",
            "defaultScene: 0",
            "scenes:",
            "  - kind: Scene2D",
            "    scene:",
            "      kind: DisplayObject",
        ]
        .join("\n");

        assert!(materialize_text(&yaml, &create_test_schemas()).is_none());
    }

    #[test]
    fn decodes_text_authored_built_in_lights_into_canonical_lighting_entities() {
        // Principal 68e645eb C2: the reader keeps every light as a document descriptor; the
        // materializer decodes the built-in kinds and leaves the document's descriptor intact.
        let mut point = create_transform3d();
        point.position.x = 4.0;
        let yaml = format_flight_document_text(&lights_document(vec![
            document_light(
                ambient(Some(&AmbientLightOptions {
                    intensity: Some(0.4),
                    ..defaults()
                })),
                None,
                create_transform3d(),
            ),
            document_light(Arc::new(RwLock::new(create_point_light())), None, point),
        ]));
        let document = parse_flight_document_text(&yaml).expect("a document");

        let materialization =
            materialize(&document, &create_test_schemas()).expect("a materialization");

        let ambient = materialization
            .lights
            .ambient
            .as_ref()
            .expect("an ambient light");
        assert_eq!(ambient.read().unwrap().intensity, 0.4);
        let point = materialization.lights.point[0].read().unwrap();
        assert_eq!(point.position.x, 4.0);
        let FlightDocumentScene::Scene3D(scene) = &document.scenes[0] else {
            panic!("expected a Scene3D entry");
        };
        let raw = scene.lights[0].descriptor.read().unwrap();
        let raw: &dyn std::any::Any = &*raw;
        let raw = raw
            .downcast_ref::<FlightDocumentLightDescriptor>()
            .expect("the raw descriptor stays a document descriptor");
        assert_eq!(raw.kind, AMBIENT_LIGHT_KIND);
        assert_eq!(
            get_record_value(&raw.fields, "intensity")
                .map(|value| value_equal(value, &number(0.4))),
            Some(true)
        );
    }

    #[test]
    fn passes_a_custom_light_kind_through_as_its_descriptor() {
        let mut custom: FlightDocumentLightDescriptor = allocate_entity();
        custom.fields = fields(vec![("width", number(2.0))]);
        custom.kind = "acme.AreaLight".to_string();
        let yaml = format_flight_document_text(&lights_document(vec![document_light(
            Arc::new(RwLock::new(custom)),
            None,
            create_transform3d(),
        )]));
        let document = parse_flight_document_text(&yaml).expect("a document");
        let FlightDocumentScene::Scene3D(scene) = &document.scenes[0] else {
            panic!("expected a Scene3D entry");
        };
        let raw = scene.lights[0].descriptor.read().unwrap();
        let raw: &dyn std::any::Any = &*raw;
        let raw = raw
            .downcast_ref::<FlightDocumentLightDescriptor>()
            .expect("a custom kind is read as a descriptor");

        assert_eq!(raw.kind, "acme.AreaLight");
        assert_eq!(
            {
                let mut collected = Vec::new();
                get_record_keys(&mut collected, &raw.fields);
                collected
            },
            vec!["width".to_string()]
        );
        let materialization =
            materialize(&document, &create_test_schemas()).expect("a materialization");
        assert!(get_scene3d_light_kinds(&materialization.lights).is_empty());
    }
}

mod explain_flight_document_scene3d_refusal {
    use super::*;

    fn explain(document: &FlightDocument) -> Option<FlightDocumentRefusalExplanation> {
        return explain_flight_document_scene3d_refusal(document, &create_test_schemas(), None);
    }

    #[test]
    fn explains_a_dimension_mismatch() {
        let explanation = explain(&create_test_document(scene2d())).expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
        assert_eq!(explanation.path, "scenes[0].kind");
    }

    #[test]
    fn explains_an_unsupported_version() {
        let mut document = create_test_document(empty_scene3d());
        document.version = 99.0;

        let explanation = explain(&document).expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::VersionUnsupported
        );
        assert_eq!(explanation.path, "version");
        assert_eq!(explanation.version, Some(99.0));
    }

    #[test]
    fn explains_a_duplicate_ambient_light() {
        let explanation = explain(&lights_document(duplicate_ambient_lights())).expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::DuplicateAmbientLight
        );
        assert_eq!(explanation.path, "scenes[0].lights");
    }

    #[test]
    fn explains_a_duplicate_directional_light() {
        let explanation =
            explain(&lights_document(duplicate_directional_lights())).expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::DuplicateDirectionalLight
        );
        assert_eq!(explanation.path, "scenes[0].lights");
    }

    #[test]
    fn returns_null_when_the_document_is_valid() {
        assert!(explain(&create_test_document(empty_scene3d())).is_none());
    }

    // model-to-text explain parity
    #[test]
    fn model_and_text_explain_agree_on_each_parity_case() {
        let cases = [
            (
                "duplicate ambient (scene 0)",
                lights_document(duplicate_ambient_lights()),
                FlightDocumentRefusalReason::DuplicateAmbientLight,
                "scenes[0].lights",
            ),
            (
                "duplicate directional (scene 0)",
                lights_document(duplicate_directional_lights()),
                FlightDocumentRefusalReason::DuplicateDirectionalLight,
                "scenes[0].lights",
            ),
            (
                "wrong dimension (scene 0)",
                create_test_document(scene2d()),
                FlightDocumentRefusalReason::StructureInvalid,
                "scenes[0].kind",
            ),
            (
                "unregistered node kind (scene 0)",
                create_test_document(scene3d(unknown_child_scene(), vec![], vec![])),
                FlightDocumentRefusalReason::NodeKindUnregistered,
                "scenes[0].scene.children[0]",
            ),
        ];
        for (label, document, expected_reason, expected_path) in cases {
            let model = explain(&document).expect(label);
            let text = format_flight_document_text(&document);
            let from_text = explain_flight_document_scene3d_refusal_from_text(
                &text,
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

    // NodeKindUnregistered
    #[test]
    fn explain_names_the_unregistered_kind_with_qualified_scene_path() {
        let document = create_test_document(scene3d(nested_unknown_scene(), vec![], vec![]));

        let explanation = explain(&document).expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::NodeKindUnregistered
        );
        assert_eq!(explanation.kind.as_deref(), Some("acme.Unknown"));
        assert_eq!(explanation.path, "scenes[0].scene.children[0].children[0]");
    }

    // Scene3D root fidelity
    #[test]
    fn passes_a_genuinely_empty_resource_map_to_a_root_dimension_probe() {
        let resource_keys: Arc<Mutex<Option<Vec<String>>>> = Arc::new(Mutex::new(None));
        let observed = resource_keys.clone();
        let mut schemas = create_test_schemas();
        schemas.node_schemas = with_kind_map_entry(
            &schemas.node_schemas,
            DISPLAY_OBJECT_KIND.to_string(),
            display_object_schema(Arc::new(move |resources| {
                *observed.lock().unwrap() = Some({
                    let mut collected = Vec::new();
                    get_record_keys(&mut collected, resources);
                    collected
                });
            })),
        );
        let document = root_document3d(DISPLAY_OBJECT_KIND, fields(vec![]), &mut schemas);

        explain_flight_document_scene3d_refusal(&document, &schemas, None);

        assert_eq!(resource_keys.lock().unwrap().clone(), Some(Vec::new()));
    }
}

mod explain_flight_document_scene3d_refusal_from_text {
    use super::*;

    fn explain(yaml: &str) -> Option<FlightDocumentRefusalExplanation> {
        return explain_flight_document_scene3d_refusal_from_text(
            yaml,
            &create_test_schemas(),
            None,
        );
    }

    #[test]
    fn explains_an_anchor_refusal_with_parser_position() {
        let explanation =
            explain("flight: 1\nkind: Scene3D\nanchor: &ref value\n").expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::AnchorUnsupported
        );
        assert!(explanation.line.is_some_and(|line| line > 0));
    }

    #[test]
    fn explains_a_version_mismatch_in_valid_yaml() {
        let explanation = explain(
            "flight: 99\ndefaultScene: 0\nscenes:\n  - kind: Scene3D\n    scene:\n      kind: Node3D\n",
        )
        .expect("a refusal");

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
            "flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n",
        )
        .expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
        assert_eq!(explanation.path, "scenes[0].kind");
    }

    #[test]
    fn explains_a_duplicate_ambient_light_from_text() {
        let yaml = format_flight_document_text(&lights_document(vec![
            document_light(ambient(None), None, create_transform3d()),
            document_light(ambient(None), None, create_transform3d()),
        ]));

        let explanation = explain(&yaml).expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::DuplicateAmbientLight
        );
        assert_eq!(explanation.path, "scenes[0].lights");
    }

    #[test]
    fn explains_a_duplicate_directional_light_from_text() {
        let yaml = format_flight_document_text(&lights_document(vec![
            document_light(directional(None), None, create_transform3d()),
            document_light(directional(None), None, create_transform3d()),
        ]));

        let explanation = explain(&yaml).expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::DuplicateDirectionalLight
        );
        assert_eq!(explanation.path, "scenes[0].lights");
    }

    #[test]
    fn returns_null_for_valid_scene3d_text() {
        assert!(
            explain("flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene3D\n    scene:\n      kind: Node3D\n")
                .is_none()
        );
    }

    // NodeKindUnregistered
    #[test]
    fn text_explain_reports_unregistered_kind_from_yaml() {
        let yaml = format_flight_document_text(&create_test_document(scene3d(
            unknown_child_scene(),
            vec![],
            vec![],
        )));

        let explanation = explain(&yaml).expect("a refusal");

        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::NodeKindUnregistered
        );
        assert_eq!(explanation.kind.as_deref(), Some("acme.Unknown"));
        assert_eq!(explanation.path, "scenes[0].scene.children[0]");
    }
}

mod initialize_flight_document_from_scene3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_flight_document_from_scene3d() {
        let scene = create_scene3d();
        let node = document_node(NODE3D_KIND, fields(vec![]), vec![]);
        let mut out: FlightDocumentScene3D = allocate_entity();

        initialize_flight_document_from_scene3d(
            &mut out,
            &scene,
            &[],
            &[],
            node,
            &[],
            &FlightDocumentWrittenNodes::new(),
        );

        assert_eq!(out.scene.kind, NODE3D_KIND);
        assert!(out.cameras.is_empty() && out.lights.is_empty() && out.layouts.is_empty());
        assert!(out.tokens.is_empty());
    }
}

mod initialize_flight_document_scene3d_materialization {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_flight_document_scene3d_materialization() {
        let scene = create_scene3d();
        let root: NodeRef = scene.root.clone();
        let mut out: FlightDocumentScene3DMaterialization = allocate_entity();

        initialize_flight_document_scene3d_materialization(
            &mut out,
            Vec::new(),
            Vec::new(),
            Vec::new(),
            defaults::<Scene3DLights>(),
            scene,
        );

        assert!(same_node(&root_of(&out), &root));
        assert!(out.cameras.is_empty() && out.interactive_state_bindings.is_empty());
    }
}

// The source's `expectTypeOf` key checks: the exhaustive destructuring fails to compile if either
// record gains a field such as `direction`.
mod scene3d_document_records {
    use super::*;

    #[test]
    fn scene3d_document_camera_has_no_direction_field() {
        let Scene3DDocumentCamera {
            far: _,
            name: _,
            near: _,
            node: _,
            projection: _,
            transform: _,
        } = document_camera(1.0, 0.1, None, create_transform3d());
    }

    #[test]
    fn scene3d_document_light_has_no_direction_field() {
        let Scene3DDocumentLight {
            descriptor: _,
            name: _,
            node: _,
            transform: _,
        } = document_light(ambient(None), None, create_transform3d());
    }
}
