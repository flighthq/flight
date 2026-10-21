//! Rust convenience methods for the public scene-document lane (D18): each delegates to its free
//! function.

use crate::flight_document_resource_dependencies::get_flight_document_resource_dependencies;
use crate::flight_document_text::format_flight_document_text;
use crate::scene_document_materialization_selection::{
    FlightDocumentSceneSelection, select_flight_document_scene,
};
use crate::scene_document_scene2d_materialization::{
    create_flight_document_scene2d_materialization, explain_flight_document_refusal,
};
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use flight_entity::allocate_entity;

    use super::*;

    fn empty_kind_map<T>() -> flight_registry::KindMap<T> {
        return flight_registry::KindMap {
            entries: std::collections::HashMap::new(),
            key_order: Vec::new(),
        };
    }

    fn registry() -> FlightDocumentSchemaRegistry {
        return FlightDocumentSchemaRegistry {
            interactive_state_extension_schemas: empty_kind_map(),
            interactive_state_transition_schemas: empty_kind_map(),
            node_schemas: empty_kind_map(),
            resource_schemas: empty_kind_map(),
            shape_command_schemas: empty_kind_map(),
        };
    }

    fn document() -> FlightDocument {
        let mut scene: FlightDocumentScene2D = allocate_entity();
        scene.scene.kind = "acme.Unknown".to_string();
        return FlightDocument {
            default_scene: 0,
            resources: vec![FlightDocumentResourceDescriptor {
                fields: FlightDocumentFields::default(),
                key: "hero".to_string(),
                kind: "Texture".to_string(),
            }],
            scenes: vec![FlightDocumentScene::Scene2D(scene)],
            version: 1.0,
        };
    }

    #[test]
    fn document_methods_match_their_free_functions() {
        let document = document();
        let schemas = registry();

        assert_eq!(
            document.format_text(),
            format_flight_document_text(&document)
        );
        assert_eq!(
            document.resource_dependencies(&schemas).is_none(),
            get_flight_document_resource_dependencies(&document, &schemas).is_none()
        );
        let method = document.select_scene(FlightDocumentSceneDimension::Scene2D, None);
        let free =
            select_flight_document_scene(&document, FlightDocumentSceneDimension::Scene2D, None);
        assert_eq!(method.scene_index, free.scene_index);
        assert!(std::ptr::eq(method.scene.unwrap(), free.scene.unwrap()));
        assert_eq!(
            document.explain_refusal(FlightDocumentSceneDimension::Scene2D, &schemas, None),
            explain_flight_document_refusal(
                &document,
                FlightDocumentSceneDimension::Scene2D,
                &schemas,
                None
            )
        );
        assert_eq!(
            document
                .create_scene2d_materialization(&schemas, None, None)
                .is_none(),
            create_flight_document_scene2d_materialization(&document, &schemas, None, None)
                .is_none()
        );
    }
}

impl FlightDocument {
    pub fn create_scene2d_materialization(
        &self,
        schemas: &FlightDocumentSchemaRegistry,
        resolvers: Option<&FlightDocumentResourceResolverRegistry>,
        scene_index: Option<i64>,
    ) -> Option<FlightDocumentScene2DMaterialization> {
        return create_flight_document_scene2d_materialization(
            self,
            schemas,
            resolvers,
            scene_index,
        );
    }

    pub fn explain_refusal(
        &self,
        dimension: FlightDocumentSceneDimension,
        schemas: &FlightDocumentSchemaRegistry,
        scene_index: Option<i64>,
    ) -> Option<FlightDocumentRefusalExplanation> {
        return explain_flight_document_refusal(self, dimension, schemas, scene_index);
    }

    pub fn format_text(&self) -> FlightDocumentText {
        return format_flight_document_text(self);
    }

    pub fn resource_dependencies(
        &self,
        schemas: &FlightDocumentSchemaRegistry,
    ) -> Option<&[FlightDocumentResourceDescriptor]> {
        return get_flight_document_resource_dependencies(self, schemas);
    }

    pub fn select_scene(
        &self,
        dimension: FlightDocumentSceneDimension,
        scene_index: Option<i64>,
    ) -> FlightDocumentSceneSelection<'_> {
        return select_flight_document_scene(self, dimension, scene_index);
    }
}
