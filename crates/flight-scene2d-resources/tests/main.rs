use std::sync::{Arc, RwLock};

use flight_scene2d_resources::contract::*;

fn guard_state() -> Scene2DResourceFailureGuardStateRef {
    return Arc::new(RwLock::new(Scene2DResourceFailureGuardState {
        enabled: false,
        guard: None,
    }));
}

mod built_in_scene2d_document_importers_test;
mod enable_scene2d_resource_failure_guards_test;
mod load_scene2d_audio_resources_test;
mod load_scene2d_image_resources_test;
mod resolve_scene2d_resources_test;
mod scene2d_document_importer_registry_test;
mod scene2d_document_source_test;
mod scene2d_document_test;
mod scene2d_resource_diagnostics_test;
mod scene2d_slot_reference_test;
