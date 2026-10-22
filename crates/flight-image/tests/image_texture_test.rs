use std::sync::{Arc, RwLock};

use flight_entity::{Ref, Uint8Array};
use flight_image::contract::*;

fn embedded() -> ImageResourceReference {
    let bytes: Ref<Box<Uint8Array>> = Arc::new(RwLock::new(vec![1].into_boxed_slice()));
    return ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue {
        reference: create_embedded_image_resource_reference(bytes),
    });
}

mod create_texture_from_image_resource {
    use super::*;

    #[test]
    fn joins_the_reference_exactly_once() {
        let reference = embedded();
        let texture = create_texture_from_image_resource(&reference, None);
        let ImageResourceReference::Embedded(value) = reference else {
            panic!("expected embedded reference");
        };
        let reference = value.reference.read().unwrap();
        assert_eq!(reference.textures.len(), 1);
        assert!(Arc::ptr_eq(&reference.textures[0], &texture));
    }

    #[test]
    fn each_call_creates_and_registers_one_distinct_texture() {
        let reference = embedded();
        let first = create_texture_from_image_resource(&reference, None);
        let second = create_texture_from_image_resource(&reference, None);
        assert!(!Arc::ptr_eq(&first, &second));
        let ImageResourceReference::Embedded(value) = reference else {
            panic!("expected embedded reference");
        };
        assert_eq!(value.reference.read().unwrap().textures.len(), 2);
    }

    #[test]
    fn material_and_resource_keep_one_canonical_texture_handle_and_observe_mutations() {
        let reference = embedded();
        let texture = create_texture_from_image_resource(&reference, None);
        let mut material = flight_materials::contract::create_blinn_phong_material();
        material.diffuse_map = Some(texture.clone());
        let ImageResourceReference::Embedded(value) = &reference else {
            panic!("expected embedded");
        };
        let subscriber = value.reference.read().unwrap().textures[0].clone();
        assert!(Arc::ptr_eq(
            &subscriber,
            material.diffuse_map.as_ref().unwrap()
        ));
        assert!(matches!(
            *texture.read().unwrap(),
            flight_texture::Texture::Texture2D(_)
        ));
        let source = Arc::new(RwLock::new(flight_bitmap::create_bitmap(2, 3, None)));
        flight_texture::set_texture_source(&mut *subscriber.write().unwrap(), Some(source.clone()));
        let material_source = flight_texture::get_texture_source(
            &*material.diffuse_map.as_ref().unwrap().read().unwrap(),
        )
        .unwrap();
        assert!(Arc::ptr_eq(
            &material_source,
            &(source as flight_texture::TextureSourceRef)
        ));
        flight_texture::set_texture_source(
            &mut *material.diffuse_map.as_ref().unwrap().write().unwrap(),
            None,
        );
        assert!(flight_texture::get_texture_source(&*subscriber.read().unwrap()).is_none());
    }

    #[test]
    fn external_resolution_source_bound_to_subscriber_updates_original_material_texture() {
        let reference = ImageResourceReference::External(ExternalImageResourceReferenceValue {
            reference: create_external_image_resource_reference("model.png".to_string()),
        });
        let texture = create_texture_from_image_resource(&reference, None);
        let mut material = flight_materials::contract::create_blinn_phong_material();
        material.diffuse_map = Some(texture.clone());
        let resource = create_image_resource(
            Arc::new(flight_host::HostImageSource {
                provider: Arc::new(()),
                handle: Arc::new(()),
            }),
            &create_image_resolver_state(),
        );
        let fetch: ImageResourceFetch = Arc::new(move |_, _| {
            let resource = resource.clone();
            return Box::pin(async move { Some(resource) });
        });
        let capabilities = flight_image_codec::HostImageDecodeCapabilities {
            avif: None,
            bmp: None,
            gif: None,
            jpeg: None,
            png: None,
            webp: None,
        };
        let resolved = futures::executor::block_on(resolve_image_resource_reference(
            &capabilities,
            &reference,
            &fetch,
            &flight_stream::create_abort_controller().signal,
            None,
            &create_image_resolver_state(),
        ))
        .unwrap();
        let ImageResourceReference::External(value) = &reference else {
            panic!("expected external");
        };
        let subscriber = value.reference.read().unwrap().textures[0].clone();
        assert!(Arc::ptr_eq(
            &subscriber,
            material.diffuse_map.as_ref().unwrap()
        ));
        // The source owner resolves; the scene-resource caller binds each subscriber, as in TS.
        flight_texture::set_texture_source(
            &mut *subscriber.write().unwrap(),
            Some(resolved.clone()),
        );
        let actual = flight_texture::get_texture_source(
            &*material.diffuse_map.as_ref().unwrap().read().unwrap(),
        )
        .unwrap();
        assert!(Arc::ptr_eq(&actual, &resolved));
        assert_eq!(
            value.reference.read().unwrap().state,
            flight_resource::ResourceResolutionState::Resolved
        );
    }
}
