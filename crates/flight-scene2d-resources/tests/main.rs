use std::sync::{Arc, RwLock};

use flight_scene2d_resources::contract::*;

fn guard_state() -> Scene2DResourceFailureGuardStateRef {
    return Arc::new(RwLock::new(Scene2DResourceFailureGuardState {
        enabled: false,
        guard: None,
    }));
}

#[path = "built_in_scene2d_document_importers_test.rs"]
mod flight_scene2d_resources_built_in_scene2d_document_importers_test;
#[path = "enable_scene2d_resource_failure_guards_test.rs"]
mod flight_scene2d_resources_enable_scene2d_resource_failure_guards_test;
#[path = "load_scene2d_audio_resources_test.rs"]
mod flight_scene2d_resources_load_scene2d_audio_resources_test;
#[path = "load_scene2d_image_resources_test.rs"]
mod flight_scene2d_resources_load_scene2d_image_resources_test;
#[path = "resolve_scene2d_resources_test.rs"]
mod flight_scene2d_resources_resolve_scene2d_resources_test;
#[path = "scene2d_document_importer_registry_test.rs"]
mod flight_scene2d_resources_scene2d_document_importer_registry_test;
#[path = "scene2d_document_source_test.rs"]
mod flight_scene2d_resources_scene2d_document_source_test;
#[path = "scene2d_document_test.rs"]
mod flight_scene2d_resources_scene2d_document_test;
#[path = "scene2d_resource_diagnostics_test.rs"]
mod flight_scene2d_resources_scene2d_resource_diagnostics_test;
#[path = "scene2d_slot_reference_test.rs"]
mod flight_scene2d_resources_scene2d_slot_reference_test;
