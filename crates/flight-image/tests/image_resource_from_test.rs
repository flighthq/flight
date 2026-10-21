use std::sync::{Arc, Mutex};

use flight_bitmap::contract::{BitmapReadbackBackendReason, BitmapReadbackOutcome};
use flight_bitmap::{
    BitmapReadbackMode, HostBitmapReadbackCapability, HostImageSource, create_bitmap,
};
use flight_buffer::{create_array_buffer_from_bytes, create_blob};
use flight_image::contract::*;
use flight_stream::{
    AbortSignal, abort_controller, create_abort_controller, is_abort_signal_aborted,
};

struct LoadCall {
    cross_origin: Option<ImageCrossOrigin>,
    signal: Option<AbortSignal>,
    url: String,
}

fn image_resource() -> flight_entity::Ref<ImageResource> {
    return create_image_resource(
        Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(()),
        }),
        &create_image_resolver_state(),
    );
}

fn recording_host() -> (
    HostImageCapability,
    Arc<Mutex<Vec<LoadCall>>>,
    flight_entity::Ref<ImageResource>,
) {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let captured_calls = calls.clone();
    let resource = image_resource();
    let captured_resource = resource.clone();
    let host = HostImageCapability {
        create_image_from_bitmap: None,
        create_image_from_surface: None,
        load_image_from_url: Arc::new(move |url, cross_origin, signal| {
            captured_calls.lock().unwrap().push(LoadCall {
                cross_origin,
                signal,
                url,
            });
            let resource = captured_resource.clone();
            return Box::pin(async move { resource });
        }),
        provider: Arc::new("provider"),
    };
    return (host, calls, resource);
}

mod capture_bitmap_from_image_resource {
    use super::*;

    #[test]
    fn passes_the_exact_source_and_dimensions_to_readback() {
        let source = Arc::new(HostImageSource {
            provider: Arc::new("source-provider"),
            handle: Arc::new(HostImageDimensions {
                height: 2,
                width: 3,
            }),
        });
        let mut state = create_image_resolver_state();
        register_test_image_dimension_resolver(&mut state);
        let resource = create_image_resource(source.clone(), &state);
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured_calls = calls.clone();
        let captured_source = source.clone();
        let host = HostBitmapReadbackCapability {
            provider: Arc::new("readback-provider"),
            read_bitmap: Arc::new(move |actual, width, height, mode| {
                assert!(Arc::ptr_eq(actual, &captured_source));
                captured_calls.lock().unwrap().push((width, height, mode));
                return BitmapReadbackOutcome {
                    bitmap: Some(create_bitmap(3, 2, Some(0x10203040))),
                    reason: BitmapReadbackBackendReason::Ok,
                };
            }),
        };

        let bitmap = capture_bitmap_from_image_resource(&host, &resource).unwrap();

        assert_eq!(
            *calls.lock().unwrap(),
            vec![(3, 2, BitmapReadbackMode::Bitmap)]
        );
        assert_eq!((bitmap.width, bitmap.height), (3, 2));
        assert_eq!(&bitmap.data[..4], &[0x10, 0x20, 0x30, 0x40]);
    }

    #[test]
    fn returns_none_for_an_expected_backend_refusal() {
        let resource = image_resource();
        let host = HostBitmapReadbackCapability {
            provider: Arc::new(()),
            read_bitmap: Arc::new(|_, _, _, _| {
                return BitmapReadbackOutcome {
                    bitmap: None,
                    reason: BitmapReadbackBackendReason::TaintedSource,
                };
            }),
        };
        assert!(capture_bitmap_from_image_resource(&host, &resource).is_none());
    }
}

mod create_image_resource_from_bitmap {
    use super::*;

    #[test]
    fn returns_none_when_the_optional_host_bridge_is_absent() {
        let (host, _, _) = recording_host();
        let bitmap = create_bitmap(1, 1, None);
        assert!(create_image_resource_from_bitmap(&host, &bitmap).is_none());
    }

    #[test]
    fn routes_the_exact_bitmap_through_the_host_bridge() {
        let (mut host, _, resource) = recording_host();
        let seen = Arc::new(Mutex::new(None));
        let captured = seen.clone();
        let expected = resource.clone();
        host.create_image_from_bitmap = Some(Arc::new(move |bitmap| {
            *captured.lock().unwrap() = Some((bitmap.width, bitmap.height));
            return expected.clone();
        }));
        let bitmap = create_bitmap(3, 2, None);
        let actual = create_image_resource_from_bitmap(&host, &bitmap).unwrap();
        assert!(Arc::ptr_eq(&actual, &resource));
        assert_eq!(*seen.lock().unwrap(), Some((3, 2)));
    }
}

mod create_image_resource_from_surface {
    use super::*;
    use flight_surface::{SurfaceBase, SurfaceRef, allocate_surface};

    #[test]
    fn routes_the_exact_canonical_surface_through_the_optional_bridge() {
        let (mut host, _, resource) = recording_host();
        let expected = resource.clone();
        let surface: SurfaceRef = allocate_surface::<SurfaceBase>(Some(Arc::new("surface")));
        let captured_surface = surface.clone();
        host.create_image_from_surface = Some(Arc::new(move |actual| {
            let expected_surface = captured_surface.read().unwrap();
            assert!(std::ptr::eq(actual, &*expected_surface));
            return expected.clone();
        }));
        let borrowed = surface.read().unwrap();
        let actual = create_image_resource_from_surface(&host, &*borrowed).unwrap();
        assert!(Arc::ptr_eq(&actual, &resource));
    }
}

mod is_image_url_same_origin {
    use super::*;

    fn context() -> ImageUrlOriginContext {
        return ImageUrlOriginContext {
            href: "https://flight.test/scenes/main.json".to_string(),
            origin: "https://flight.test".to_string(),
        };
    }

    #[test]
    fn compares_absolute_and_relative_urls_against_explicit_context() {
        assert!(is_image_url_same_origin("/images/logo.png", &context()));
        assert!(!is_image_url_same_origin(
            "https://cdn.test/logo.png",
            &context()
        ));
    }

    #[test]
    fn treats_data_blob_and_malformed_urls_as_same_origin() {
        assert!(is_image_url_same_origin(
            "data:image/png;base64,AA==",
            &context()
        ));
        assert!(is_image_url_same_origin(
            "blob:https://flight.test/id",
            &context()
        ));
        assert!(is_image_url_same_origin("http://[", &context()));
    }
}

mod load_image_resource_from_base64 {
    use super::*;

    #[test]
    fn builds_the_exact_data_url_and_returns_the_host_result() {
        let (host, calls, resource) = recording_host();
        let actual = futures::executor::block_on(load_image_resource_from_base64(
            &host,
            "aGVsbG8=",
            "image/png",
            None,
        ));
        assert!(Arc::ptr_eq(&actual, &resource));
        let calls = calls.lock().unwrap();
        assert_eq!(calls[0].url, "data:image/png;base64,aGVsbG8=");
        assert_eq!(calls[0].cross_origin, None);
    }
}

mod load_image_resource_from_blob {
    use super::*;

    #[test]
    fn reads_the_blob_and_routes_a_portable_data_url() {
        let (host, calls, resource) = recording_host();
        let blob = create_blob(
            "image/png".to_string(),
            5,
            None,
            Some(Arc::new(|| {
                return Box::pin(async {
                    Ok(create_array_buffer_from_bytes(
                        b"hello".to_vec().into_boxed_slice(),
                    ))
                });
            })),
        );
        let actual = futures::executor::block_on(load_image_resource_from_blob(&host, &blob, None));
        assert!(Arc::ptr_eq(&actual, &resource));
        assert_eq!(
            calls.lock().unwrap()[0].url,
            "data:image/png;base64,aGVsbG8="
        );
    }

    #[test]
    fn rejects_before_reading_an_already_aborted_blob() {
        let (host, calls, _) = recording_host();
        let reads = Arc::new(Mutex::new(0));
        let captured = reads.clone();
        let blob = create_blob(
            "image/png".to_string(),
            0,
            None,
            Some(Arc::new(move || {
                *captured.lock().unwrap() += 1;
                return Box::pin(async { Ok(create_array_buffer_from_bytes(Box::new([]))) });
            })),
        );
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            futures::executor::block_on(load_image_resource_from_blob(
                &host,
                &blob,
                Some(&controller.signal),
            ));
        }));
        assert!(result.is_err());
        assert_eq!(*reads.lock().unwrap(), 0);
        assert!(calls.lock().unwrap().is_empty());
    }
}

mod load_image_resource_from_bytes {
    use super::*;

    #[test]
    fn detects_png_and_encodes_the_exact_bytes() {
        let (host, calls, _) = recording_host();
        futures::executor::block_on(load_image_resource_from_bytes(
            &host,
            &[0x89, 0x50, 0x4e, 0x47],
            None,
            None,
        ));
        assert_eq!(
            calls.lock().unwrap()[0].url,
            "data:image/png;base64,iVBORw=="
        );
    }

    #[test]
    fn honors_an_explicit_mime_type_without_detection() {
        let (host, calls, _) = recording_host();
        futures::executor::block_on(load_image_resource_from_bytes(
            &host,
            &[0, 1, 2],
            Some("image/custom"),
            None,
        ));
        assert_eq!(
            calls.lock().unwrap()[0].url,
            "data:image/custom;base64,AAEC"
        );
    }

    #[test]
    fn throws_when_the_mime_type_cannot_be_determined() {
        let (host, calls, _) = recording_host();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            futures::executor::block_on(load_image_resource_from_bytes(
                &host,
                &[0, 1, 2, 3],
                None,
                None,
            ));
        }));
        assert!(result.is_err());
        assert!(calls.lock().unwrap().is_empty());
    }
}

mod load_image_resource_from_url {
    use super::*;

    #[test]
    fn forwards_url_credentials_signal_and_result() {
        let (host, calls, resource) = recording_host();
        let controller = create_abort_controller();
        let actual = futures::executor::block_on(load_image_resource_from_url(
            &host,
            "https://cdn.test/a.png",
            Some(ImageCrossOrigin::UseCredentials),
            Some(&controller.signal),
        ));
        assert!(Arc::ptr_eq(&actual, &resource));
        let calls = calls.lock().unwrap();
        assert_eq!(calls[0].url, "https://cdn.test/a.png");
        assert_eq!(
            calls[0].cross_origin,
            Some(ImageCrossOrigin::UseCredentials)
        );
        abort_controller(&controller, None);
        assert!(is_abort_signal_aborted(calls[0].signal.as_ref().unwrap()));
    }
}
