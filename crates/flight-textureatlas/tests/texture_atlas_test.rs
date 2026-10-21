use std::sync::{Arc, RwLock};

use flight_bitmap::create_bitmap;
use flight_image::{CompressedImageData, create_compressed_image_resource};
use flight_texture::{TextureSourceRef, TextureUvTransform};
use flight_texture_formats::{
    TextureContainer, TextureContainerFormat, TextureContainerLevel,
    TextureContainerSupercompression,
};
use flight_textureatlas::contract::*;

use crate::texture_atlas_fixture::*;

fn region_for_test() -> flight_entity::Ref<TextureAtlasRegion> {
    return create_texture_atlas_region(Some(&TextureAtlasRegionOptions {
        height: Some(1.0),
        id: Some(0),
        width: Some(1.0),
        ..region_options()
    }));
}

mod create_texture_atlas {
    use super::*;

    #[test]
    fn allows_pre_defined_values() {
        let texture = empty_page();
        let regions = vec![create_texture_atlas_region(None)];
        let obj = create_texture_atlas(Some(TextureAtlasOptions {
            regions: Some(regions.clone()),
            texture: Some(texture.clone()),
            ..atlas_options()
        }));
        let obj = obj.read().unwrap();
        assert!(Arc::ptr_eq(obj.texture.as_ref().unwrap(), &texture));
        assert_eq!(obj.regions.len(), 1);
        assert!(Arc::ptr_eq(&obj.regions[0], &regions[0]));
    }

    #[test]
    fn initializes_default_values() {
        let atlas = create_texture_atlas(None);
        let atlas = atlas.read().unwrap();
        assert!(atlas.texture.is_none());
        assert!(atlas.regions.is_empty());
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (0.0, 0.0, 1.0)
        );
        assert!(atlas.image_name.is_none());
    }

    #[test]
    fn takes_every_page_metadata_field() {
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            image_height: Some(64.0),
            image_name: Some("page.png".to_string()),
            image_width: Some(128.0),
            scale: Some(0.5),
            ..atlas_options()
        }));
        let atlas = atlas.read().unwrap();
        assert_eq!(
            (atlas.image_width, atlas.image_height, atlas.scale),
            (128.0, 64.0, 0.5)
        );
        assert_eq!(atlas.image_name.as_deref(), Some("page.png"));
    }

    #[test]
    fn uses_a_provided_regions_vector_directly() {
        let regions = vec![create_texture_atlas_region(None)];
        let address = regions.as_ptr();
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            regions: Some(regions),
            ..atlas_options()
        }));
        assert_eq!(atlas.read().unwrap().regions.as_ptr(), address);
    }
}

mod dispose_texture_atlas {
    use super::*;

    #[test]
    fn drops_the_regions_and_the_texture_reference_leaving_the_atlas_reusable() {
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            regions: Some(vec![region_for_test()]),
            texture: Some(empty_page()),
            ..atlas_options()
        }));
        dispose_texture_atlas(&mut atlas.write().unwrap());
        assert!(atlas.read().unwrap().regions.is_empty());
        assert!(atlas.read().unwrap().texture.is_none());
        assert_eq!(get_texture_atlas_byte_size(&atlas.read().unwrap()), 0);
        add_texture_atlas_region(
            &mut atlas.write().unwrap(),
            0.0,
            0.0,
            1.0,
            1.0,
            None,
            None,
            None,
        );
        assert_eq!(get_texture_atlas_region_count(&atlas.read().unwrap()), 1);
    }

    #[test]
    fn does_not_destroy_the_texture_it_was_handed() {
        let texture = empty_page();
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            texture: Some(texture.clone()),
            ..atlas_options()
        }));
        dispose_texture_atlas(&mut atlas.write().unwrap());
        assert_eq!(Arc::strong_count(&texture), 1);
        assert!(texture.read().unwrap().source.is_none());
        assert_eq!(texture.read().unwrap().texture_fields().version, 0);
    }

    #[test]
    fn is_idempotent() {
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            texture: Some(empty_page()),
            ..atlas_options()
        }));
        dispose_texture_atlas(&mut atlas.write().unwrap());
        dispose_texture_atlas(&mut atlas.write().unwrap());
        assert!(atlas.read().unwrap().texture.is_none());
    }
}

mod get_texture_atlas_byte_size {
    use super::*;

    #[test]
    fn returns_0_when_the_atlas_has_no_image() {
        assert_eq!(
            get_texture_atlas_byte_size(&create_texture_atlas(None).read().unwrap()),
            0
        );
        let unbound = create_texture_atlas(Some(TextureAtlasOptions {
            texture: Some(empty_page()),
            ..atlas_options()
        }));
        assert_eq!(get_texture_atlas_byte_size(&unbound.read().unwrap()), 0);
    }

    #[test]
    fn returns_0_when_the_atlas_image_has_no_data() {
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            texture: Some(page(Some(image(4, 4) as TextureSourceRef), common())),
            ..atlas_options()
        }));
        assert_eq!(get_texture_atlas_byte_size(&atlas.read().unwrap()), 0);
    }

    #[test]
    fn returns_the_bitmap_data_byte_length_when_data_is_present() {
        let bitmap: TextureSourceRef = Arc::new(RwLock::new(create_bitmap(8, 8, None)));
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            texture: Some(page(Some(bitmap), common())),
            ..atlas_options()
        }));
        assert_eq!(get_texture_atlas_byte_size(&atlas.read().unwrap()), 256);
    }

    #[test]
    fn returns_the_compressed_payload_byte_length() {
        let data = Arc::new(CompressedImageData {
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
            payload: Arc::new(RwLock::new(vec![0; 48].into_boxed_slice())),
        });
        let compressed: TextureSourceRef = create_compressed_image_resource(data);
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            texture: Some(page(Some(compressed), common())),
            ..atlas_options()
        }));
        assert_eq!(get_texture_atlas_byte_size(&atlas.read().unwrap()), 48);
    }

    #[test]
    fn trusts_the_open_kind_and_reports_0_for_a_relabelled_source() {
        let bitmap = Arc::new(RwLock::new(create_bitmap(8, 8, None)));
        bitmap.write().unwrap().kind = "custom".to_string();
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            texture: Some(page(Some(bitmap as TextureSourceRef), common())),
            ..atlas_options()
        }));
        assert_eq!(get_texture_atlas_byte_size(&atlas.read().unwrap()), 0);
    }
}

mod initialize_texture_atlas {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_texture_atlas() {
        let atlas = create_texture_atlas(Some(TextureAtlasOptions {
            image_width: Some(9.0),
            regions: Some(vec![region_for_test()]),
            ..atlas_options()
        }));
        initialize_texture_atlas(&mut atlas.write().unwrap(), None);
        assert_eq!(atlas.read().unwrap().image_width, 0.0);
        assert!(atlas.read().unwrap().regions.is_empty());
        assert_eq!(atlas.read().unwrap().scale, 1.0);
    }
}
