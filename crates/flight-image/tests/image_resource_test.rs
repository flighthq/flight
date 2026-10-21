use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_bitmap::HostImageSource;
use flight_entity::{Entity, allocate_entity};
use flight_image::contract::*;
use flight_texture::{AlphaType, TextureGamut, TextureSource, TextureSourceRef};
use flight_texture_formats::{
    TextureContainer, TextureContainerFormat, TextureContainerLevel,
    TextureContainerSupercompression,
};

fn compressed() -> Arc<CompressedImageData> {
    return Arc::new(CompressedImageData {
        container: TextureContainer {
            format: TextureContainerFormat::Bc3,
            width: 4,
            height: 4,
            depth: 1,
            mip_levels: 1,
            layers: 1,
            faces: 1,
            supercompression: TextureContainerSupercompression::None,
            levels: vec![TextureContainerLevel {
                byte_offset: 0,
                byte_length: 16,
                width: 4,
                height: 4,
            }],
        },
        payload: Arc::new(RwLock::new(vec![0; 16].into_boxed_slice())),
    });
}

fn measured_state(source: &Arc<HostImageSource>, width: u32, height: u32) -> ImageResolverState {
    let captured = source.clone();
    let mut state = create_image_resolver_state();
    register_host_image_dimension_resolver(
        &mut state,
        Arc::new(move |actual, out| {
            if !Arc::ptr_eq(actual, &captured) {
                return false;
            }
            out.height = height;
            out.width = width;
            return true;
        }),
    );
    return state;
}

fn source() -> Arc<HostImageSource> {
    return Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(()),
    });
}

mod clone_image_resource {
    use super::*;

    #[test]
    fn creates_an_independent_entity_while_sharing_the_host_source() {
        let source = source();
        let state = measured_state(&source, 4, 5);
        let resource = create_image_resource(source.clone(), &state);
        resource.write().unwrap().version = 3;
        let copy = clone_image_resource(&resource);
        assert!(!Arc::ptr_eq(&copy, &resource));
        assert!(Arc::ptr_eq(&copy.read().unwrap().source, &source));
        assert_eq!(copy.read().unwrap().version, 3);
        assert!(copy.read().unwrap().entity_runtime().data.is_none());
    }
}

mod create_compressed_image_resource {
    use super::*;

    #[test]
    fn preserves_payload_identity_and_container_dimensions() {
        let compressed = compressed();
        let resource = create_compressed_image_resource(compressed.clone());
        let resource = resource.read().unwrap();
        assert!(Arc::ptr_eq(&resource.compressed, &compressed));
        assert_eq!(resource.kind, COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND);
        assert_eq!((resource.width, resource.height), (4, 4));
        assert_eq!(resource.alpha_type, AlphaType::Straight);
        assert_eq!(resource.gamut, TextureGamut::Srgb);
    }

    #[test]
    fn implements_the_canonical_texture_source_family() {
        let resource = create_compressed_image_resource(compressed());
        let resource = resource.read().unwrap();
        let source: &dyn TextureSource = &*resource;
        assert_eq!(
            source.texture_source_fields().kind,
            COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND
        );
    }
}

mod create_image_resource {
    use super::*;

    #[test]
    fn keeps_zero_dimensions_when_the_host_declines_measurement() {
        let source = source();
        let resource = create_image_resource(source.clone(), &create_image_resolver_state());
        let resource = resource.read().unwrap();
        assert!(Arc::ptr_eq(&resource.source, &source));
        assert_eq!((resource.width, resource.height), (0, 0));
    }

    #[test]
    fn wraps_one_host_source_with_measured_dimensions() {
        let source = source();
        let state = measured_state(&source, 8, 6);
        let resource = create_image_resource(source.clone(), &state);
        let resource = resource.read().unwrap();
        assert!(Arc::ptr_eq(&resource.source, &source));
        assert_eq!(resource.kind, IMAGE_TEXTURE_SOURCE_KIND);
        assert_eq!((resource.width, resource.height), (8, 6));
    }

    #[test]
    fn recovers_the_same_image_resource_and_mutates_it() {
        let host = source();
        let shared = create_image_resource(host, &create_image_resolver_state());
        let source: TextureSourceRef = shared.clone();
        assert_eq!(
            Arc::as_ptr(&shared) as *const (),
            Arc::as_ptr(&source) as *const ()
        );
        {
            let guard = source.read().unwrap();
            let any: &dyn Any = &*guard;
            let resource = any.downcast_ref::<ImageResource>().unwrap();
            assert!(Arc::ptr_eq(
                &resource.source,
                &shared.read().unwrap().source
            ));
        }
        {
            let mut guard = source.write().unwrap();
            let any: &mut dyn Any = &mut *guard;
            any.downcast_mut::<ImageResource>().unwrap().version = 23;
        }
        assert_eq!(shared.read().unwrap().version, 23);
    }
}

mod initialize_compressed_image_resource {
    use super::*;

    #[test]
    fn initializes_an_existing_entity() {
        let compressed = compressed();
        let mut resource: CompressedImageResource = allocate_entity();
        initialize_compressed_image_resource(&mut resource, compressed.clone());
        assert!(Arc::ptr_eq(&resource.compressed, &compressed));
        assert_eq!(resource.kind, COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND);
    }
}

mod invalidate_image_resource {
    use super::*;

    #[test]
    fn refreshes_dimensions_and_wraps_the_version_as_u32() {
        let source = source();
        let resource = create_image_resource(source.clone(), &measured_state(&source, 1, 2));
        resource.write().unwrap().version = u32::MAX;
        invalidate_image_resource(&resource, &measured_state(&source, 12, 9));
        let resource = resource.read().unwrap();
        assert_eq!((resource.width, resource.height), (12, 9));
        assert_eq!(resource.version, 0);
    }
}

mod is_image_resource_empty {
    use super::*;

    #[test]
    fn reports_zero_width_or_height_as_empty() {
        let source = source();
        assert!(is_image_resource_empty(&create_image_resource(
            source,
            &create_image_resolver_state()
        )));
    }

    #[test]
    fn reports_measured_content_as_non_empty() {
        let source = source();
        assert!(!is_image_resource_empty(&create_image_resource(
            source.clone(),
            &measured_state(&source, 1, 1)
        )));
    }
}
