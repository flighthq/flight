//! Validated scene selection shared by both dimension entrypoints (TS
//! `sceneDocumentMaterializationSelection.ts`).

// flight-lint: allow-file(contract-vocabulary) i64 scene indices project JS safe integers (|n| <= 2^53); the selection borrows the document's own scene entry

use crate::scene_document_refusal::{create_document_refusal, create_scene_refusal};
use crate::types::*;

/// The selected scene and its index, or the refusal naming why none was selected (TS
/// `FlightDocumentSceneSelection`): exactly one of `refusal` and `scene` is present, and
/// `scene_index` accompanies `scene`.
pub struct FlightDocumentSceneSelection<'a> {
    pub refusal: Option<FlightDocumentRefusalExplanation>,
    pub scene: Option<&'a FlightDocumentScene>,
    pub scene_index: Option<i64>,
}

fn is_scene_index(value: i64, length: usize) -> bool {
    return value >= 0 && (value as u64) < length as u64;
}

fn refuse_selection(
    refusal: FlightDocumentRefusalExplanation,
) -> FlightDocumentSceneSelection<'static> {
    return FlightDocumentSceneSelection {
        refusal: Some(refusal),
        scene: None,
        scene_index: None,
    };
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
        return refuse_selection(refusal);
    }
    let scenes = &document.scenes;
    if scenes.is_empty() {
        return refuse_selection(create_document_refusal(
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
        return refuse_selection(refusal);
    }
    if !is_scene_index(requested_scene_index, scenes.len()) {
        return refuse_selection(create_scene_refusal(
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
        return refuse_selection(create_scene_refusal(
            FlightDocumentRefusalReason::StructureInvalid,
            requested_scene_index,
            "kind",
        ));
    }
    return FlightDocumentSceneSelection {
        refusal: None,
        scene: Some(scene),
        scene_index: Some(requested_scene_index),
    };
}
