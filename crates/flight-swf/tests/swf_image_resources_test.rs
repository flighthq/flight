use std::sync::{Arc, RwLock};

use flight_bitmap::{BITMAP_TEXTURE_SOURCE_KIND, Bitmap};
use flight_image::{ImageResourceReference, create_image_resolver_state};
use flight_image_codec::{
    DecodedImage, HostImageDecodeCapabilities, HostImageDecodeFormatCapability,
};
use flight_node::{NodeRef, get_node_children};
use flight_resource::ResourceResolutionState;
use flight_scene2d_resources::{Scene2DResourceFailureGuardState, load_scene2d_image_resources};
use flight_shape::contract::{SHAPE_KIND, Shape, ShapeCommandToken};
use flight_swf::contract::{SWF_ALL_TAG_HANDLERS, SwfParseOptions, create_scene2d_from_swf};
use flight_texture::get_texture_source;

use crate::support::{
    TAG_END, TAG_SHOW_FRAME, block_on, create_bitmap_shape_bytes, create_rectangle_record,
    create_swf, create_tag, join_bytes, uint16,
};

mod swf_image_resources {
    use super::*;

    #[test]
    fn decodes_an_embedded_png_and_binds_its_pixels_to_the_bitmap_fill_texture() {
        let image_bytes = vec![
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
            8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15,
            0, 1, 5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
        ];
        let image = join_bytes(&[&uint16(9), &image_bytes]);
        let shape = join_bytes(&[
            &uint16(7),
            &create_rectangle_record(0, 20, 0, 20),
            &create_bitmap_shape_bytes(
                &[(0x41, 9, Some(20.0))],
                &[(20, 0), (0, 20), (-20, 0), (0, -20)],
            ),
        ]);
        let placement = join_bytes(&[&[0x02], &uint16(1), &uint16(7)]);
        let source = create_swf(
            &[
                create_tag(21, &image),
                create_tag(32, &shape),
                create_tag(26, &placement),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 20, 0, 20],
        );
        let options = SwfParseOptions {
            deflate: None,
            lzma: None,
            tags: Some(SWF_ALL_TAG_HANDLERS.clone()),
        };
        let document = create_scene2d_from_swf(&source, &options, None).unwrap();
        let root: NodeRef = document.read().unwrap().root.clone();
        let mut children = Vec::new();
        get_node_children(&mut children, &root);
        let texture = {
            let node = children[0].read().unwrap();
            assert_eq!(node.node_fields().kind, SHAPE_KIND);
            let shape = node.as_any().downcast_ref::<Shape>().unwrap();
            let ShapeCommandToken::String(first_command) = &shape.data.commands[0] else {
                panic!("expected a texture-fill command");
            };
            assert_eq!(first_command, "beginTextureFill");
            shape
                .data
                .commands
                .iter()
                .find_map(|token| match token {
                    ShapeCommandToken::Texture(texture) => Some(texture.clone()),
                    _ => None,
                })
                .unwrap()
        };

        let reference = document.read().unwrap().image_resources[0].clone();
        let ImageResourceReference::Embedded(embedded) = &reference else {
            panic!("expected an embedded image reference");
        };
        {
            let embedded = embedded.reference.read().unwrap();
            assert_eq!(embedded.mime_type.as_deref(), Some("image/png"));
            assert_eq!(&**embedded.bytes.read().unwrap(), &image_bytes);
            assert_eq!(embedded.textures.len(), 1);
            assert!(Arc::ptr_eq(&embedded.textures[0], &texture));
        }
        assert!(get_texture_source(&*texture.read().unwrap()).is_none());

        let capabilities = HostImageDecodeCapabilities {
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
        let guard_state = Arc::new(RwLock::new(Scene2DResourceFailureGuardState {
            enabled: false,
            guard: None,
        }));
        let resources = block_on(load_scene2d_image_resources(
            &capabilities,
            &document,
            None,
            &create_image_resolver_state(),
            &guard_state,
        ));

        assert_eq!(resources.resolved.len(), 1);
        let ImageResourceReference::Embedded(resolved) = &resources.resolved[0] else {
            panic!("expected the embedded reference to resolve");
        };
        assert!(Arc::ptr_eq(&resolved.reference, &embedded.reference));
        assert!(resources.unresolved.is_empty());
        assert_eq!(
            embedded.reference.read().unwrap().state,
            ResourceResolutionState::Resolved,
        );
        let image = get_texture_source(&*texture.read().unwrap()).unwrap();
        let image = image.read().unwrap();
        assert_eq!(
            image.texture_source_fields().kind,
            BITMAP_TEXTURE_SOURCE_KIND
        );
        assert_eq!(
            (
                image.texture_source_fields().width,
                image.texture_source_fields().height,
            ),
            (1, 1),
        );
        let any: &dyn std::any::Any = &*image;
        assert_eq!(
            &*any.downcast_ref::<Bitmap>().unwrap().data,
            &[0x11, 0x22, 0x33, 0xff],
        );
        let rebound = get_texture_source(
            &*embedded.reference.read().unwrap().textures[0]
                .read()
                .unwrap(),
        )
        .unwrap();
        assert!(Arc::ptr_eq(
            &rebound,
            &get_texture_source(&*texture.read().unwrap()).unwrap()
        ));
    }
}
