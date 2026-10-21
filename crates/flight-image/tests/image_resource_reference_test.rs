use std::sync::{Arc, RwLock};

use flight_entity::{FlightError, FlightErrorKind, Ref, Uint8Array, Unknown, allocate_entity};
use flight_image::contract::*;
use flight_resource::ResourceResolutionState;
use flight_texture::AlphaType;

fn bytes(values: &[u8]) -> Ref<Box<Uint8Array>> {
    return Arc::new(RwLock::new(values.to_vec().into_boxed_slice()));
}

fn embedded_reference(reference: Ref<EmbeddedImageResourceReference>) -> ImageResourceReference {
    return ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue { reference });
}

fn external_reference(reference: Ref<ExternalImageResourceReference>) -> ImageResourceReference {
    return ImageResourceReference::External(ExternalImageResourceReferenceValue { reference });
}

mod create_embedded_image_resource_reference {
    use super::*;

    #[test]
    fn borrows_bytes_and_applies_source_defaults() {
        let payload = bytes(&[1, 2, 3, 4]);
        let reference = create_embedded_image_resource_reference(payload.clone(), None, None);
        let reference = reference.read().unwrap();
        assert!(Arc::ptr_eq(&reference.bytes, &payload));
        assert_eq!(reference.alpha_type, AlphaType::Straight);
        assert_eq!(reference.mime_type, None);
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
        assert!(reference.failure.is_none());
        assert!(reference.textures.is_empty());
    }

    #[test]
    fn retains_explicit_mime_and_alpha_type() {
        let reference = create_embedded_image_resource_reference(
            bytes(&[1]),
            Some("image/png".to_string()),
            Some(AlphaType::Premultiplied),
        );
        let reference = reference.read().unwrap();
        assert_eq!(reference.alpha_type, AlphaType::Premultiplied);
        assert_eq!(reference.mime_type.as_deref(), Some("image/png"));
    }
}

mod create_external_image_resource_reference {
    use super::*;

    #[test]
    fn retains_uri_and_optional_base_path() {
        let reference = create_external_image_resource_reference(
            "atlas.png".to_string(),
            Some("/assets".to_string()),
        );
        let reference = reference.read().unwrap();
        assert_eq!(reference.uri, "atlas.png");
        assert_eq!(reference.base_path.as_deref(), Some("/assets"));
        assert_eq!(reference.mime_type, None);
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
        assert!(reference.failure.is_none());
        assert!(reference.textures.is_empty());
    }
}

mod create_image_resource_failure {
    use super::*;

    #[test]
    fn retains_flight_error_name_and_message() {
        let cause: Unknown = Some(Arc::new(FlightError {
            kind: FlightErrorKind::TypeError,
            message: "bad magic".to_string(),
        }));
        let failure = create_image_resource_failure(&cause);
        let failure = failure.read().unwrap();
        assert_eq!(failure.kind, ImageResourceFailureKind::Error);
        assert_eq!(failure.message, "bad magic");
        assert_eq!(failure.name.as_deref(), Some("TypeError"));
    }

    #[test]
    fn stringifies_non_error_causes_without_a_name() {
        let cause: Unknown = Some(Arc::new("exploded".to_string()));
        let failure = create_image_resource_failure(&cause);
        let failure = failure.read().unwrap();
        assert_eq!(failure.message, "exploded");
        assert_eq!(failure.name, None);
    }
}

mod explain_image_resource_reference_resolution {
    use super::*;

    #[test]
    fn detaches_failure_and_marks_only_failed_as_retryable() {
        let reference = create_embedded_image_resource_reference(bytes(&[1]), None, None);
        let failure = {
            let mut value: ImageResourceFailure = allocate_entity();
            value.kind = ImageResourceFailureKind::Unavailable;
            value.message = "missing".to_string();
            Arc::new(RwLock::new(value))
        };
        {
            let mut value = reference.write().unwrap();
            value.failure = Some(failure.clone());
            value.state = ResourceResolutionState::Failed;
        }
        let explanation =
            explain_image_resource_reference_resolution(&embedded_reference(reference));
        let detached = explanation.failure.unwrap();
        assert!(!Arc::ptr_eq(&detached, &failure));
        assert_eq!(detached.read().unwrap().message, "missing");
        assert_eq!(explanation.kind, ImageResourceReferenceKind::Embedded);
        assert!(explanation.retryable);
        assert_eq!(explanation.state, ResourceResolutionState::Failed);
    }
}

mod initialize_embedded_image_resource_reference {
    use super::*;

    #[test]
    fn resets_all_reference_lifecycle_fields() {
        let payload = bytes(&[9]);
        let mut out: EmbeddedImageResourceReference = allocate_entity();
        out.state = ResourceResolutionState::Failed;
        initialize_embedded_image_resource_reference(
            &mut out,
            payload.clone(),
            Some("image/webp".to_string()),
            Some(AlphaType::Premultiplied),
        );
        assert!(Arc::ptr_eq(&out.bytes, &payload));
        assert_eq!(out.state, ResourceResolutionState::Unresolved);
        assert!(out.failure.is_none());
        assert!(out.bitmap_composition.is_none());
        assert!(out.textures.is_empty());
    }
}

mod initialize_external_image_resource_reference {
    use super::*;

    #[test]
    fn resets_all_reference_lifecycle_fields() {
        let mut out: ExternalImageResourceReference = allocate_entity();
        out.state = ResourceResolutionState::Failed;
        initialize_external_image_resource_reference(
            &mut out,
            "image.png".to_string(),
            Some("/base".to_string()),
        );
        assert_eq!(out.uri, "image.png");
        assert_eq!(out.base_path.as_deref(), Some("/base"));
        assert_eq!(out.state, ResourceResolutionState::Unresolved);
        assert!(out.failure.is_none());
        assert!(out.textures.is_empty());
    }
}

mod register_image_bitmap_composition_resolver {
    use super::*;

    #[test]
    fn last_registration_wins_and_none_clears_the_slot() {
        let mut state = create_image_resolver_state();
        let resolver: ImageBitmapCompositionResolver = Arc::new(|_, _, _| {
            return Box::pin(async { None });
        });
        register_image_bitmap_composition_resolver(&mut state, Some(resolver));
        assert!(format!("{state:?}").contains("has_bitmap_composition_resolver: true"));
        register_image_bitmap_composition_resolver(&mut state, None);
        assert!(format!("{state:?}").contains("has_bitmap_composition_resolver: false"));
    }
}

mod reset_failed_image_resource_reference {
    use super::*;

    fn reference_state(reference: &ImageResourceReference) -> ResourceResolutionState {
        return match reference {
            ImageResourceReference::Embedded(value) => value.reference.read().unwrap().state,
            ImageResourceReference::External(value) => value.reference.read().unwrap().state,
        };
    }

    #[test]
    fn clears_a_failed_reference_back_to_unresolved() {
        let reference = create_external_image_resource_reference("a.png".to_string(), None);
        reference.write().unwrap().state = ResourceResolutionState::Failed;
        let reference = external_reference(reference);
        assert!(reset_failed_image_resource_reference(&reference));
        assert_eq!(
            reference_state(&reference),
            ResourceResolutionState::Unresolved
        );
    }

    #[test]
    fn leaves_a_resolved_reference_untouched() {
        let reference = create_external_image_resource_reference("a.png".to_string(), None);
        reference.write().unwrap().state = ResourceResolutionState::Resolved;
        let reference = external_reference(reference);
        assert!(!reset_failed_image_resource_reference(&reference));
        assert_eq!(
            reference_state(&reference),
            ResourceResolutionState::Resolved
        );
    }
}
