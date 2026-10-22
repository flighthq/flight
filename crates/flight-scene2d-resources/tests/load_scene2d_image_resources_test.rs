use std::sync::{Arc, Mutex, RwLock};

use flight_bitmap::HostImageSource;
use flight_image::{
    EmbeddedImageResourceReferenceValue, ExternalImageResourceReferenceValue, ImageResolverState,
    ImageResourceFetch, ImageResourceReference, create_embedded_image_resource_reference,
    create_external_image_resource_reference, create_image_resolver_state, create_image_resource,
};
use flight_image_codec::{
    DecodedImage, HostImageDecodeCapabilities, HostImageDecodeFormatCapability,
};
use flight_resource::ResourceResolutionState;
use flight_scene2d_resources::contract::*;
use flight_signals::{connect_signal, create_signal};
use flight_texture::{Texture, create_texture, get_texture_source};

use crate::guard_state;

fn embedded_png() -> ImageResourceReference {
    let reference = create_embedded_image_resource_reference(
        Arc::new(RwLock::new(vec![0x89, 0x50, 0x4e, 0x47].into_boxed_slice())),
        Some("image/png".to_string()),
        None,
    );
    return ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue { reference });
}

fn empty_options() -> LoadScene2DImageResourcesOptions {
    return LoadScene2DImageResourcesOptions {
        decode: None,
        fetch: None,
        progress: None,
        select: None,
        signal: None,
    };
}

fn external(uri: &str) -> ImageResourceReference {
    let reference = create_external_image_resource_reference(uri.to_string(), None);
    return ImageResourceReference::External(ExternalImageResourceReferenceValue { reference });
}

fn fetched_image(state: &ImageResolverState) -> flight_entity::Ref<flight_image::ImageResource> {
    return create_image_resource(
        Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(()),
        }),
        state,
    );
}

fn image_decode() -> HostImageDecodeCapabilities {
    return HostImageDecodeCapabilities {
        avif: None,
        bmp: None,
        gif: None,
        jpeg: None,
        png: Some(HostImageDecodeFormatCapability {
            decode: Arc::new(|_, _| {
                Box::pin(async {
                    DecodedImage {
                        data: vec![0x11, 0x22, 0x33, 0xff].into_boxed_slice(),
                        height: 1,
                        width: 1,
                    }
                })
            }),
        }),
        webp: None,
    };
}

fn reference_state(reference: &ImageResourceReference) -> ResourceResolutionState {
    return match reference {
        ImageResourceReference::Embedded(value) => value.reference.read().unwrap().state,
        ImageResourceReference::External(value) => value.reference.read().unwrap().state,
    };
}

fn set_textures(reference: &ImageResourceReference, textures: Vec<flight_entity::Ref<Texture>>) {
    match reference {
        ImageResourceReference::Embedded(value) => {
            value.reference.write().unwrap().textures = textures
        }
        ImageResourceReference::External(value) => {
            value.reference.write().unwrap().textures = textures
        }
    }
}

fn texture_version(texture: &Texture) -> u32 {
    return match texture {
        Texture::Texture2D(value) => value.version,
        Texture::Texture2DArray(value) => value.version,
        Texture::Texture3D(value) => value.version,
        Texture::Cube(value) => value.version,
    };
}

mod load_scene2d_image_resources {
    use super::*;

    #[test]
    fn binds_one_decode_into_every_texture_waiting_on_the_reference() {
        let state = create_image_resolver_state();
        let reference = external("atlas.png");
        let tiled = Arc::new(RwLock::new(create_texture(None)));
        let clamped = Arc::new(RwLock::new(create_texture(None)));
        set_textures(&reference, vec![tiled.clone(), clamped.clone()]);
        let document = create_scene2d_document();
        document.write().unwrap().image_resources = vec![reference];
        let resource = fetched_image(&state);
        let fetch: ImageResourceFetch = Arc::new(move |_, _| {
            let resource = resource.clone();
            Box::pin(async move { Some(resource) })
        });
        let mut options = empty_options();
        options.fetch = Some(fetch);
        let result = futures::executor::block_on(load_scene2d_image_resources(
            &image_decode(),
            &document,
            Some(&options),
            &state,
            &guard_state(),
        ));
        let tiled_source = get_texture_source(&*tiled.read().unwrap()).unwrap();
        let clamped_source = get_texture_source(&*clamped.read().unwrap()).unwrap();
        assert!(Arc::ptr_eq(&tiled_source, &clamped_source));
        assert_eq!(result.resolved.len(), 1);
        assert!(result.unresolved.is_empty());
    }

    #[test]
    fn bumps_each_bound_texture_version() {
        let state = create_image_resolver_state();
        let reference = external("atlas.png");
        let texture = Arc::new(RwLock::new(create_texture(None)));
        let before = texture_version(&texture.read().unwrap());
        set_textures(&reference, vec![texture.clone()]);
        let document = create_scene2d_document();
        document.write().unwrap().image_resources = vec![reference];
        let resource = fetched_image(&state);
        let mut options = empty_options();
        options.fetch = Some(Arc::new(move |_, _| {
            let resource = resource.clone();
            Box::pin(async move { Some(resource) })
        }));
        futures::executor::block_on(load_scene2d_image_resources(
            &image_decode(),
            &document,
            Some(&options),
            &state,
            &guard_state(),
        ));
        assert_ne!(texture_version(&texture.read().unwrap()), before);
    }

    #[test]
    fn decodes_an_embedded_reference_without_a_fetch_seam() {
        let state = create_image_resolver_state();
        let reference = embedded_png();
        let texture = Arc::new(RwLock::new(create_texture(None)));
        set_textures(&reference, vec![texture.clone()]);
        let document = create_scene2d_document();
        document.write().unwrap().image_resources = vec![reference];
        let result = futures::executor::block_on(load_scene2d_image_resources(
            &image_decode(),
            &document,
            None,
            &state,
            &guard_state(),
        ));
        assert_eq!(result.resolved.len(), 1);
        assert!(get_texture_source(&*texture.read().unwrap()).is_some());
    }

    #[test]
    fn emits_progress_once_per_reference_with_the_running_count() {
        let state = create_image_resolver_state();
        let document = create_scene2d_document();
        document.write().unwrap().image_resources = vec![external("a.png"), external("b.png")];
        let events = Arc::new(Mutex::new(Vec::new()));
        let progress = create_signal();
        let captured = events.clone();
        connect_signal(
            &progress,
            Arc::new(move |event: &Scene2DImageResourceLoadProgress| {
                captured.lock().unwrap().push((event.loaded, event.total));
            }),
            None,
        );
        let mut options = empty_options();
        options.progress = Some(progress);
        options.fetch = Some(Arc::new(move |_, _| {
            let resource = fetched_image(&create_image_resolver_state());
            Box::pin(async move { Some(resource) })
        }));
        futures::executor::block_on(load_scene2d_image_resources(
            &image_decode(),
            &document,
            Some(&options),
            &state,
            &guard_state(),
        ));
        assert_eq!(*events.lock().unwrap(), vec![(1, 2), (2, 2)]);
    }

    #[test]
    fn leaves_references_outside_the_selected_working_set_unrequested() {
        let state = create_image_resolver_state();
        let selected = external("a.png");
        let skipped = external("b.png");
        let document = create_scene2d_document();
        document.write().unwrap().image_resources = vec![selected.clone(), skipped.clone()];
        let calls = Arc::new(Mutex::new(0));
        let captured = calls.clone();
        let selected_handle = match &selected {
            ImageResourceReference::External(value) => value.reference.clone(),
            _ => unreachable!(),
        };
        let mut options = empty_options();
        options.fetch = Some(Arc::new(move |_, _| {
            *captured.lock().unwrap() += 1;
            let resource = fetched_image(&create_image_resolver_state());
            Box::pin(async move { Some(resource) })
        }));
        options.select = Some(Arc::new(move |reference| match reference {
            ImageResourceReference::External(value) => {
                Arc::ptr_eq(&value.reference, &selected_handle)
            }
            _ => false,
        }));
        let result = futures::executor::block_on(load_scene2d_image_resources(
            &image_decode(),
            &document,
            Some(&options),
            &state,
            &guard_state(),
        ));
        assert_eq!(*calls.lock().unwrap(), 1);
        assert_eq!(result.resolved.len(), 1);
        assert_eq!(
            reference_state(&skipped),
            ResourceResolutionState::Unresolved
        );
    }

    #[test]
    fn reports_a_miss_without_demanding_a_fetch_seam() {
        let state = create_image_resolver_state();
        let document = create_scene2d_document();
        document.write().unwrap().image_resources = vec![external("atlas.png")];
        let result = futures::executor::block_on(load_scene2d_image_resources(
            &image_decode(),
            &document,
            None,
            &state,
            &guard_state(),
        ));
        assert_eq!(result.unresolved.len(), 1);
    }

    #[test]
    fn reports_an_unresolved_reference_and_leaves_its_textures_sourceless() {
        let state = create_image_resolver_state();
        let reference = external("missing.png");
        let texture = Arc::new(RwLock::new(create_texture(None)));
        set_textures(&reference, vec![texture.clone()]);
        let document = create_scene2d_document();
        document.write().unwrap().image_resources = vec![reference.clone()];
        let mut options = empty_options();
        options.fetch = Some(Arc::new(|_, _| Box::pin(async { None })));
        let result = futures::executor::block_on(load_scene2d_image_resources(
            &image_decode(),
            &document,
            Some(&options),
            &state,
            &guard_state(),
        ));
        assert!(result.resolved.is_empty());
        assert_eq!(result.unresolved.len(), 1);
        assert!(get_texture_source(&*texture.read().unwrap()).is_none());
        assert_eq!(reference_state(&reference), ResourceResolutionState::Failed);
    }
}
