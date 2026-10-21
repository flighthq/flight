use std::sync::{Arc, Mutex, RwLock};

use flight_camera::CameraGuardState;
use flight_entity::{UnknownValue, allocate_entity, get_record_value};
use flight_geometry::create_transform3d;
use flight_lighting::create_ambient_light;
use flight_node::NodeRef;
use flight_node::contract::NodeRevisionState;
use flight_registry::with_kind_map_entry;
use flight_scene_document::contract::*;
use flight_scene2d::{DISPLAY_OBJECT_KIND, create_display_object};
use flight_scene3d::{
    NODE3D_KIND, Node3DFields, Scene3DDocumentLight, create_node3d, publish_node3d,
};

use crate::support::*;

const TEST_SCENE2D_NODE_KIND: &str = "TestScene2DNode";
const TEST_SCENE3D_NODE_KIND: &str = "TestScene3DNode";

type SeenResources = Arc<Mutex<Vec<Option<UnknownValue>>>>;

fn create_node3d_ref() -> NodeRef {
    let node: NodeRef = publish_node3d(create_node3d::<Node3DFields>(None, None));
    return node;
}

fn create_schema(
    kind: &str,
    create_node: Arc<dyn Fn(&FlightDocumentResourceLookup) -> NodeRef + Send + Sync>,
) -> FlightDocumentNodeSchema {
    return FlightDocumentNodeSchema {
        create_node: Arc::new(move |_, resources| Some(create_node(resources))),
        fields: Vec::new(),
        kind: kind.to_string(),
        write_node_fields: Arc::new(|_, _, _| true),
    };
}

fn create_test_schemas(seen_resources: &SeenResources) -> FlightDocumentSchemaRegistry {
    let mut schemas = empty_schemas();
    let seen2d = seen_resources.clone();
    let seen3d = seen_resources.clone();
    let entries = [
        create_schema(
            DISPLAY_OBJECT_KIND,
            Arc::new(|_| create_display_object(None)),
        ),
        create_schema(
            TEST_SCENE2D_NODE_KIND,
            Arc::new(move |resources| {
                seen2d
                    .lock()
                    .unwrap()
                    .push(get_record_value(resources, "shared").cloned());
                return create_display_object(None);
            }),
        ),
        create_schema(NODE3D_KIND, Arc::new(|_| create_node3d_ref())),
        create_schema(
            TEST_SCENE3D_NODE_KIND,
            Arc::new(move |resources| {
                seen3d
                    .lock()
                    .unwrap()
                    .push(get_record_value(resources, "shared").cloned());
                return create_node3d_ref();
            }),
        ),
    ];
    for schema in entries {
        schemas.node_schemas =
            with_kind_map_entry(&schemas.node_schemas, schema.kind.clone(), schema);
    }
    return schemas;
}

fn create_test_resolvers(shared_resource: &UnknownValue) -> FlightDocumentResourceResolverRegistry {
    let shared_resource = shared_resource.clone();
    let resolver: FlightDocumentResourceResolver =
        Arc::new(move |_: &str, _: &FlightDocumentResourceDescriptor| {
            Some(shared_resource.clone())
        });
    return FlightDocumentResourceResolverRegistry {
        resolvers: with_kind_map_entry(&empty_kind_map(), "TestResource".to_string(), resolver),
    };
}

fn create_mixed_document() -> FlightDocument {
    let mut scene2d: FlightDocumentScene2D = allocate_entity();
    scene2d.scene = document_node(
        DISPLAY_OBJECT_KIND,
        fields(vec![]),
        vec![document_node(
            TEST_SCENE2D_NODE_KIND,
            fields(vec![]),
            vec![],
        )],
    );
    let mut scene3d: FlightDocumentScene3D = allocate_entity();
    scene3d.scene = document_node(
        NODE3D_KIND,
        fields(vec![]),
        vec![document_node(
            TEST_SCENE3D_NODE_KIND,
            fields(vec![]),
            vec![],
        )],
    );
    return FlightDocument {
        default_scene: 1,
        resources: vec![FlightDocumentResourceDescriptor {
            fields: fields(vec![]),
            key: "shared".to_string(),
            kind: "TestResource".to_string(),
        }],
        scenes: vec![
            FlightDocumentScene::Scene2D(scene2d),
            FlightDocumentScene::Scene3D(scene3d),
        ],
        version: 1.0,
    };
}

fn materialize3d(
    document: &FlightDocument,
    schemas: &FlightDocumentSchemaRegistry,
    resolvers: Option<&FlightDocumentResourceResolverRegistry>,
    scene_index: Option<i64>,
) -> Option<FlightDocumentScene3DMaterialization> {
    let mut revisions = defaults::<NodeRevisionState>();
    let guards = Arc::new(RwLock::new(defaults::<CameraGuardState>()));
    return create_flight_document_scene3d_materialization(
        document,
        schemas,
        resolvers,
        scene_index,
        &mut revisions,
        &guards,
    );
}

fn materialize3d_text(
    text: &str,
    schemas: &FlightDocumentSchemaRegistry,
    resolvers: Option<&FlightDocumentResourceResolverRegistry>,
) -> Option<FlightDocumentScene3DMaterialization> {
    let mut revisions = defaults::<NodeRevisionState>();
    let guards = Arc::new(RwLock::new(defaults::<CameraGuardState>()));
    return create_flight_document_scene3d_materialization_from_text(
        text,
        schemas,
        resolvers,
        None,
        &mut revisions,
        &guards,
    );
}

// Each seen resource is the one shared resolved value, by identity.
fn assert_seen_shared(seen_resources: &SeenResources, shared_resource: &UnknownValue) {
    let seen = seen_resources.lock().unwrap();
    assert_eq!(seen.len(), 2);
    for resource in seen.iter() {
        assert!(
            resource
                .as_ref()
                .is_some_and(|resource| Arc::ptr_eq(resource, shared_resource))
        );
    }
}

mod multi_scene_materialization_selection {
    use super::*;

    #[test]
    fn uses_default_scene_by_default_and_can_materialize_another_entry_by_index() {
        let seen_resources: SeenResources = Arc::new(Mutex::new(Vec::new()));
        let schemas = create_test_schemas(&seen_resources);
        let shared_resource: UnknownValue = Arc::new(());
        let resolvers = create_test_resolvers(&shared_resource);
        let document = create_mixed_document();

        let selected3d = materialize3d(&document, &schemas, Some(&resolvers), None);
        let selected_as2d = create_flight_document_scene2d_materialization(
            &document,
            &schemas,
            Some(&resolvers),
            None,
        );
        let per_scene2d = create_flight_document_scene2d_materialization(
            &document,
            &schemas,
            Some(&resolvers),
            Some(0),
        );
        let wrong_per_scene3d = materialize3d(&document, &schemas, Some(&resolvers), Some(0));

        assert!(selected3d.is_some());
        assert!(selected_as2d.is_none());
        assert!(per_scene2d.is_some());
        assert!(wrong_per_scene3d.is_none());
        assert_seen_shared(&seen_resources, &shared_resource);
    }

    #[test]
    fn preserves_selected_and_explicit_index_semantics_through_the_text_conveniences() {
        let seen_resources: SeenResources = Arc::new(Mutex::new(Vec::new()));
        let schemas = create_test_schemas(&seen_resources);
        let shared_resource: UnknownValue = Arc::new(());
        let resolvers = create_test_resolvers(&shared_resource);
        let text = format_flight_document_text(&create_mixed_document());

        assert!(materialize3d_text(&text, &schemas, Some(&resolvers)).is_some());
        assert!(
            create_flight_document_scene2d_materialization_from_text(
                &text,
                &schemas,
                Some(&resolvers),
                None
            )
            .is_none()
        );
        assert!(
            create_flight_document_scene2d_materialization_from_text(
                &text,
                &schemas,
                Some(&resolvers),
                Some(0)
            )
            .is_some()
        );
        let refusal = explain_flight_document_refusal_from_text(
            &text,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            Some(1),
        )
        .expect("a refusal");
        assert_eq!(refusal.path, "scenes[1].kind");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
        assert_seen_shared(&seen_resources, &shared_resource);
    }

    #[test]
    fn rejects_an_empty_scene_container_through_both_dimension_entrypoints() {
        let document = FlightDocument {
            default_scene: 0,
            resources: Vec::new(),
            scenes: Vec::new(),
            version: 1.0,
        };
        let schemas = create_test_schemas(&Arc::new(Mutex::new(Vec::new())));

        assert!(
            create_flight_document_scene2d_materialization(&document, &schemas, None, None)
                .is_none()
        );
        assert!(materialize3d(&document, &schemas, None, None).is_none());
        let refusal2d = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            None,
        )
        .expect("a refusal");
        assert_eq!(refusal2d.path, "scenes");
        assert_eq!(refusal2d.reason, FlightDocumentRefusalReason::ScenesEmpty);
        let refusal3d =
            explain_flight_document_scene3d_refusal(&document, &schemas, None).expect("a refusal");
        assert_eq!(refusal3d.path, "scenes");
        assert_eq!(refusal3d.reason, FlightDocumentRefusalReason::ScenesEmpty);
    }

    #[test]
    fn rejects_an_invalid_default_scene_instead_of_clamping_it_even_for_an_explicit_scene_request()
    {
        let mut document = create_mixed_document();
        document.default_scene = 2;
        let schemas = create_test_schemas(&Arc::new(Mutex::new(Vec::new())));

        assert!(
            create_flight_document_scene2d_materialization(&document, &schemas, None, Some(0))
                .is_none()
        );
        let refusal = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            Some(0),
        )
        .expect("a refusal");
        assert_eq!(refusal.actual, Some(2));
        assert_eq!(refusal.path, "defaultScene");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::DefaultSceneOutOfRange
        );
    }

    #[test]
    fn qualifies_nested_and_dimension_specific_refusals_with_the_requested_scene_index() {
        let mut document = create_mixed_document();
        let schemas = create_test_schemas(&Arc::new(Mutex::new(Vec::new())));

        let refusal = explain_flight_document_refusal(
            &document,
            FlightDocumentSceneDimension::Scene2D,
            &schemas,
            Some(1),
        )
        .expect("a refusal");
        assert_eq!(refusal.path, "scenes[1].kind");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );

        let FlightDocumentScene::Scene3D(scene) = &mut document.scenes[1] else {
            panic!("fixture scene 1 must be Scene3D");
        };
        scene.scene.children = vec![document_node("acme.Unknown", fields(vec![]), vec![])];
        let refusal = explain_flight_document_scene3d_refusal(&document, &schemas, Some(1))
            .expect("a refusal");
        assert_eq!(refusal.kind.as_deref(), Some("acme.Unknown"));
        assert_eq!(refusal.path, "scenes[1].scene.children[0]");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::NodeKindUnregistered
        );

        let FlightDocumentScene::Scene3D(scene) = &mut document.scenes[1] else {
            panic!("fixture scene 1 must be Scene3D");
        };
        scene.scene.children = Vec::new();
        scene.lights = (0..2)
            .map(|_| Scene3DDocumentLight {
                descriptor: Arc::new(RwLock::new(create_ambient_light(None))),
                name: None,
                node: None,
                transform: create_transform3d(),
            })
            .collect();
        let refusal = explain_flight_document_scene3d_refusal(&document, &schemas, Some(1))
            .expect("a refusal");
        assert_eq!(refusal.path, "scenes[1].lights");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::DuplicateAmbientLight
        );
    }
}
