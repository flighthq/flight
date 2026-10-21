//! Flight scene documents (TS `@flighthq/scene-document`): the closed YAML subset and text codec,
//! logical validation and refusal diagnostics, resource dependencies, and 2D/3D scene
//! materialization with inert interactive-state and layout bindings.
//!
//! Construction initializers and the string tables are available through `contract`.
//! ```compile_fail
//! use flight_scene_document::initialize_flight_document_refusal_explanation;
//! ```
//! ```compile_fail
//! use flight_scene_document::initialize_document_refusal;
//! ```
//! ```compile_fail
//! use flight_scene_document::initialize_flight_document_from_scene2d;
//! ```

mod flight_document_light;
mod flight_document_resource_dependencies;
mod flight_document_text;
mod scene_document_interactive_state_bindings;
mod scene_document_layout_bindings;
mod scene_document_materialization_selection;
mod scene_document_refusal;
mod scene_document_scene2d_materialization;
mod scene_document_strings;
mod scene_document_yaml_subset;
mod sugar;
mod types;

pub mod contract;

// Public lane: the exports of the pinned TS `index.ts` (per-module `export *`, the named exports)
// and the public document types. Construction initializers and string tables stay under
// `contract`.
pub use contract::{
    FlightDocument, FlightDocumentFieldSchema, FlightDocumentFieldValidator, FlightDocumentFields,
    FlightDocumentInteractiveState, FlightDocumentInteractiveStateBinding,
    FlightDocumentInteractiveStateBindingLookup, FlightDocumentInteractiveStateExtensionDescriptor,
    FlightDocumentInteractiveStateExtensionFactory, FlightDocumentInteractiveStateExtensionSchema,
    FlightDocumentInteractiveStateExtensionSupport, FlightDocumentInteractiveStateMetadata,
    FlightDocumentInteractiveStateProperty, FlightDocumentInteractiveStateTransitionDescriptor,
    FlightDocumentInteractiveStateTransitionFactory,
    FlightDocumentInteractiveStateTransitionSchema, FlightDocumentInteractiveStateValue,
    FlightDocumentInteractiveStates, FlightDocumentLayoutBinding, FlightDocumentLayoutDescriptor,
    FlightDocumentLayoutNode, FlightDocumentLayoutTree, FlightDocumentLightDescriptor,
    FlightDocumentMaterializedNodes, FlightDocumentNode, FlightDocumentNodeFactory,
    FlightDocumentNodeFieldWriter, FlightDocumentNodeSchema, FlightDocumentRefusalExplanation,
    FlightDocumentRefusalReason, FlightDocumentResourceDescriptor, FlightDocumentResourceLookup,
    FlightDocumentResourceResolver, FlightDocumentResourceResolverRegistry,
    FlightDocumentResourceSchema, FlightDocumentScalar, FlightDocumentScene, FlightDocumentScene2D,
    FlightDocumentScene2DMaterialization, FlightDocumentScene3D,
    FlightDocumentScene3DMaterialization, FlightDocumentSceneDimension,
    FlightDocumentSceneSelection, FlightDocumentSchemaRegistry, FlightDocumentText,
    FlightDocumentToken, FlightDocumentTokenResolution, FlightDocumentTokenResolver,
    FlightDocumentTokenResolverRegistry, FlightDocumentTokenValues, FlightDocumentValue,
    FlightDocumentWrittenNodes, NodeInteractiveStateBinding, NodeInteractiveStateBindingRuntime,
    NodeInteractiveStateExplanation, NodeInteractiveStateExtensionApply,
    NodeInteractiveStateExtensionCapture, NodeInteractiveStateExtensionDispose,
    NodeInteractiveStateExtensionRuntime, NodeInteractiveStateFlags, NodeInteractiveStateProperty,
    NodeInteractiveStateRefusalReason, NodeInteractiveStateTransition,
    NodeInteractiveStateTransitionApply, NodeInteractiveStateTransitionRequest,
    NodeInteractiveStateTransitionRun, NodeInteractiveStateTransitionValue,
    SceneDocumentYamlSubsetMapping, SceneDocumentYamlSubsetRefusal, SceneDocumentYamlSubsetResult,
    SceneDocumentYamlSubsetValue,
};
pub use contract::{
    assert_all_interactive_state_bindings_used, check_flight_document_fields,
    check_flight_document_interactive_states, check_flight_document_layout_targets,
    check_flight_document_node_fields, check_unregistered_node_kinds,
    check_unregistered_node_kinds_from_raw, create_document_refusal,
    create_flight_document_from_scene2d, create_flight_document_layout_bindings,
    create_flight_document_scene2d_materialization,
    create_flight_document_scene2d_materialization_from_text,
    create_interactive_state_binding_lookup, create_scene_refusal, explain_flight_document_refusal,
    explain_flight_document_refusal_from_text, explain_flight_document_text,
    format_flight_document_text, get_flight_document_resource_dependencies,
    is_interactive_state_binding_target_supported, parse_flight_document_text,
    parse_scene_document_yaml_subset, read_interactive_state_binding_metadata,
    select_flight_document_scene, write_flight_document_layout_bindings,
};
