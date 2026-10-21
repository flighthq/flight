use std::sync::{Arc, RwLock};

use flight_entity::{
    FlightError, Ref, Uint8Array, Unknown, allocate_entity, get_flight_error_kind_string,
    unknown_to_js_string,
};
use flight_resource::ResourceResolutionState;
use flight_texture::AlphaType;

use crate::types::{
    EmbeddedImageResourceReference, ExternalImageResourceReference, ImageBitmapCompositionResolver,
    ImageResolverState, ImageResourceFailure, ImageResourceFailureKind, ImageResourceReference,
    ImageResourceReferenceKind, ImageResourceReferenceResolutionExplanation,
};

pub fn create_embedded_image_resource_reference(
    bytes: Ref<Box<Uint8Array>>,
    mime_type: Option<String>,
    alpha_type: Option<AlphaType>,
) -> Ref<EmbeddedImageResourceReference> {
    let mut out: EmbeddedImageResourceReference = allocate_entity();
    initialize_embedded_image_resource_reference(&mut out, bytes, mime_type, alpha_type);
    return Arc::new(RwLock::new(out));
}

pub fn create_external_image_resource_reference(
    uri: String,
    base_path: Option<String>,
) -> Ref<ExternalImageResourceReference> {
    let mut out: ExternalImageResourceReference = allocate_entity();
    initialize_external_image_resource_reference(&mut out, uri, base_path);
    return Arc::new(RwLock::new(out));
}

pub fn create_image_resource_failure(cause: &Unknown) -> Ref<ImageResourceFailure> {
    let mut out: ImageResourceFailure = allocate_entity();
    out.kind = ImageResourceFailureKind::Error;
    if let Some(error) = cause
        .as_ref()
        .and_then(|cause| cause.downcast_ref::<FlightError>())
    {
        out.message = error.message.clone();
        out.name = Some(get_flight_error_kind_string(error.kind).to_string());
    } else {
        out.message = unknown_to_js_string(cause);
        out.name = None;
    }
    return Arc::new(RwLock::new(out));
}

pub fn initialize_embedded_image_resource_reference(
    out: &mut EmbeddedImageResourceReference,
    bytes: Ref<Box<Uint8Array>>,
    mime_type: Option<String>,
    alpha_type: Option<AlphaType>,
) {
    out.alpha_type = alpha_type.unwrap_or(AlphaType::Straight);
    out.bitmap_composition = None;
    out.bytes = bytes;
    out.failure = None;
    out.mime_type = mime_type;
    out.state = ResourceResolutionState::Unresolved;
    out.textures = Vec::new();
}

pub fn initialize_external_image_resource_reference(
    out: &mut ExternalImageResourceReference,
    uri: String,
    base_path: Option<String>,
) {
    out.base_path = base_path;
    out.failure = None;
    out.mime_type = None;
    out.state = ResourceResolutionState::Unresolved;
    out.textures = Vec::new();
    out.uri = uri;
}

// flight-lint: allow(conform-params) Rust reserves the TS parameter name `ref`; `reference` is the exact semantic rename
pub fn explain_image_resource_reference_resolution(
    reference: &ImageResourceReference,
) -> ImageResourceReferenceResolutionExplanation {
    let (failure, kind, state) = match reference {
        ImageResourceReference::Embedded(value) => {
            let reference = value.reference.read().unwrap();
            (
                reference.failure.clone(),
                ImageResourceReferenceKind::Embedded,
                reference.state,
            )
        }
        ImageResourceReference::External(value) => {
            let reference = value.reference.read().unwrap();
            (
                reference.failure.clone(),
                ImageResourceReferenceKind::External,
                reference.state,
            )
        }
    };
    let failure = failure.map(|failure| {
        let failure = failure.read().unwrap();
        let mut out: ImageResourceFailure = allocate_entity();
        out.kind = failure.kind;
        out.message = failure.message.clone();
        out.name = failure.name.clone();
        Arc::new(RwLock::new(out))
    });
    return ImageResourceReferenceResolutionExplanation {
        failure,
        kind,
        retryable: state == ResourceResolutionState::Failed,
        state,
    };
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the source module-global resolver
pub fn register_image_bitmap_composition_resolver(
    state: &mut ImageResolverState,
    resolver: Option<ImageBitmapCompositionResolver>,
) {
    state.bitmap_composition_resolver = resolver;
}

// flight-lint: allow(conform-params) Rust reserves the TS parameter name `ref`; `reference` is the exact semantic rename
pub fn reset_failed_image_resource_reference(reference: &ImageResourceReference) -> bool {
    match reference {
        ImageResourceReference::Embedded(value) => {
            let mut reference = value.reference.write().unwrap();
            if reference.state != ResourceResolutionState::Failed {
                return false;
            }
            reference.failure = None;
            reference.state = ResourceResolutionState::Unresolved;
        }
        ImageResourceReference::External(value) => {
            let mut reference = value.reference.write().unwrap();
            if reference.state != ResourceResolutionState::Failed {
                return false;
            }
            reference.failure = None;
            reference.state = ResourceResolutionState::Unresolved;
        }
    }
    return true;
}
