//! flight-node's generic feature functions over the flat 2D fields (Principal 939e24d3 borrowed
//! views), across built-in and caller-declared 2D kinds.

use std::sync::{Arc, RwLock};

use flight_clip::create_clip_region_from_rectangle;
use flight_geometry::{create_rectangle, create_transform2d};
use flight_materials::contract::{Material2D, create_standard_material};
use flight_node::contract::NodeRevisionState;
use flight_node::{
    NodeRef, add_node_child, get_node_local_matrix, get_node_parent_bounds_rectangle,
    get_node_transform2d, get_node_world_bounds_rectangle, get_node_world_matrix,
    set_node_transform2d,
};
use flight_scene2d::contract::*;

use crate::scene2d_fixture::*;

fn revisions() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}

fn custom_node(x: f32) -> Node2DRef {
    let base = PartialNode2D {
        x: Some(x),
        ..node2d_options()
    };
    let node: Node2DTest = create_node2d("Custom".to_string(), Some(&base), None);
    return Arc::new(RwLock::new(node));
}

fn sprite_node(width: u32, height: u32, x: f32) -> Node2DRef {
    let make: fn() -> PartialSprite = PartialSprite::default;
    let obj = PartialSprite {
        data: Some(SpriteDataOptions {
            texture: Some(texture(width, height)),
        }),
        node: PartialNode2D {
            x: Some(x),
            ..node2d_options()
        },
        ..make()
    };
    return create_sprite(Some(&obj));
}

mod get_node_local_matrix {
    use super::*;

    #[test]
    fn composes_the_flat_transform_fields() {
        let base = PartialNode2D {
            x: Some(10.0),
            y: Some(20.0),
            scale_x: Some(2.0),
            scale_y: Some(3.0),
            ..node2d_options()
        };
        let node: NodeRef = create_display_object(Some(&base));
        let matrix = get_node_local_matrix(&node);
        assert_eq!(
            (matrix.a, matrix.d, matrix.tx, matrix.ty),
            (2.0, 3.0, 10.0, 20.0)
        );
    }

    #[test]
    fn follows_a_bare_field_write_after_manual_invalidation() {
        let node = display_object();
        let as_node: NodeRef = node.clone();
        assert_eq!(get_node_local_matrix(&as_node).tx, 0.0);
        node.write().unwrap().node2d_fields_mut().x = 7.0;
        flight_node::invalidate_node_local_transform(&as_node);
        assert_eq!(get_node_local_matrix(&as_node).tx, 7.0);
    }
}

mod get_node_parent_bounds_rectangle {
    use super::*;

    #[test]
    fn maps_a_sprites_texture_bounds_through_its_flat_position() {
        let node: NodeRef = sprite_node(16, 12, 5.0);
        let bounds = get_node_parent_bounds_rectangle(&node);
        assert_eq!((bounds.x, bounds.width, bounds.height), (5.0, 16.0, 12.0));
    }
}

mod get_node_transform2d {
    use super::*;

    #[test]
    fn reads_and_writes_the_flat_fields_of_any_2d_kind() {
        for node in [sprite_node(1, 1, 0.0), custom_node(0.0), display_object()] {
            let as_node: NodeRef = node.clone();
            set_node_transform2d(
                &as_node,
                &create_transform2d(1.0, 2.0, 30.0, 4.0, 5.0, 0.0, 0.0, 6.0, 7.0),
            );
            {
                let guard = node.read().unwrap();
                let f = guard.node2d_fields();
                assert_eq!(
                    (f.x, f.y, f.rotation, f.scale_x, f.scale_y),
                    (1.0, 2.0, 30.0, 4.0, 5.0)
                );
                assert_eq!((f.pivot_x, f.pivot_y), (6.0, 7.0));
            }
            let make: fn() -> flight_geometry::Transform2D = flight_geometry::Transform2D::default;
            let mut out = make();
            get_node_transform2d(&mut out, &as_node);
            assert_eq!(
                (out.x, out.y, out.rotation, out.scale_x, out.scale_y),
                (1.0, 2.0, 30.0, 4.0, 5.0)
            );
        }
    }
}

mod get_node_world_bounds_rectangle {
    use super::*;

    #[test]
    fn offsets_a_child_sprite_by_its_parents_flat_position() {
        let parent = custom_node(100.0);
        let child = sprite_node(16, 12, 5.0);
        add_node_child(&as_node(&parent), &as_node(&child));
        let bounds = get_node_world_bounds_rectangle(&as_node(&child), &mut revisions());
        assert_eq!((bounds.x, bounds.width, bounds.height), (105.0, 16.0, 12.0));
    }
}

mod get_node_world_matrix {
    use super::*;

    #[test]
    fn composes_parent_and_child_flat_transforms_across_kinds() {
        let parent = custom_node(5.0);
        let child = sprite_node(1, 1, 3.0);
        add_node_child(&as_node(&parent), &as_node(&child));
        let world = get_node_world_matrix(&as_node(&child), &mut revisions());
        assert_eq!((world.tx, world.ty), (8.0, 0.0));
    }
}

mod node2d_feature_views {
    use super::*;

    #[test]
    fn narrows_any_2d_kind_to_every_flat_feature_view() {
        for node in [
            sprite_node(1, 1, 0.0),
            custom_node(0.0),
            create_html_view(None) as Node2DRef,
        ] {
            let mut guard = node.write().unwrap();
            assert!(guard.as_transform2d_node().is_some() && guard.as_bounds_node().is_some());
            assert!(guard.as_appearance_node().is_some() && guard.as_clip_node().is_some());
            assert!(guard.as_material_node().is_some());
            *guard.as_transform2d_node_mut().unwrap().transform2d_mut().x = 9.0;
            *guard.appearance_mut().alpha = 0.25;
            assert_eq!(
                (guard.node2d_fields().x, guard.node2d_fields().alpha),
                (9.0, 0.25)
            );
            assert_eq!(
                (*guard.transform2d().x, *guard.appearance().alpha),
                (9.0, 0.25)
            );
        }
    }

    #[test]
    fn clip_and_material_views_alias_the_flat_handles() {
        let node = display_object();
        let clip = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 4.0, 4.0));
        let material: flight_entity::Ref<dyn Material2D> =
            Arc::new(RwLock::new(create_standard_material()));
        {
            let mut guard = node.write().unwrap();
            *guard.clip_view_mut().clip = Some(clip.clone());
            *guard.material_view_mut().material = Some(material.clone());
        }
        let guard = node.read().unwrap();
        assert!(Arc::ptr_eq(
            guard.node2d_fields().clip.as_ref().unwrap(),
            &clip
        ));
        assert!(Arc::ptr_eq(guard.clip_view().clip.as_ref().unwrap(), &clip));
        assert!(Arc::ptr_eq(
            guard.material_view().material.as_ref().unwrap(),
            &material
        ));
        assert!(guard.material_view().material_data.is_none());
    }
}
