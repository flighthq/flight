use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_scene2d::{Scene2DSlotReference, create_display_object};

use crate::types::Scene2DDocument;

/// Allocates an empty document; importers assign the root and authored sidecars after create.
// flight-lint: allow(conform-params) D23 (B) zero-field create: callers assign document fields after canonical entity construction
pub fn create_scene2d_document() -> Ref<Scene2DDocument> {
    let mut out: Scene2DDocument = allocate_entity();
    initialize_scene2d_document(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates an empty slot; importers assign its name, target, linkage and required flag after create.
// flight-lint: allow(conform-params) D23 (B) zero-field create: callers assign slot fields after canonical entity construction
pub fn create_scene2d_slot_reference() -> Ref<Scene2DSlotReference> {
    let mut out: Scene2DSlotReference = allocate_entity();
    initialize_scene2d_slot_reference(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Resets a document to its empty canonical construction state.
// flight-lint: allow(conform-params) D23 (B) zero-field initializer: callers assign document fields afterward
pub fn initialize_scene2d_document(out: &mut Scene2DDocument) {
    out.audio_resources.clear();
    out.background_color = None;
    out.image_resources.clear();
    out.root = create_display_object(None);
    out.slots.clear();
    out.source_kind = None;
}

/// Resets a slot to its empty canonical construction state.
// flight-lint: allow(conform-params) D23 (B) zero-field initializer: callers assign slot fields afterward
pub fn initialize_scene2d_slot_reference(out: &mut Scene2DSlotReference) {
    out.content = None;
    out.linkage = None;
    out.name.clear();
    out.required = false;
    out.target = create_display_object(None);
}
