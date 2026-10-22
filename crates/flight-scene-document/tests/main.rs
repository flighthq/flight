// Integration tests for flight-scene-document.
mod support;

#[path = "flight_document_resource_dependencies_test.rs"]
mod flight_scene_document_flight_document_resource_dependencies_test;
#[path = "flight_document_text_test.rs"]
mod flight_scene_document_flight_document_text_test;
#[path = "scene_document_interactive_state_bindings_test.rs"]
mod flight_scene_document_scene_document_interactive_state_bindings_test;
#[path = "scene_document_layout_bindings_test.rs"]
mod flight_scene_document_scene_document_layout_bindings_test;
#[path = "scene_document_materialization_selection_test.rs"]
mod flight_scene_document_scene_document_materialization_selection_test;
#[path = "scene_document_multi_scene_materialization_test.rs"]
mod flight_scene_document_scene_document_multi_scene_materialization_test;
#[path = "scene_document_refusal_test.rs"]
mod flight_scene_document_scene_document_refusal_test;
#[path = "scene_document_scene2d_materialization_test.rs"]
mod flight_scene_document_scene_document_scene2d_materialization_test;
#[path = "scene_document_scene3d_materialization_test.rs"]
mod flight_scene_document_scene_document_scene3d_materialization_test;
#[path = "scene_document_strings_test.rs"]
mod flight_scene_document_scene_document_strings_test;
#[path = "scene_document_yaml_subset_test.rs"]
mod flight_scene_document_scene_document_yaml_subset_test;
