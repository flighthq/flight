use flight_entity::{allocate_entity, set_record_value};
use flight_registry::with_kind_map_entry;
use flight_scene_document::contract::*;

use crate::support::*;

fn create_document(resources: Vec<FlightDocumentResourceDescriptor>) -> FlightDocument {
    let mut scene: FlightDocumentScene2D = allocate_entity();
    scene.scene = document_node("DisplayObject", fields(vec![]), vec![]);
    return FlightDocument {
        default_scene: 0,
        resources,
        scenes: vec![FlightDocumentScene::Scene2D(scene)],
        version: 1.0,
    };
}

fn create_resource(
    key: &str,
    kind: &str,
    resource_fields: FlightDocumentFields,
) -> FlightDocumentResourceDescriptor {
    return FlightDocumentResourceDescriptor {
        fields: resource_fields,
        key: key.to_string(),
        kind: kind.to_string(),
    };
}

fn create_schemas(resource_kinds: &[&str]) -> FlightDocumentSchemaRegistry {
    let mut schemas = empty_schemas();
    for kind in resource_kinds {
        schemas.resource_schemas = with_kind_map_entry(
            &schemas.resource_schemas,
            kind.to_string(),
            FlightDocumentResourceSchema {
                fields: Vec::new(),
                kind: kind.to_string(),
            },
        );
    }
    return schemas;
}

fn keys(resources: &[FlightDocumentResourceDescriptor]) -> Vec<(&str, &str)> {
    return resources
        .iter()
        .map(|resource| (resource.key.as_str(), resource.kind.as_str()))
        .collect();
}

mod get_flight_document_resource_dependencies {
    use super::*;

    #[test]
    fn returns_every_directly_declared_resource_in_document_order() {
        let document = create_document(vec![
            create_resource(
                "hero",
                "Texture",
                fields(vec![("source", text("hero.png"))]),
            ),
            create_resource(
                "terrain",
                "Mesh",
                fields(vec![("source", text("terrain.glb"))]),
            ),
        ]);

        let dependencies = get_flight_document_resource_dependencies(
            &document,
            &create_schemas(&["Mesh", "Texture"]),
        )
        .unwrap();
        assert_eq!(
            keys(dependencies),
            vec![("hero", "Texture"), ("terrain", "Mesh")]
        );
        assert!(std::ptr::eq(dependencies, document.resources.as_slice()));
    }

    #[test]
    fn returns_an_empty_list_when_the_document_declares_no_resources() {
        let document = create_document(vec![]);
        assert!(
            get_flight_document_resource_dependencies(&document, &create_schemas(&[]))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn returns_null_when_a_declared_resource_kind_is_not_registered() {
        let document = create_document(vec![
            create_resource(
                "hero",
                "Texture",
                fields(vec![("source", text("hero.png"))]),
            ),
            create_resource(
                "terrain",
                "acme.Mesh",
                fields(vec![("source", text("terrain.mesh"))]),
            ),
        ]);
        assert!(
            get_flight_document_resource_dependencies(&document, &create_schemas(&["Texture"]))
                .is_none()
        );
    }

    #[test]
    fn does_not_infer_dependencies_by_traversing_resource_fields_or_scene_nodes() {
        let mut document = create_document(vec![create_resource(
            "hero",
            "Texture",
            fields(vec![
                ("nestedResourceKey", text("undeclared-resource")),
                ("source", text("hero.png")),
            ]),
        )]);
        let FlightDocumentScene::Scene2D(scene) = &mut document.scenes[0] else {
            unreachable!()
        };
        set_record_value(&mut scene.scene.fields, "texture".to_string(), text("hero"));

        let dependencies =
            get_flight_document_resource_dependencies(&document, &create_schemas(&["Texture"]))
                .unwrap();
        assert_eq!(keys(dependencies), vec![("hero", "Texture")]);
    }
}
