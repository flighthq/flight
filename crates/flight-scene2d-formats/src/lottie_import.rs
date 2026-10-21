use flight_importdiagnostics::contract::ImportDiagnostic;
use serde_json::Value;

use crate::lottie_document::create_scene2d_from_lottie_document_with_registry;
use crate::lottie_layer_handlers::LOTTIE_ALL_LAYER_HANDLERS;
use crate::lottie_mask_handlers::LOTTIE_ALL_MASK_HANDLERS;
use crate::lottie_shape_item_handlers::LOTTIE_ALL_SHAPE_ITEM_HANDLERS;
use crate::types::*;

// flight-lint: allow(contract-vocabulary) the source union is either an open Lottie JSON object or its JSON string encoding
pub fn create_scene2d_from_lottie_document(
    source: &Value,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    options: Option<&LottieDocumentImportOptions>,
) -> LottieDocumentImportResult {
    let registry = LottieRegistry {
        layer_handlers: options
            .and_then(|options| options.layer_handlers.clone())
            .unwrap_or_else(default_lottie_layer_handlers),
        mask_handlers: options
            .and_then(|options| options.mask_handlers.clone())
            .unwrap_or_else(default_lottie_mask_handlers),
        shape_item_handlers: options
            .and_then(|options| options.shape_item_handlers.clone())
            .unwrap_or_else(default_lottie_shape_item_handlers),
    };
    return create_scene2d_from_lottie_document_with_registry(
        source,
        &registry,
        diagnostics,
        options,
    );
}

fn default_lottie_layer_handlers() -> Vec<LottieLayerHandlerEntry> {
    return [
        (LOTTIE_LAYER_KIND_PRECOMPOSITION, 2),
        (LOTTIE_LAYER_KIND_SOLID, 4),
        (LOTTIE_LAYER_KIND_IMAGE, 0),
        (LOTTIE_LAYER_KIND_NULL, 1),
        (LOTTIE_LAYER_KIND_SHAPE, 3),
        (LOTTIE_LAYER_KIND_TEXT, 5),
    ]
    .into_iter()
    .map(|(kind, index)| LottieLayerHandlerEntry {
        handle: LOTTIE_ALL_LAYER_HANDLERS[index].clone(),
        kind,
    })
    .collect();
}

fn default_lottie_mask_handlers() -> Vec<LottieMaskHandlerEntry> {
    return vec![LottieMaskHandlerEntry {
        handle: LOTTIE_ALL_MASK_HANDLERS[0].clone(),
        kind: LOTTIE_MASK_KIND_ADDITIVE.to_string(),
    }];
}

fn default_lottie_shape_item_handlers() -> Vec<LottieShapeItemHandlerEntry> {
    return [
        (LOTTIE_SHAPE_ITEM_KIND_ELLIPSE, 0),
        (LOTTIE_SHAPE_ITEM_KIND_FILL, 1),
        (LOTTIE_SHAPE_ITEM_KIND_GRADIENT_FILL, 2),
        (LOTTIE_SHAPE_ITEM_KIND_GRADIENT_STROKE, 3),
        (LOTTIE_SHAPE_ITEM_KIND_PATH, 4),
        (LOTTIE_SHAPE_ITEM_KIND_POLYSTAR, 5),
        (LOTTIE_SHAPE_ITEM_KIND_RECTANGLE, 6),
        (LOTTIE_SHAPE_ITEM_KIND_STROKE, 7),
        (LOTTIE_SHAPE_ITEM_KIND_TRIM_PATH, 8),
    ]
    .into_iter()
    .map(|(kind, index)| LottieShapeItemHandlerEntry {
        handle: LOTTIE_ALL_SHAPE_ITEM_HANDLERS[index].clone(),
        kind: kind.to_string(),
    })
    .collect();
}
