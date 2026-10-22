use std::sync::Arc;

use flight_entity::{
    allocate_entity, attach_entity_binding, get_entity_binding_as, get_entity_id, get_entity_uid,
    set_entity_uid,
};
use flight_geometry::{Rectangle, create_rectangle};
use flight_node::{
    NodeRef, RendererData, get_node_local_bounds_rectangle, get_node_local_bounds_revision,
    get_node_local_content_revision,
};
use flight_scene2d::contract::*;
use flight_texture::{TextureUvTransform, set_texture_uv_from_pixel_rect};

use crate::scene2d_fixture::*;

fn sprite_with(
    texture: Option<flight_entity::Ref<flight_texture::Texture>>,
) -> flight_entity::Ref<Sprite> {
    let sprite = create_sprite();
    sprite.write().unwrap().data.texture = texture;
    return sprite;
}

fn local_size(node: &NodeRef) -> (f32, f32) {
    let bounds: Rectangle = get_node_local_bounds_rectangle(node);
    return (bounds.width, bounds.height);
}

mod clone_sprite {
    use super::*;

    #[test]
    fn shares_the_texture_through_a_fresh_sprite() {
        let source = sprite_with(Some(texture(10, 20)));
        let copy = clone_sprite(&source.read().unwrap());
        assert!(!Arc::ptr_eq(&copy, &source));
        assert!(Arc::ptr_eq(
            copy.read().unwrap().data.texture.as_ref().unwrap(),
            source.read().unwrap().data.texture.as_ref().unwrap()
        ));
    }

    #[test]
    fn copies_only_the_texture_not_the_base_fields() {
        let source = sprite_with(None);
        source.write().unwrap().x = 40.0;
        source.write().unwrap().name = Some("hero".to_string());
        let copy = clone_sprite(&source.read().unwrap());
        assert_eq!(
            (copy.read().unwrap().x, copy.read().unwrap().name.clone()),
            (0.0, None)
        );
    }
}

mod compute_sprite_local_bounds_rectangle {
    use super::*;

    #[test]
    fn uses_texture_dimensions_multiplied_by_its_uv_window() {
        let image = texture(100, 200);
        set_texture_uv_from_pixel_rect(&mut *image.write().unwrap(), 10.0, 20.0, 30.0, 40.0);
        let sprite = sprite_with(Some(image));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_sprite_local_bounds_rectangle(&mut out, &*sprite.read().unwrap());
        // The source's exact 30 x 40 is an f64 product; flight-texture keeps the uv window in f32
        // (approved D1 geometry width), where 100 * 0.3 rounds to 30.000002.
        assert!((out.width - 30.0).abs() <= 30.0 * f32::EPSILON);
        assert!((out.height - 40.0).abs() <= 40.0 * f32::EPSILON);
    }

    #[test]
    fn sets_an_empty_size_when_texture_is_null() {
        let sprite = create_sprite();
        let mut out = create_rectangle(0.0, 0.0, 50.0, 60.0);
        compute_sprite_local_bounds_rectangle(&mut out, &*sprite.read().unwrap());
        assert_eq!((out.width, out.height), (0.0, 0.0));
    }

    #[test]
    fn swaps_non_square_atlas_extents_through_a_quarter_turn_uv_view() {
        let image = texture(100, 50);
        {
            let mut guard = image.write().unwrap();
            let fields = guard.texture_fields_mut();
            fields.uv_scale.x = 0.3;
            fields.uv_scale.y = 0.2;
            fields.uv_rotation = -std::f32::consts::FRAC_PI_2;
        }
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_sprite_local_bounds_rectangle(&mut out, &*sprite_with(Some(image)).read().unwrap());
        assert!((out.width - 15.0).abs() < 1e-4 && (out.height - 20.0).abs() < 1e-4);
    }

    #[test]
    fn stamps_the_texture_identity_and_version() {
        let image = texture(8, 8);
        image.write().unwrap().texture_fields_mut().version = 4;
        let sprite = sprite_with(Some(image.clone()));
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_sprite_local_bounds_rectangle(&mut out, &*sprite.read().unwrap());
        let guard = sprite.read().unwrap();
        let runtime = get_sprite_runtime(&guard);
        let runtime = runtime.read().unwrap();
        assert!(Arc::ptr_eq(
            runtime.local_bounds_texture.as_ref().unwrap(),
            &image
        ));
        assert_eq!(runtime.local_bounds_texture_version, 4);
    }
}

mod create_sprite {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let sprite = create_sprite();
        assert!(sprite.read().unwrap().data.texture.is_none());
        assert_eq!(sprite.read().unwrap().kind, SPRITE_KIND);
    }

    #[test]
    fn allows_pre_defined_values() {
        let image = texture(10, 10);
        let obj = sprite_with(Some(image.clone()));
        assert!(Arc::ptr_eq(
            obj.read().unwrap().data.texture.as_ref().unwrap(),
            &image
        ));
    }

    #[test]
    fn returns_a_new_object_each_call() {
        assert!(!Arc::ptr_eq(&create_sprite(), &create_sprite()));
    }

    #[test]
    fn fields_can_be_assigned_after_creation() {
        let sprite = create_sprite();
        {
            let mut s = sprite.write().unwrap();
            s.node2d_fields_mut().x = 7.0;
            s.node2d_fields_mut().alpha = 0.5;
        }
        assert_eq!(
            (sprite.read().unwrap().x, sprite.read().unwrap().alpha),
            (7.0, 0.5)
        );
    }
}

mod create_sprite_data {
    use super::*;

    #[test]
    fn returns_default_values() {
        assert!(create_sprite_data().texture.is_none());
    }

    #[test]
    fn texture_can_be_assigned_after_creation() {
        let image = texture(10, 10);
        let mut data = create_sprite_data();
        data.texture = Some(image.clone());
        assert!(Arc::ptr_eq(data.texture.as_ref().unwrap(), &image));
    }
}

mod create_sprite_renderer_data {
    use super::*;

    #[test]
    fn creates_a_clean_per_state_stamp_for_the_current_texture() {
        let sprite = sprite_with(Some(texture(16, 16)));
        let mut data = create_sprite_renderer_data(&*sprite.read().unwrap());
        assert!(!is_sprite_renderer_dirty(
            &*sprite.read().unwrap(),
            Some(&mut data)
        ));
        assert!(Arc::ptr_eq(
            data.texture_identity.as_ref().unwrap(),
            sprite.read().unwrap().data.texture.as_ref().unwrap()
        ));
        assert_eq!(data.texture_version, 0);
    }

    #[test]
    fn stamps_no_texture_as_version_minus_one() {
        let data = create_sprite_renderer_data(&*create_sprite().read().unwrap());
        assert!(data.texture_identity.is_none());
        assert_eq!(data.texture_version, -1);
    }
}

mod create_sprite_runtime {
    use super::*;

    #[test]
    fn uses_compute_sprite_local_bounds_rectangle() {
        let runtime = create_sprite_runtime();
        let sprite = sprite_with(Some(texture(12, 34)));
        let mut via_runtime = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let mut direct = create_rectangle(0.0, 0.0, 0.0, 0.0);
        (runtime.bounds.compute_local_bounds_rectangle)(&mut via_runtime, &*sprite.read().unwrap());
        compute_sprite_local_bounds_rectangle(&mut direct, &*sprite.read().unwrap());
        assert_eq!(via_runtime, direct);
        assert_eq!((direct.width, direct.height), (12.0, 34.0));
    }

    #[test]
    fn installs_the_texture_aware_local_bounds_validity_hook() {
        let runtime = create_sprite_runtime();
        assert!(runtime.bounds.is_local_bounds_rectangle_valid.is_some());
        let sprite = create_sprite();
        let guard = sprite.read().unwrap();
        let own = get_sprite_runtime(&guard);
        let own = own.read().unwrap();
        assert!(own.local_bounds_texture.is_none());
        assert_eq!(own.local_bounds_texture_version, -1);
    }
}

mod get_sprite_runtime {
    use super::*;

    #[test]
    fn returns_the_live_runtime_of_the_given_sprite() {
        let sprite = sprite_with(Some(texture(3, 3)));
        let node: NodeRef = sprite.clone();
        get_node_local_bounds_rectangle(&node);
        let guard = sprite.read().unwrap();
        assert!(
            get_sprite_runtime(&guard)
                .read()
                .unwrap()
                .local_bounds_texture
                .is_some()
        );
    }
}

mod initialize_sprite {
    use super::*;

    #[test]
    fn constructs_raw_sprite_bounds_and_preserves_entity_and_texture_identity() {
        let mut sprite: Sprite = allocate_entity();
        let id = get_entity_id(&sprite);
        let binding = Arc::new(());
        set_entity_uid(&mut sprite, "raw-sprite".to_string());
        attach_entity_binding(&mut sprite, Box::new(binding.clone()));
        assert!(!is_node2d(&sprite));

        initialize_sprite(&mut sprite);

        assert_eq!(get_entity_id(&sprite), id);
        assert_eq!(get_entity_uid(&mut sprite), "raw-sprite");
        assert!(Arc::ptr_eq(
            get_entity_binding_as::<Arc<()>, _>(&sprite).unwrap(),
            &binding
        ));
        assert_eq!(sprite.kind, SPRITE_KIND);
        assert!(is_node2d(&sprite));
        assert!(sprite.enabled && sprite.visible && sprite.data.texture.is_none());
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
        assert!(Arc::ptr_eq(sprite.data.texture.as_ref().unwrap(), &image));
        let runtime = get_sprite_runtime(&sprite);
        let runtime = runtime.read().unwrap();
        assert!(Arc::ptr_eq(
            runtime.local_bounds_texture.as_ref().unwrap(),
            &image
        ));
        assert_eq!(runtime.local_bounds_texture_version, 0);
    }

    #[test]
    fn is_the_construction_initializer_of_create_sprite() {
        let sprite = create_sprite();
        let mut guard = sprite.write().unwrap();
        guard.data.texture = Some(texture(10, 10));
        initialize_sprite(&mut *guard);
        assert!(guard.data.texture.is_none());
    }
}

mod initialize_sprite_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_sprite_data() {
        let mut data = create_sprite_data();
        data.texture = Some(texture(1, 1));
        initialize_sprite_data(&mut data);
        assert!(data.texture.is_none());
    }
}

mod initialize_sprite_renderer_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_restamping_from_the_source() {
        let first = sprite_with(Some(texture(2, 2)));
        let second = sprite_with(Some(texture(3, 3)));
        let mut data = create_sprite_renderer_data(&*first.read().unwrap());
        initialize_sprite_renderer_data(&mut data, &*second.read().unwrap());
        assert!(Arc::ptr_eq(
            data.texture_identity.as_ref().unwrap(),
            second.read().unwrap().data.texture.as_ref().unwrap()
        ));
    }
}

mod is_sprite_renderer_dirty {
    use super::*;

    #[test]
    fn detects_same_size_bare_texture_assignment_once_without_node_invalidation() {
        let sprite = sprite_with(Some(texture(64, 64)));
        let mut data = create_sprite_renderer_data(&*sprite.read().unwrap());
        let content_id = get_node_local_content_revision(&*sprite.read().unwrap());
        sprite.write().unwrap().data.texture = Some(texture(64, 64));
        assert!(is_sprite_renderer_dirty(
            &*sprite.read().unwrap(),
            Some(&mut data)
        ));
        assert!(!is_sprite_renderer_dirty(
            &*sprite.read().unwrap(),
            Some(&mut data)
        ));
        assert_eq!(
            get_node_local_content_revision(&*sprite.read().unwrap()),
            content_id
        );
    }

    #[test]
    fn detects_a_version_bump_on_the_same_texture_identity() {
        let sprite = sprite_with(Some(texture(64, 64)));
        let mut data = create_sprite_renderer_data(&*sprite.read().unwrap());
        sprite
            .read()
            .unwrap()
            .data
            .texture
            .as_ref()
            .unwrap()
            .write()
            .unwrap()
            .texture_fields_mut()
            .version += 1;
        assert!(is_sprite_renderer_dirty(
            &*sprite.read().unwrap(),
            Some(&mut data)
        ));
    }

    #[test]
    fn detects_texture_removal_and_works_through_the_erased_handle() {
        let sprite = sprite_with(Some(texture(4, 4)));
        let handle: flight_entity::Ref<dyn RendererData> = Arc::new(std::sync::RwLock::new(
            create_sprite_renderer_data(&*sprite.read().unwrap()),
        ));
        sprite.write().unwrap().data.texture = None;
        assert!(is_sprite_renderer_dirty(
            &*sprite.read().unwrap(),
            Some(&mut *handle.write().unwrap())
        ));
        assert!(!is_sprite_renderer_dirty(
            &*sprite.read().unwrap(),
            Some(&mut *handle.write().unwrap())
        ));
    }

    #[test]
    fn returns_false_without_renderer_data_or_for_foreign_renderer_data() {
        let sprite = sprite_with(Some(texture(4, 4)));
        assert!(!is_sprite_renderer_dirty(&*sprite.read().unwrap(), None));
        let make: fn() -> ForeignRendererData = ForeignRendererData::default;
        let mut foreign = make();
        assert!(!is_sprite_renderer_dirty(
            &*sprite.read().unwrap(),
            Some(&mut foreign)
        ));
    }

    #[test]
    fn stamps_a_nine_slice_sprites_texture_too() {
        let grid = create_rectangle(0.0, 0.0, 1.0, 1.0);
        let sprite = create_scale9_sprite(&grid);
        sprite.write().unwrap().data.texture = Some(texture(2, 2));
        let mut data = create_sprite_renderer_data(&*sprite.read().unwrap());
        assert_eq!(data.texture_version, 0);
        sprite.write().unwrap().data.texture = Some(texture(2, 2));
        assert!(is_sprite_renderer_dirty(
            &*sprite.read().unwrap(),
            Some(&mut data)
        ));
    }
}

mod sprite_local_bounds_validity {
    use super::*;

    #[test]
    fn refreshes_bounds_after_bare_texture_assignment_without_changing_local_bounds_id() {
        let sprite = sprite_with(Some(texture(16, 12)));
        let node: NodeRef = sprite.clone();
        assert_eq!(local_size(&node), (16.0, 12.0));
        let local_bounds_id = get_node_local_bounds_revision(&*node.read().unwrap());
        sprite.write().unwrap().data.texture = Some(texture(48, 30));
        assert_eq!(local_size(&node), (48.0, 30.0));
        assert_eq!(
            get_node_local_bounds_revision(&*node.read().unwrap()),
            local_bounds_id
        );
    }

    #[test]
    fn refreshes_bounds_after_a_version_bump_on_the_same_texture() {
        let image = texture(16, 12);
        let sprite = sprite_with(Some(image.clone()));
        let node: NodeRef = sprite.clone();
        assert_eq!(local_size(&node), (16.0, 12.0));
        set_texture_uv_from_pixel_rect(&mut *image.write().unwrap(), 0.0, 0.0, 8.0, 6.0);
        assert_eq!(
            local_size(&node),
            (16.0, 12.0),
            "an unversioned uv edit keeps the cached bounds"
        );
        image.write().unwrap().texture_fields_mut().version += 1;
        assert_eq!(local_size(&node), (8.0, 6.0));
    }

    #[test]
    fn treats_removing_the_texture_as_a_change() {
        let sprite = sprite_with(Some(texture(5, 5)));
        let node: NodeRef = sprite.clone();
        assert_eq!(local_size(&node), (5.0, 5.0));
        sprite.write().unwrap().data.texture = None;
        assert_eq!(local_size(&node), (0.0, 0.0));
    }
}

#[derive(Default)]

struct ForeignRendererData {
    renderer_data: flight_node::RendererDataFields,
}

flight_node::impl_renderer_data!(ForeignRendererData);

mod initialize_sprite {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_sprite() {
        let sprite = create_sprite();
        let mut guard = sprite.write().unwrap();
        guard.data.texture = Some(texture(10, 10));
        initialize_sprite(&mut *guard);
        assert!(guard.data.texture.is_none());
    }
}
