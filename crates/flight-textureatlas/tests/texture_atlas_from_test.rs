use std::any::Any;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};

use flight_bitmap::HostImageSource;
use flight_buffer::{create_array_buffer_from_bytes, create_blob};
use flight_entity::{FlightError, Unknown};
use flight_image::{
    HostImageCapability, ImageCrossOrigin, ImageResource, create_image_resolver_state,
    create_image_resource,
};
use flight_stream::{AbortSignal, abort_controller, create_abort_controller, throw_if_aborted};
use flight_texture::get_texture_source;
use flight_textureatlas::contract::*;

use crate::texture_atlas_fixture::*;

type UrlCall = (String, Option<ImageCrossOrigin>, bool);

/// The source's test image backend: the host "decodes" a URL into an ImageResource whose opaque handle
/// is the URL it was given, and honours a pre-aborted signal.
fn image_host() -> (HostImageCapability, Arc<Mutex<Vec<UrlCall>>>) {
    let calls: Arc<Mutex<Vec<UrlCall>>> = Arc::new(Mutex::new(Vec::new()));
    let record = calls.clone();
    let host = HostImageCapability {
        create_image_from_bitmap: None,
        create_image_from_surface: None,
        load_image_from_url: Arc::new(
            move |url: String, cross_origin, signal: Option<AbortSignal>| {
                record
                    .lock()
                    .unwrap()
                    .push((url.clone(), cross_origin, signal.is_some()));
                return Box::pin(async move {
                    if let Some(signal) = &signal {
                        throw_if_aborted(signal);
                    }
                    let source = Arc::new(HostImageSource {
                        provider: Arc::new(()),
                        handle: Arc::new(url),
                    });
                    return create_image_resource(source, &create_image_resolver_state());
                });
            },
        ),
        provider: Arc::new(()),
    };
    return (host, calls);
}

// The URL the host decoded, read back from the atlas page's ImageResource handle.
fn page_url(atlas: &TextureAtlas) -> String {
    let source = get_texture_source(&*atlas.texture.as_ref().unwrap().read().unwrap()).unwrap();
    let guard = source.read().unwrap();
    let any: &dyn Any = &*guard;
    let resource = any.downcast_ref::<ImageResource>().unwrap();
    return resource
        .source
        .handle
        .downcast_ref::<String>()
        .unwrap()
        .clone();
}

mod create_texture_atlas_from_image_resource {
    use super::*;

    #[test]
    fn uses_the_provided_image_resource_as_the_atlas_image() {
        let source = image(128, 64);
        let atlas = create_texture_atlas_from_image_resource(&source);
        let page_source =
            get_texture_source(&*atlas.texture.as_ref().unwrap().read().unwrap()).unwrap();
        assert_eq!(
            Arc::as_ptr(&page_source) as *const (),
            Arc::as_ptr(&source) as *const ()
        );
        let fields = page_source.read().unwrap();
        assert_eq!(
            (
                fields.texture_source_fields().width,
                fields.texture_source_fields().height
            ),
            (128, 64)
        );
    }

    #[test]
    fn starts_with_an_empty_regions_array() {
        assert!(
            create_texture_atlas_from_image_resource(&image(1, 1))
                .regions
                .is_empty()
        );
    }

    #[test]
    fn returns_a_new_atlas_and_page_each_call() {
        let source = image(1, 1);
        let a = create_texture_atlas_from_image_resource(&source);
        let b = create_texture_atlas_from_image_resource(&source);
        assert!(!Arc::ptr_eq(
            a.texture.as_ref().unwrap(),
            b.texture.as_ref().unwrap()
        ));
    }
}

mod load_texture_atlas_from_base64 {
    use super::*;

    #[test]
    fn resolves_to_a_texture_atlas_over_the_decoded_image() {
        let (host, calls) = image_host();
        let atlas = block_on(load_texture_atlas_from_base64(
            &host,
            "abc123",
            "image/png",
            None,
        ));
        assert_eq!(page_url(&atlas), "data:image/png;base64,abc123");
        assert_eq!(calls.lock().unwrap().len(), 1);
    }

    #[test]
    fn propagates_an_abort_with_its_reason() {
        let (host, _calls) = image_host();
        let controller = create_abort_controller();
        let reason: Unknown = Some(Arc::new("stop".to_string()));
        abort_controller(&controller, Some(reason.clone()));
        let thrown = catch_unwind(AssertUnwindSafe(|| {
            block_on(load_texture_atlas_from_base64(
                &host,
                "abc",
                "image/png",
                Some(&controller.signal),
            ))
        }))
        .unwrap_err();
        let thrown = thrown.downcast::<Unknown>().unwrap();
        assert!(Arc::ptr_eq(
            thrown.as_ref().as_ref().unwrap(),
            reason.as_ref().unwrap()
        ));
    }
}

mod load_texture_atlas_from_blob {
    use super::*;

    #[test]
    fn resolves_to_a_texture_atlas_over_the_decoded_image() {
        let (host, _calls) = image_host();
        let blob = create_blob(
            "image/png".to_string(),
            0,
            None,
            Some(Arc::new(|| {
                Box::pin(async { Ok(create_array_buffer_from_bytes(Box::new([]))) })
            })),
        );
        let atlas = block_on(load_texture_atlas_from_blob(&host, &blob, None));
        assert_eq!(page_url(&atlas), "data:image/png;base64,");
        assert!(atlas.regions.is_empty());
    }
}

mod load_texture_atlas_from_bytes {
    use super::*;

    const PNG: [u8; 16] = [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
    ];

    #[test]
    fn resolves_to_a_texture_atlas_with_a_detected_type() {
        let (host, _calls) = image_host();
        let atlas = block_on(load_texture_atlas_from_bytes(&host, &PNG, None, None));
        assert!(page_url(&atlas).starts_with("data:image/png;base64,"));
    }

    #[test]
    fn starts_with_an_empty_regions_array() {
        let (host, _calls) = image_host();
        assert!(
            block_on(load_texture_atlas_from_bytes(&host, &PNG, None, None))
                .regions
                .is_empty()
        );
    }

    #[test]
    fn throws_when_the_mime_type_cannot_be_detected() {
        let (host, calls) = image_host();
        let thrown = catch_unwind(AssertUnwindSafe(|| {
            block_on(load_texture_atlas_from_bytes(&host, &[0; 16], None, None))
        }))
        .unwrap_err();
        let error = thrown.downcast::<FlightError>().unwrap();
        assert!(error.message.contains("Unable to determine image type"));
        assert!(calls.lock().unwrap().is_empty());
    }
}

mod load_texture_atlas_from_url {
    use super::*;

    #[test]
    fn resolves_to_a_texture_atlas_and_forwards_cross_origin_and_signal() {
        let (host, calls) = image_host();
        let controller = create_abort_controller();
        let atlas = block_on(load_texture_atlas_from_url(
            &host,
            "data:image/png;base64,abc",
            Some(ImageCrossOrigin::Anonymous),
            Some(&controller.signal),
        ));
        assert_eq!(page_url(&atlas), "data:image/png;base64,abc");
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(
                "data:image/png;base64,abc".to_string(),
                Some(ImageCrossOrigin::Anonymous),
                true
            )]
        );
    }
}
