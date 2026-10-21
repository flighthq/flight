//! Validated scene selection shared by both dimension entrypoints (TS
//! `sceneDocumentMaterializationSelection.ts`).

use crate::scene_document_refusal::{create_document_refusal, create_scene_refusal};
use crate::types::*;

/// The selected scene and its index, or the refusal naming why none was selected (TS
/// `FlightDocumentSceneSelection`).
pub enum FlightDocumentSceneSelection<'a> {
    Refusal(FlightDocumentRefusalExplanation),
    Scene(&'a FlightDocumentScene, i64),
}

/// Validates the runtime container once, then selects `requested_scene_index` (the default scene
/// when `None`) of `dimension` (TS `selectFlightDocumentScene`). Both dimension entrypoints agree on
/// empty/default selection and on scene-qualified paths.
pub fn select_flight_document_scene(
    document: &FlightDocument,
    dimension: FlightDocumentSceneDimension,
    requested_scene_index: Option<i64>,
) -> FlightDocumentSceneSelection<'_> {
    let requested_scene_index = requested_scene_index.unwrap_or(document.default_scene);
    if document.version != 1.0 {
        let mut refusal =
            create_document_refusal(FlightDocumentRefusalReason::VersionUnsupported, "version");
        refusal.version = Some(document.version);
        return FlightDocumentSceneSelection::Refusal(refusal);
    }
    let scenes = &document.scenes;
    if scenes.is_empty() {
        return FlightDocumentSceneSelection::Refusal(create_document_refusal(
            FlightDocumentRefusalReason::ScenesEmpty,
            "scenes",
        ));
    }
    if !is_scene_index(document.default_scene, scenes.len()) {
        let mut refusal = create_document_refusal(
            FlightDocumentRefusalReason::DefaultSceneOutOfRange,
            "defaultScene",
        );
        refusal.actual = Some(document.default_scene);
        return FlightDocumentSceneSelection::Refusal(refusal);
    }
    if !is_scene_index(requested_scene_index, scenes.len()) {
        return FlightDocumentSceneSelection::Refusal(create_scene_refusal(
            FlightDocumentRefusalReason::StructureInvalid,
            requested_scene_index,
            "",
        ));
    }
    let scene = &scenes[requested_scene_index as usize];
    let matches = match scene {
        FlightDocumentScene::Scene2D(_) => dimension == FlightDocumentSceneDimension::Scene2D,
        FlightDocumentScene::Scene3D(_) => dimension == FlightDocumentSceneDimension::Scene3D,
    };
    if !matches {
        return FlightDocumentSceneSelection::Refusal(create_scene_refusal(
            FlightDocumentRefusalReason::StructureInvalid,
            requested_scene_index,
            "kind",
        ));
    }
    return FlightDocumentSceneSelection::Scene(scene, requested_scene_index);
}

fn is_scene_index(value: i64, length: usize) -> bool {
    return value >= 0 && (value as u64) < length as u64;
}
