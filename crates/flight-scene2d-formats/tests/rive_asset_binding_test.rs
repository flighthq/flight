use std::sync::Arc;

use flight_scene2d::{Node2DRef, SPRITE_KIND, create_display_object};
use flight_scene2d_formats::contract::*;
use flight_texture::{TextureDimension, TextureVariant};

mod create_rive_image_sprite {
    use super::*;

    #[test]
    fn stands_up_a_sprite_whose_texture_has_no_source_until_a_resource_resolves() {
        let sprite = create_rive_image_sprite("logo", 0);
        assert_eq!(sprite.read().unwrap().node_fields().kind, SPRITE_KIND);
        assert_eq!(
            sprite.read().unwrap().node_fields().name.as_deref(),
            Some("logo"),
        );
        let texture = get_rive_image_texture(&sprite).unwrap();
        let texture = texture.read().unwrap();
        assert_eq!(texture.dimension(), TextureDimension::Texture2D);
        assert!(texture.source_2d().unwrap().is_none());
    }

    #[test]
    fn gives_each_sprite_its_own_texture_so_one_asset_can_bind_many_placements() {
        let first = create_rive_image_sprite("logo", 2);
        let second = create_rive_image_sprite("logo", 2);
        assert!(!Arc::ptr_eq(
            &get_rive_image_texture(&first).unwrap(),
            &get_rive_image_texture(&second).unwrap(),
        ));
        assert_eq!(get_rive_image_asset_index(&second), 2);
    }
}

mod get_rive_image_asset_index {
    use super::*;

    #[test]
    fn reports_the_asset_position_the_sprite_waits_on() {
        assert_eq!(
            get_rive_image_asset_index(&create_rive_image_sprite("logo", 3)),
            3,
        );
    }

    #[test]
    fn reports_negative_one_for_a_node_that_is_not_an_image_sprite() {
        let node: Node2DRef = create_display_object();
        assert_eq!(get_rive_image_asset_index(&node), -1);
    }
}

mod get_rive_image_texture {
    use super::*;

    #[test]
    fn returns_the_texture_the_decoded_asset_will_bind_into() {
        assert!(get_rive_image_texture(&create_rive_image_sprite("logo", 0)).is_some());
    }

    #[test]
    fn returns_none_for_a_node_that_is_not_an_image_sprite() {
        let node: Node2DRef = create_display_object();
        assert!(get_rive_image_texture(&node).is_none());
    }
}

mod get_rive_nested_artboard_index {
    use super::*;

    #[test]
    fn returns_the_artboard_a_marked_site_names() {
        let node: Node2DRef = create_display_object();
        mark_rive_nested_artboard(&node, 4);
        assert_eq!(get_rive_nested_artboard_index(&node), 4);
    }

    #[test]
    fn returns_negative_one_for_a_node_that_names_no_nested_artboard() {
        let node: Node2DRef = create_display_object();
        assert_eq!(get_rive_nested_artboard_index(&node), -1);
    }

    #[test]
    fn separates_a_nested_artboard_site_from_an_image_sprite() {
        assert_eq!(
            get_rive_nested_artboard_index(&create_rive_image_sprite("logo", 0)),
            -1,
        );
    }
}

mod mark_rive_nested_artboard {
    use super::*;

    #[test]
    fn records_a_slot_site_without_putting_format_knowledge_on_the_node() {
        let node: Node2DRef = create_display_object();
        mark_rive_nested_artboard(&node, 0);
        assert_eq!(get_rive_nested_artboard_index(&node), 0);
    }

    #[test]
    fn replaces_an_earlier_mark_rather_than_keeping_both() {
        let node: Node2DRef = create_display_object();
        mark_rive_nested_artboard(&node, 1);
        mark_rive_nested_artboard(&node, 2);
        assert_eq!(get_rive_nested_artboard_index(&node), 2);
    }
}
