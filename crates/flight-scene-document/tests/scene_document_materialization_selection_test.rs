use flight_entity::allocate_entity;
use flight_scene_document::contract::*;

use crate::support::*;

fn create_document() -> FlightDocument {
    let mut scene2d: FlightDocumentScene2D = allocate_entity();
    scene2d.scene = document_node("DisplayObject", fields(vec![]), vec![]);
    let mut scene3d: FlightDocumentScene3D = allocate_entity();
    scene3d.scene = document_node("Node3D", fields(vec![]), vec![]);
    return FlightDocument {
        default_scene: 1,
        resources: Vec::new(),
        scenes: vec![
            FlightDocumentScene::Scene2D(scene2d),
            FlightDocumentScene::Scene3D(scene3d),
        ],
        version: 1.0,
    };
}

mod select_flight_document_scene {
    use super::*;

    #[test]
    fn selects_the_default_or_requested_scene_when_its_dimension_matches() {
        let document = create_document();

        let selection =
            select_flight_document_scene(&document, FlightDocumentSceneDimension::Scene3D, None);
        assert!(selection.refusal.is_none());
        assert!(
            selection
                .scene
                .is_some_and(|scene| std::ptr::eq(scene, &document.scenes[1]))
        );
        assert_eq!(selection.scene_index, Some(1));
        let selection =
            select_flight_document_scene(&document, FlightDocumentSceneDimension::Scene2D, Some(0));
        assert!(selection.refusal.is_none());
        assert!(
            selection
                .scene
                .is_some_and(|scene| std::ptr::eq(scene, &document.scenes[0]))
        );
        assert_eq!(selection.scene_index, Some(0));
    }

    #[test]
    fn refuses_invalid_containers_and_mismatched_dimensions() {
        let mut empty_document = create_document();
        empty_document.scenes.clear();

        let selection = select_flight_document_scene(
            &empty_document,
            FlightDocumentSceneDimension::Scene2D,
            None,
        );
        assert!(selection.scene.is_none());
        let empty = selection.refusal.expect("a refusal");
        assert_eq!(empty.path, "scenes");
        assert_eq!(empty.reason, FlightDocumentRefusalReason::ScenesEmpty);
        let document = create_document();
        let selection =
            select_flight_document_scene(&document, FlightDocumentSceneDimension::Scene2D, None);
        assert!(selection.scene.is_none());
        let mismatch = selection.refusal.expect("a refusal");
        assert_eq!(mismatch.path, "scenes[1].kind");
        assert_eq!(
            mismatch.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
    }
}
