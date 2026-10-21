//! Flight scene documents (TS `@flighthq/scene-document`): the closed YAML subset and text codec,
//! logical validation and refusal diagnostics, resource dependencies, and 2D/3D scene
//! materialization with inert interactive-state and layout bindings.

mod flight_document_light;
mod flight_document_resource_dependencies;
mod flight_document_text;
mod scene_document_interactive_state_bindings;
mod scene_document_layout_bindings;
mod scene_document_materialization_selection;
mod scene_document_refusal;
mod scene_document_strings;
mod scene_document_yaml_subset;
mod types;

pub mod contract;
