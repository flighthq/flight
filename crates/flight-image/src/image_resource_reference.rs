use std::panic::{AssertUnwindSafe, resume_unwind};
use std::sync::{Arc, RwLock};

use flight_bitmap::{Bitmap, create_bitmap};
use flight_entity::{
    FlightError, Ref, Uint8Array, Unknown, allocate_entity, get_flight_error_kind_string,
    throw_range_error, unknown_from_panic, unknown_to_js_string,
};
use flight_image_codec::{
    HostImageDecodeCapabilities, ImageDecodeOptions, decode_image, decode_image_premultiplied,
};
use flight_resource::ResourceResolutionState;
use flight_stream::{AbortSignal, is_abort_signal_aborted, throw_if_aborted};
use flight_texture::{AlphaType, TextureSourceRef};
use futures::FutureExt;

use crate::types::{
    EmbeddedImageResourceReference, ExternalImageResourceReference, ImageBitmapCompositionResolver,
    ImageDecodeFallback, ImageResolverState, ImageResourceFailure, ImageResourceFailureKind,
    ImageResourceFetch, ImageResourceReference, ImageResourceReferenceKind,
    ImageResourceReferenceResolutionExplanation,
};

// flight-lint: allow(conform-params) Principal c0f9227c D23 keeps defining bytes while authored MIME and alpha fields are assigned after create
pub fn create_embedded_image_resource_reference(
    bytes: Ref<Box<Uint8Array>>,
) -> Ref<EmbeddedImageResourceReference> {
    let mut out: EmbeddedImageResourceReference = allocate_entity();
    initialize_embedded_image_resource_reference(&mut out, bytes);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 keeps the defining URI while authored basePath is assigned after create
pub fn create_external_image_resource_reference(
    uri: String,
) -> Ref<ExternalImageResourceReference> {
    let mut out: ExternalImageResourceReference = allocate_entity();
    initialize_external_image_resource_reference(&mut out, uri);
    return Arc::new(RwLock::new(out));
}

pub fn create_image_resource_failure(cause: &Unknown) -> Ref<ImageResourceFailure> {
    let mut out: ImageResourceFailure = allocate_entity();
    initialize_image_resource_failure(&mut out, cause);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 keeps defining bytes while authored MIME and alpha fields are assigned after initialize
pub fn initialize_embedded_image_resource_reference(
    out: &mut EmbeddedImageResourceReference,
    bytes: Ref<Box<Uint8Array>>,
) {
    out.alpha_type = AlphaType::Straight;
    out.bitmap_composition = None;
    out.bytes = bytes;
    out.failure = None;
    out.mime_type = None;
    out.state = ResourceResolutionState::Unresolved;
    out.textures = Vec::new();
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 keeps the defining URI while authored basePath is assigned after initialize
pub fn initialize_external_image_resource_reference(
    out: &mut ExternalImageResourceReference,
    uri: String,
) {
    out.base_path = None;
    out.failure = None;
    out.mime_type = None;
    out.state = ResourceResolutionState::Unresolved;
    out.textures = Vec::new();
    out.uri = uri;
}

// flight-lint: allow(conform-extra, conform-params) Principal c0f9227c D23 keeps the defining cause in the receiver-only canonical initializer
pub fn initialize_image_resource_failure(out: &mut ImageResourceFailure, cause: &Unknown) {
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
}

async fn decode_embedded_image_resource_reference(
    image_decode: &HostImageDecodeCapabilities,
    reference: &Ref<EmbeddedImageResourceReference>,
    signal: &AbortSignal,
    fallback_decode: Option<&ImageDecodeFallback>,
    state: &ImageResolverState,
) -> Option<Ref<Bitmap>> {
    let (alpha_type, has_composition, bytes, mime_type) = {
        let reference = reference.read().unwrap();
        (
            reference.alpha_type,
            reference.bitmap_composition.is_some(),
            reference.bytes.clone(),
            reference.mime_type.clone(),
        )
    };
    if has_composition && let Some(resolver) = &state.bitmap_composition_resolver {
        return resolver(image_decode, reference.clone(), signal.clone()).await;
    }
    throw_if_aborted(signal);
    let byte_values = bytes.read().unwrap().to_vec();
    let premultiplied = alpha_type == AlphaType::Premultiplied;
    let mut decoded = if premultiplied {
        decode_image_premultiplied(image_decode, &byte_values, mime_type.as_deref()).await
    } else {
        decode_image(image_decode, &byte_values, mime_type.as_deref()).await
    };
    if decoded.is_none()
        && let (Some(fallback_decode), Some(mime_type)) = (fallback_decode, mime_type)
    {
        let options = premultiplied.then_some(ImageDecodeOptions {
            premultiply_alpha: Some(true),
        });
        decoded = fallback_decode(bytes, mime_type, options).await;
    }
    throw_if_aborted(signal);
    let decoded = decoded?;
    let width = u32::try_from(decoded.width)
        .unwrap_or_else(|_| throw_range_error("Decoded image width exceeds u32"));
    let height = u32::try_from(decoded.height)
        .unwrap_or_else(|_| throw_range_error("Decoded image height exceeds u32"));
    let mut bitmap = create_bitmap(width, height, None);
    bitmap.alpha_type = alpha_type;
    bitmap.data = decoded.data;
    return Some(Arc::new(RwLock::new(bitmap)));
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

// flight-lint: allow(conform-params) Rust reserves the TS parameter name `ref`; D5 caller-owned state replaces the source module-global composition resolver
pub async fn resolve_image_resource_reference(
    image_decode: &HostImageDecodeCapabilities,
    reference: &ImageResourceReference,
    fetch: &ImageResourceFetch,
    signal: &AbortSignal,
    fallback_decode: Option<&ImageDecodeFallback>,
    state: &ImageResolverState,
) -> Option<TextureSourceRef> {
    match reference {
        ImageResourceReference::Embedded(value) => {
            let mut reference = value.reference.write().unwrap();
            reference.failure = None;
            reference.state = ResourceResolutionState::Loading;
        }
        ImageResourceReference::External(value) => {
            let mut reference = value.reference.write().unwrap();
            reference.failure = None;
            reference.state = ResourceResolutionState::Loading;
        }
    }
    let resolved = AssertUnwindSafe(async {
        return match reference {
            ImageResourceReference::Embedded(value) => {
                let source = decode_embedded_image_resource_reference(
                    image_decode,
                    &value.reference,
                    signal,
                    fallback_decode,
                    state,
                )
                .await?;
                Some(source as TextureSourceRef)
            }
            ImageResourceReference::External(value) => {
                let source = fetch(value.reference.clone(), signal.clone()).await?;
                Some(source as TextureSourceRef)
            }
        };
    })
    .catch_unwind()
    .await;
    let resolved = match resolved {
        Ok(resolved) => resolved,
        Err(payload) => {
            if is_abort_signal_aborted(signal) {
                match reference {
                    ImageResourceReference::Embedded(value) => {
                        value.reference.write().unwrap().state =
                            ResourceResolutionState::Unresolved;
                    }
                    ImageResourceReference::External(value) => {
                        value.reference.write().unwrap().state =
                            ResourceResolutionState::Unresolved;
                    }
                }
                resume_unwind(payload);
            }
            let cause = match payload.downcast::<Unknown>() {
                Ok(cause) => *cause,
                Err(payload) => unknown_from_panic(payload),
            };
            let failure = create_image_resource_failure(&cause);
            match reference {
                ImageResourceReference::Embedded(value) => {
                    let mut reference = value.reference.write().unwrap();
                    reference.failure = Some(failure);
                    reference.state = ResourceResolutionState::Failed;
                }
                ImageResourceReference::External(value) => {
                    let mut reference = value.reference.write().unwrap();
                    reference.failure = Some(failure);
                    reference.state = ResourceResolutionState::Failed;
                }
            }
            return None;
        }
    };
    let Some(source) = resolved else {
        let mut unavailable: ImageResourceFailure = allocate_entity();
        unavailable.kind = ImageResourceFailureKind::Unavailable;
        unavailable.message = "Image resource unavailable".to_string();
        unavailable.name = None;
        let failure = Arc::new(RwLock::new(unavailable));
        match reference {
            ImageResourceReference::Embedded(value) => {
                let mut reference = value.reference.write().unwrap();
                reference.failure = Some(failure);
                reference.state = ResourceResolutionState::Failed;
            }
            ImageResourceReference::External(value) => {
                let mut reference = value.reference.write().unwrap();
                reference.failure = Some(failure);
                reference.state = ResourceResolutionState::Failed;
            }
        }
        return None;
    };
    match reference {
        ImageResourceReference::Embedded(value) => {
            value.reference.write().unwrap().state = ResourceResolutionState::Resolved;
        }
        ImageResourceReference::External(value) => {
            value.reference.write().unwrap().state = ResourceResolutionState::Resolved;
        }
    }
    return Some(source);
}
