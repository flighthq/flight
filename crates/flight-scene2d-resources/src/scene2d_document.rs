use std::sync::{Arc, RwLock};

use flight_audio::AudioResourceReference;
use flight_entity::{Ref, allocate_entity};
use flight_image::ImageResourceReference;
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
    let out_audio_resources: &mut Vec<AudioResourceReference> = &mut out.audio_resources;
    out_audio_resources.clear();
    out.background_color = None;
    let out_image_resources: &mut Vec<ImageResourceReference> = &mut out.image_resources;
    out_image_resources.clear();
    out.root = create_display_object();
    let out_slots: &mut Vec<Ref<Scene2DSlotReference>> = &mut out.slots;
    out_slots.clear();
    out.source_kind = None;
}

/// Resets a slot to its empty canonical construction state.
// flight-lint: allow(conform-params) D23 (B) zero-field initializer: callers assign slot fields afterward
pub fn initialize_scene2d_slot_reference(out: &mut Scene2DSlotReference) {
    out.content = None;
    out.linkage = None;
    let out_name: &mut String = &mut out.name;
    out_name.clear();
    out.required = false;
    out.target = create_display_object();
}
