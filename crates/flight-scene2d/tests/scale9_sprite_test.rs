use std::sync::Arc;

use flight_entity::{
    allocate_entity, attach_entity_binding, get_entity_binding_as, get_entity_id, get_entity_uid,
    set_entity_uid,
};
use flight_geometry::{Rectangle, create_rectangle};
use flight_node::{NodeRef, get_node_local_bounds_rectangle, get_node_local_bounds_revision};
use flight_scene2d::contract::*;

use crate::scene2d_fixture::*;

fn grid() -> Rectangle {
    return create_rectangle(10.0, 10.0, 80.0, 80.0);
}

fn scale9_with_texture(
    texture: flight_entity::Ref<flight_texture::Texture>,
) -> flight_entity::Ref<Scale9Sprite> {
    let sprite = create_scale9_sprite(&grid());
    sprite.write().unwrap().data.texture = Some(texture);
    return sprite;
}

fn size(node: &NodeRef) -> (f32, f32) {
    let bounds = get_node_local_bounds_rectangle(node);
    return (bounds.width, bounds.height);
}

mod create_scale9_sprite {
    use super::*;

    #[test]
    fn returns_a_sprite_with_the_given_scale9_grid_on_its_data() {
        assert_eq!(
            create_scale9_sprite(&grid())
                .read()
                .unwrap()
                .data
                .scale9_grid,
            grid()
        );
    }

    #[test]
    fn initializes_with_a_null_texture() {
        assert!(
            create_scale9_sprite(&grid())
                .read()
                .unwrap()
                .data
                .texture
                .is_none()
        );
    }

    #[test]
    fn has_scale9_sprite_kind() {
        assert_eq!(
            create_scale9_sprite(&grid()).read().unwrap().kind,
            SCALE9_SPRITE_KIND
        );
    }

    #[test]
    fn allows_a_pre_defined_texture() {
        let image = texture(64, 32);
        let sprite = scale9_with_texture(image.clone());
        assert!(Arc::ptr_eq(
            sprite.read().unwrap().data.texture.as_ref().unwrap(),
            &image
        ));
    }

    #[test]
    fn returns_a_new_object_each_call() {
        assert!(!Arc::ptr_eq(
            &create_scale9_sprite(&grid()),
            &create_scale9_sprite(&grid())
        ));
    }
}

mod create_scale9_sprite_data {
    use super::*;

    #[test]
    fn stores_the_scale9_grid() {
        assert_eq!(create_scale9_sprite_data(&grid()).scale9_grid, grid());
    }

    #[test]
    fn returns_a_null_texture_by_default() {
        assert!(create_scale9_sprite_data(&grid()).texture.is_none());
    }

    #[test]
    fn uses_provided_texture_when_given() {
        let image = texture(10, 10);
        let mut data = create_scale9_sprite_data(&grid());
        data.texture = Some(image.clone());
        assert!(Arc::ptr_eq(data.texture.as_ref().unwrap(), &image));
    }
}

mod create_scale9_sprite_runtime {
    use super::*;

    #[test]
    fn uses_compute_sprite_local_bounds_rectangle() {
        let runtime = create_scale9_sprite_runtime();
        let sprite = scale9_with_texture(texture(20, 10));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        (runtime.bounds.compute_local_bounds_rectangle)(&mut out, &*sprite.read().unwrap());
        assert_eq!((out.width, out.height), (20.0, 10.0));
    }

    #[test]
    fn installs_the_texture_aware_local_bounds_validity_hook() {
        assert!(
            create_scale9_sprite_runtime()
                .bounds
                .is_local_bounds_rectangle_valid
                .is_some()
        );
        let sprite = create_scale9_sprite(&grid());
        let guard = sprite.read().unwrap();
        let own = get_scale9_sprite_runtime(&guard);
        let own = own.read().unwrap();
        assert!(own.local_bounds_texture.is_none());
        assert_eq!(own.local_bounds_texture_version, -1);
    }
}

mod get_scale9_sprite_runtime {
    use super::*;

    #[test]
    fn returns_the_live_runtime_for_a_scale9_sprite() {
        let sprite = scale9_with_texture(texture(2, 2));
        let node: NodeRef = sprite.clone();
        get_node_local_bounds_rectangle(&node);
        let guard = sprite.read().unwrap();
        assert_eq!(
            get_scale9_sprite_runtime(&guard)
                .read()
                .unwrap()
                .local_bounds_texture_version,
            0
        );
    }
}

mod initialize_scale9_sprite {
    use super::*;

    #[test]
    fn constructs_raw_scale9_bounds_with_the_defining_grid_and_same_entity() {
        let mut sprite: Scale9Sprite = allocate_entity();
        let id = get_entity_id(&sprite);
        let binding = Arc::new(());
        let scale9_grid = create_rectangle(3.0, 5.0, 17.0, 11.0);
        set_entity_uid(&mut sprite, "raw-scale9".to_string());
        attach_entity_binding(&mut sprite, Box::new(binding.clone()));
        assert!(!is_node2d(&sprite));

        initialize_scale9_sprite(&mut sprite, &scale9_grid);

        assert_eq!(get_entity_id(&sprite), id);
        assert_eq!(get_entity_uid(&mut sprite), "raw-scale9");
        assert!(Arc::ptr_eq(
            get_entity_binding_as::<Arc<()>, _>(&sprite).unwrap(),
            &binding
        ));
        assert_eq!(sprite.kind, SCALE9_SPRITE_KIND);
        assert!(is_node2d(&sprite));
        assert!(sprite.enabled && sprite.visible && sprite.data.texture.is_none());
        assert_eq!(sprite.data.scale9_grid, scale9_grid);
        assert_eq!((sprite.x, sprite.y, sprite.alpha), (0.0, 0.0, 1.0));
        assert_eq!((sprite.scale_x, sprite.scale_y), (1.0, 1.0));
        assert!(get_node2d_runtime(&sprite).scene2d.is_none());
        assert!(
            get_node2d_runtime(&sprite)
                .bounds
                .is_local_bounds_rectangle_valid
                .is_some()
        );
        let mut empty = create_rectangle(0.0, 0.0, 99.0, 88.0);
        (get_node2d_runtime(&sprite)
            .bounds
            .compute_local_bounds_rectangle)(&mut empty, &sprite);
        assert_eq!((empty.width, empty.height), (0.0, 0.0));

        let image = texture(37, 23);
        sprite.data.texture = Some(image.clone());
        let published = publish_node2d(sprite);
        let erased: NodeRef = published.clone();
        let recovered = as_node2d_ref(&erased).unwrap();
        assert!(std::ptr::addr_eq(
            Arc::as_ptr(&published),
            Arc::as_ptr(&recovered)
        ));
        let bounds = get_node_local_bounds_rectangle(&erased);
        assert_eq!((bounds.width, bounds.height), (37.0, 23.0));
        let sprite = published.read().unwrap();
        assert_eq!(get_entity_id(&*sprite), id);
        assert_eq!(sprite.data.scale9_grid, scale9_grid);
        assert!(Arc::ptr_eq(sprite.data.texture.as_ref().unwrap(), &image));
        let runtime = get_scale9_sprite_runtime(&sprite);
        let runtime = runtime.read().unwrap();
        assert!(Arc::ptr_eq(
            runtime.local_bounds_texture.as_ref().unwrap(),
            &image
        ));
        assert_eq!(runtime.local_bounds_texture_version, 0);
    }

    #[test]
    fn is_the_construction_initializer_of_create_scale9_sprite() {
        let sprite = create_scale9_sprite(&grid());
        let other_grid = create_rectangle(10.0, 20.0, 30.0, 40.0);
        let mut guard = sprite.write().unwrap();
        initialize_scale9_sprite(&mut *guard, &other_grid);
        assert_eq!(guard.data.scale9_grid, other_grid);
    }
}

mod initialize_scale9_sprite_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_scale9_sprite_data() {
        let mut data = create_scale9_sprite_data(&grid());
        data.texture = Some(texture(1, 1));
        let other = create_rectangle(1.0, 2.0, 3.0, 4.0);
        initialize_scale9_sprite_data(&mut data, &other);
        assert_eq!(data.scale9_grid, other);
        assert!(data.texture.is_none());
    }
}

mod scale9_sprite_local_bounds {
    use super::*;

    #[test]
    fn derives_bounds_from_the_texture_like_a_plain_sprite() {
        let node: NodeRef = scale9_with_texture(texture(100, 50));
        assert_eq!(size(&node), (100.0, 50.0));
    }

    #[test]
    fn refreshes_bounds_after_bare_texture_assignment() {
        let sprite = scale9_with_texture(texture(16, 12));
        let node: NodeRef = sprite.clone();
        assert_eq!(size(&node), (16.0, 12.0));
        let local_bounds_id = get_node_local_bounds_revision(&*node.read().unwrap());
        sprite.write().unwrap().data.texture = Some(texture(48, 30));
        assert_eq!(size(&node), (48.0, 30.0));
        assert_eq!(
            get_node_local_bounds_revision(&*node.read().unwrap()),
            local_bounds_id
        );
    }
}
