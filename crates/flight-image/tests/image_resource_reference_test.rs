use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{FlightError, FlightErrorKind, Ref, Uint8Array, Unknown, allocate_entity};
use flight_image::contract::*;
use flight_image_codec::{
    DecodedImage, HostImageDecodeCapabilities, HostImageDecodeFormatCapability, ImageDecodeOptions,
};
use flight_resource::ResourceResolutionState;
use flight_stream::{abort_controller, create_abort_controller};
use flight_texture::{AlphaType, TextureSource, TextureSourceRef};

fn bytes(values: &[u8]) -> Ref<Box<Uint8Array>> {
    return Arc::new(RwLock::new(values.to_vec().into_boxed_slice()));
}

fn embedded_reference(reference: Ref<EmbeddedImageResourceReference>) -> ImageResourceReference {
    return ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue { reference });
}

fn external_reference(reference: Ref<ExternalImageResourceReference>) -> ImageResourceReference {
    return ImageResourceReference::External(ExternalImageResourceReferenceValue { reference });
}

fn empty_capabilities() -> HostImageDecodeCapabilities {
    return HostImageDecodeCapabilities {
        avif: None,
        bmp: None,
        gif: None,
        jpeg: None,
        png: None,
        webp: None,
    };
}

fn image_source() -> Arc<flight_bitmap::HostImageSource> {
    return Arc::new(flight_bitmap::HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(()),
    });
}

fn same_texture_source_ref<T: TextureSource + 'static>(
    actual: &TextureSourceRef,
    expected: &Ref<T>,
) -> bool {
    return Arc::as_ptr(actual) as *const () == Arc::as_ptr(expected) as *const ();
}

fn unused_fetch() -> ImageResourceFetch {
    return Arc::new(|_, _| Box::pin(async { None }));
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

mod resolve_image_resource_reference {
    use super::*;

    fn decoded(width: usize, height: usize) -> DecodedImage {
        return DecodedImage {
            data: vec![0x11, 0x22, 0x33, 0x44].into_boxed_slice(),
            height,
            width,
        };
    }

    fn png_capabilities(
        calls: Arc<Mutex<Vec<(Vec<u8>, Option<ImageDecodeOptions>)>>>,
    ) -> HostImageDecodeCapabilities {
        return HostImageDecodeCapabilities {
            avif: None,
            bmp: None,
            gif: None,
            jpeg: None,
            png: Some(HostImageDecodeFormatCapability {
                decode: Arc::new(move |bytes, options| {
                    calls.lock().unwrap().push((bytes, options));
                    return Box::pin(async { decoded(1, 1) });
                }),
            }),
            webp: None,
        };
    }

    #[test]
    fn clears_a_prior_failure_when_a_reference_is_retried() {
        let reference = create_external_image_resource_reference("flaky.png".to_string(), None);
        {
            let mut reference = reference.write().unwrap();
            reference.failure = Some(create_image_resource_failure(&Some(Arc::new(
                "old".to_string(),
            ))));
            reference.state = ResourceResolutionState::Failed;
        }
        let resource = create_image_resource(image_source(), &create_image_resolver_state());
        let fetch: ImageResourceFetch = Arc::new(move |_, _| {
            let resource = resource.clone();
            return Box::pin(async move { Some(resource) });
        });
        let reference = external_reference(reference.clone());
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &empty_capabilities(),
            &reference,
            &fetch,
            &create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ));
        assert!(result.is_some());
        let reference = match reference {
            ImageResourceReference::External(value) => value.reference,
            _ => unreachable!(),
        };
        let reference = reference.read().unwrap();
        assert!(reference.failure.is_none());
        assert_eq!(reference.state, ResourceResolutionState::Resolved);
    }

    #[test]
    fn converts_an_oversized_decoded_dimension_to_a_range_failure() {
        let capabilities = HostImageDecodeCapabilities {
            avif: None,
            bmp: None,
            gif: None,
            jpeg: None,
            png: Some(HostImageDecodeFormatCapability {
                decode: Arc::new(|_, _| Box::pin(async { decoded(usize::MAX, 1) })),
            }),
            webp: None,
        };
        let reference = create_embedded_image_resource_reference(
            bytes(&[0x89, 0x50, 0x4e, 0x47]),
            Some("image/png".to_string()),
            None,
        );
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &capabilities,
            &embedded_reference(reference.clone()),
            &unused_fetch(),
            &create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ));
        assert!(result.is_none());
        let reference = reference.read().unwrap();
        let failure = reference.failure.as_ref().unwrap().read().unwrap();
        assert_eq!(failure.name.as_deref(), Some("RangeError"));
        assert_eq!(reference.state, ResourceResolutionState::Failed);
    }

    #[test]
    fn decodes_embedded_bytes_and_marks_the_reference_resolved() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capabilities = png_capabilities(calls.clone());
        let reference = create_embedded_image_resource_reference(
            bytes(&[0x89, 0x50, 0x4e, 0x47]),
            Some("image/png".to_string()),
            None,
        );
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &capabilities,
            &embedded_reference(reference.clone()),
            &unused_fetch(),
            &create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ))
        .unwrap();
        let source = result.read().unwrap();
        assert_eq!(source.texture_source_fields().kind, "bitmap");
        assert_eq!(
            (
                source.texture_source_fields().width,
                source.texture_source_fields().height,
                source.texture_source_fields().alpha_type,
            ),
            (1, 1, AlphaType::Straight)
        );
        drop(source);
        assert_eq!(calls.lock().unwrap()[0].0, vec![0x89, 0x50, 0x4e, 0x47]);
        assert_eq!(calls.lock().unwrap()[0].1, None);
        let reference = reference.read().unwrap();
        assert_eq!(reference.state, ResourceResolutionState::Resolved);
        assert!(reference.failure.is_none());
    }

    #[test]
    fn records_an_unavailable_failure_for_an_expected_miss() {
        let reference = create_external_image_resource_reference("missing.png".to_string(), None);
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &empty_capabilities(),
            &external_reference(reference.clone()),
            &unused_fetch(),
            &create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ));
        assert!(result.is_none());
        let reference = reference.read().unwrap();
        assert_eq!(reference.state, ResourceResolutionState::Failed);
        let failure = reference.failure.as_ref().unwrap().read().unwrap();
        assert_eq!(failure.kind, ImageResourceFailureKind::Unavailable);
        assert_eq!(failure.message, "Image resource unavailable");
        assert!(failure.name.is_none());
    }

    #[test]
    fn records_a_thrown_cause_instead_of_rethrowing_it() {
        let reference = create_external_image_resource_reference("boom.png".to_string(), None);
        let fetch: ImageResourceFetch = Arc::new(|_, _| {
            return Box::pin(async {
                std::panic::panic_any(FlightError {
                    kind: FlightErrorKind::Error,
                    message: "network down".to_string(),
                });
                #[allow(unreachable_code)]
                None
            });
        });
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &empty_capabilities(),
            &external_reference(reference.clone()),
            &fetch,
            &create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ));
        assert!(result.is_none());
        let reference = reference.read().unwrap();
        let failure = reference.failure.as_ref().unwrap().read().unwrap();
        assert_eq!(failure.message, "network down");
        assert_eq!(failure.name.as_deref(), Some("Error"));
    }

    #[test]
    fn requests_and_declares_premultiplied_output() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let capabilities = png_capabilities(calls.clone());
        let reference = create_embedded_image_resource_reference(
            bytes(&[1]),
            Some("image/png".to_string()),
            Some(AlphaType::Premultiplied),
        );
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &capabilities,
            &embedded_reference(reference),
            &unused_fetch(),
            &create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ))
        .unwrap();
        assert_eq!(
            calls.lock().unwrap()[0].1,
            Some(ImageDecodeOptions {
                premultiply_alpha: Some(true)
            })
        );
        assert_eq!(
            result.read().unwrap().texture_source_fields().alpha_type,
            AlphaType::Premultiplied
        );
    }

    #[test]
    fn routes_composition_through_the_installed_resolver_with_exact_identity() {
        let expected: Ref<flight_bitmap::Bitmap> =
            Arc::new(RwLock::new(flight_bitmap::create_bitmap(1, 1, None)));
        let captured_expected = expected.clone();
        let reference = create_embedded_image_resource_reference(
            bytes(&[1]),
            Some("image/png".to_string()),
            None,
        );
        reference.write().unwrap().bitmap_composition = Some(ImageBitmapComposition {
            kind: "acme/alpha-plane".to_string(),
            payload: bytes(&[7]),
        });
        let captured_reference = reference.clone();
        let mut state = create_image_resolver_state();
        register_image_bitmap_composition_resolver(
            &mut state,
            Some(Arc::new(move |_, actual, _| {
                assert!(Arc::ptr_eq(&actual, &captured_reference));
                let bitmap = captured_expected.clone();
                return Box::pin(async move { Some(bitmap) });
            })),
        );
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &empty_capabilities(),
            &embedded_reference(reference),
            &unused_fetch(),
            &create_abort_controller().signal,
            None,
            &state,
        ))
        .unwrap();
        assert!(same_texture_source_ref(&result, &expected));
    }

    #[test]
    fn routes_an_external_reference_through_fetch_with_exact_identity() {
        let reference = create_external_image_resource_reference(
            "atlas.png".to_string(),
            Some("/assets".to_string()),
        );
        let expected_reference = reference.clone();
        let resource = create_image_resource(image_source(), &create_image_resolver_state());
        let expected_resource = resource.clone();
        let calls = Arc::new(Mutex::new(0_u32));
        let captured_calls = calls.clone();
        let fetch: ImageResourceFetch = Arc::new(move |actual, _| {
            assert!(Arc::ptr_eq(&actual, &expected_reference));
            *captured_calls.lock().unwrap() += 1;
            let resource = resource.clone();
            return Box::pin(async move { Some(resource) });
        });
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &empty_capabilities(),
            &external_reference(reference.clone()),
            &fetch,
            &create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ))
        .unwrap();
        assert_eq!(*calls.lock().unwrap(), 1);
        assert!(same_texture_source_ref(&result, &expected_resource));
        assert_eq!(
            reference.read().unwrap().state,
            ResourceResolutionState::Resolved
        );
    }

    #[test]
    fn routes_an_expected_decode_miss_through_the_fallback_with_exact_bytes() {
        let payload = bytes(&[1, 2, 3]);
        let expected_payload = payload.clone();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured_calls = calls.clone();
        let fallback: ImageDecodeFallback = Arc::new(move |actual, mime_type, options| {
            assert!(Arc::ptr_eq(&actual, &expected_payload));
            captured_calls.lock().unwrap().push((mime_type, options));
            return Box::pin(async { Some(decoded(1, 1)) });
        });
        let reference = create_embedded_image_resource_reference(
            payload,
            Some("image/custom".to_string()),
            Some(AlphaType::Premultiplied),
        );
        let result = futures::executor::block_on(resolve_image_resource_reference(
            &empty_capabilities(),
            &embedded_reference(reference),
            &unused_fetch(),
            &create_abort_controller().signal,
            Some(&fallback),
            &create_image_resolver_state(),
        ));
        assert!(result.is_some());
        assert_eq!(calls.lock().unwrap()[0].0, "image/custom");
        assert_eq!(
            calls.lock().unwrap()[0].1,
            Some(ImageDecodeOptions {
                premultiply_alpha: Some(true)
            })
        );
    }

    #[test]
    fn treats_abort_as_cancellation_and_rethrows_the_exact_reason() {
        let reference = create_external_image_resource_reference("slow.png".to_string(), None);
        let controller = Arc::new(create_abort_controller());
        let reason: Unknown = Some(Arc::new("stop".to_string()));
        let fetch: ImageResourceFetch = Arc::new({
            let controller = controller.clone();
            let reason = reason.clone();
            move |_, signal| {
                assert!(!signal.is_aborted());
                abort_controller(&controller, Some(reason.clone()));
                let reason = reason.clone();
                return Box::pin(async move {
                    std::panic::panic_any(reason);
                    #[allow(unreachable_code)]
                    None
                });
            }
        });
        let thrown = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            futures::executor::block_on(resolve_image_resource_reference(
                &empty_capabilities(),
                &external_reference(reference.clone()),
                &fetch,
                &controller.signal,
                None,
                &create_image_resolver_state(),
            ))
        }))
        .unwrap_err()
        .downcast::<Unknown>()
        .unwrap();
        assert!(Arc::ptr_eq(
            thrown.as_ref().as_ref().unwrap(),
            reason.as_ref().unwrap()
        ));
        let reference = reference.read().unwrap();
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
        assert!(reference.failure.is_none());
    }
}
