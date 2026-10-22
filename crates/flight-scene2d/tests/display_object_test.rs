use std::sync::Arc;

use flight_adjustments::{Adjustment, create_color_matrix_adjustment, create_tint_adjustment};
use flight_clip::create_clip_region_from_rectangle;
use flight_entity::{
    Ref, allocate_entity, attach_entity_binding, get_entity_binding_as, get_entity_id,
    get_entity_uid, set_entity_uid,
};
use flight_geometry::{Rectangle, create_rectangle};
use flight_materials::BLEND_MODE_DARKEN;
use flight_node::contract::AdjustmentRef;
use flight_node::{
    Node, add_node_color_adjustment, get_node_appearance_revision, get_node_color_adjustments,
    get_node_runtime, set_node_color_adjustments, set_node_color_adjustments_tint,
};
use flight_scene2d::contract::*;

use crate::scene2d_fixture::*;

fn adjustment(kind: &str) -> AdjustmentRef {
    let mut tint = create_tint_adjustment(0xffffffff);
    tint.adjustment_fields_mut().kind = kind.to_string();
    return Arc::new(std::sync::RwLock::new(tint));
}

fn appearance_id(source: &Node2DRef) -> u32 {
    return get_node_appearance_revision(&*source.read().unwrap());
}

fn same(a: &[AdjustmentRef], b: &[AdjustmentRef]) -> bool {
    return a.len() == b.len() && a.iter().zip(b).all(|(a, b)| Arc::ptr_eq(a, b));
}

mod add_node_color_adjustment {
    use super::*;

    #[test]
    fn appends_to_a_fresh_null_stack_and_invalidates_appearance() {
        let obj = display_object();
        let before = appearance_id(&obj);
        let value = adjustment("ColorScaleBiasAdjustment");
        add_node_color_adjustment(&as_node(&obj), value.clone());
        let stack = get_node_color_adjustments(&*obj.read().unwrap()).unwrap();
        assert!(same(&stack.read().unwrap(), &[value]));
        assert_ne!(appearance_id(&obj), before);
    }

    #[test]
    fn appends_to_an_existing_stack_without_mutating_the_previous_array() {
        let obj = display_object();
        let (a, b) = (adjustment("A"), adjustment("B"));
        add_node_color_adjustment(&as_node(&obj), a.clone());
        let first = get_node_color_adjustments(&*obj.read().unwrap()).unwrap();
        add_node_color_adjustment(&as_node(&obj), b.clone());
        let next = get_node_color_adjustments(&*obj.read().unwrap()).unwrap();
        assert!(same(&next.read().unwrap(), &[a.clone(), b]));
        assert!(same(&first.read().unwrap(), &[a]));
        assert!(!Arc::ptr_eq(&first, &next));
    }
}

mod as_node2d_ref {
    use super::*;

    #[test]
    fn recovers_the_same_published_handle_of_a_built_in_kind() {
        let sprite = create_sprite();
        let erased: flight_node::NodeRef = sprite.clone();
        let recovered = as_node2d_ref(&erased).expect("a published 2D node");
        assert!(std::ptr::addr_eq(
            Arc::as_ptr(&recovered),
            Arc::as_ptr(&sprite)
        ));
        recovered.write().unwrap().node2d_fields_mut().x = 12.0;
        assert_eq!(sprite.read().unwrap().x, 12.0);
    }

    #[test]
    fn recovers_a_custom_kind_published_through_the_family_helper() {
        let mut node: Node2DTest = create_node2d("acme.Custom".to_string(), None);
        node.data = create_node2d_test_data(Some("custom"));
        let published = publish_node2d(node);
        let erased: flight_node::NodeRef = published.clone();
        let recovered = as_node2d_ref(&erased).expect("a published custom 2D node");
        assert!(std::ptr::addr_eq(
            Arc::as_ptr(&recovered),
            Arc::as_ptr(&published)
        ));
        let guard = recovered.read().unwrap();
        let custom = guard
            .as_any()
            .downcast_ref::<Node2DTest>()
            .expect("the original kind struct");
        assert_eq!(custom.data.foo, "custom");
        assert_eq!(guard.node_fields().kind, "acme.Custom");
    }

    #[test]
    fn refuses_a_node_of_another_family() {
        assert!(as_node2d_ref(&plain_node("acme.Plain")).is_none());
    }

    #[test]
    fn refuses_a_2d_node_that_was_never_published_through_the_family_helper() {
        let node: Node2DTest = create_node2d(DISPLAY_OBJECT_KIND.to_string(), None);
        let erased: flight_node::NodeRef = Arc::new(std::sync::RwLock::new(node));
        assert!(as_node2d_ref(&erased).is_none());
    }
}

mod create_display_object {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let shared = create_display_object();
        let obj = shared.read().unwrap();
        assert_eq!((obj.alpha, obj.visible), (1.0, true));
        assert!(obj.blend_mode.is_none() && obj.name.is_none());
        assert_eq!(obj.kind, DISPLAY_OBJECT_KIND);
        assert!(obj.enabled && obj.clip.is_none() && obj.material.is_none());
        let t = &obj;
        assert_eq!(
            (
                t.x, t.y, t.rotation, t.scale_x, t.scale_y, t.pivot_x, t.skew_y
            ),
            (0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0)
        );
    }

    #[test]
    fn allows_pre_defined_values() {
        let shared = create_display_object();
        {
            let mut obj = shared.write().unwrap();
            obj.node2d_fields_mut().alpha = 2.0;
            obj.node2d_fields_mut().blend_mode = Some(BLEND_MODE_DARKEN.to_string());
            obj.name = Some("foo".to_string());
            obj.node2d_fields_mut().rotation = 45.0;
            obj.node2d_fields_mut().scale_x = 2.0;
            obj.node2d_fields_mut().scale_y = 3.0;
            obj.node2d_fields_mut().visible = false;
            obj.node2d_fields_mut().x = 100.0;
            obj.node2d_fields_mut().y = 200.0;
        }
        let obj = shared.read().unwrap();
        assert_eq!(obj.alpha, 2.0);
        assert_eq!(obj.blend_mode.as_deref(), Some(BLEND_MODE_DARKEN));
        assert_eq!(obj.name.as_deref(), Some("foo"));
        let t = &obj;
        assert_eq!(
            (t.rotation, t.scale_x, t.scale_y, t.x, t.y),
            (45.0, 2.0, 3.0, 100.0, 200.0)
        );
        assert!(!obj.visible);
    }

    #[test]
    fn returns_a_new_object_each_call() {
        assert!(!Arc::ptr_eq(
            &create_display_object(),
            &create_display_object()
        ));
    }

    #[test]
    fn installs_the_default_runtime_tier() {
        let shared = create_display_object();
        let obj = shared.read().unwrap();
        let runtime = get_display_object_runtime(&obj);
        assert!(
            runtime.scene2d.is_none() && runtime.bounds.is_local_bounds_rectangle_valid.is_none()
        );
        assert_eq!(runtime.transform2d.rotation_cosine, 1.0);
    }
}

mod create_display_object_runtime {
    use super::*;

    #[test]
    fn returns_a_fresh_runtime_tier() {
        let runtime = create_display_object_runtime();
        assert!(runtime.scene2d.is_none() && runtime.bounds.local_bounds_rectangle.is_none());
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        let probe = create_display_object();
        (runtime.bounds.compute_local_bounds_rectangle)(&mut out, &*probe.read().unwrap());
        assert_eq!(
            out,
            create_rectangle(1.0, 2.0, 3.0, 4.0),
            "a display object computes no local content bounds"
        );
    }
}

mod create_node2d {
    use super::*;

    #[test]
    fn allows_creation_of_a_kind_without_a_data_field() {
        let obj: DisplayObject = create_node2d(DISPLAY_OBJECT_KIND.to_string(), None);
        assert_eq!(obj.kind, DISPLAY_OBJECT_KIND);
    }

    #[test]
    fn allows_a_custom_kind() {
        let mut obj: Node2DTest = create_node2d(DISPLAY_OBJECT_KIND.to_string(), None);
        obj.x = 100.0;
        assert_eq!(obj.x, 100.0);
        let shared: Node2DRef = Arc::new(std::sync::RwLock::new(obj));
        assert_eq!(shared.read().unwrap().node2d_fields().x, 100.0);
    }

    #[test]
    fn returns_a_new_object_with_the_custom_kind_data_initialized_by_the_kind() {
        let mut obj: Node2DTest = create_node2d(DISPLAY_OBJECT_KIND.to_string(), None);
        obj.data = create_node2d_test_data(None);
        assert_eq!(obj.data.foo, "bar");
    }

    #[test]
    fn installs_the_runtime_factory_tier() {
        let obj: Node2DTest =
            create_node2d(HTML_VIEW_KIND.to_string(), Some(create_sprite_runtime));
        assert!(
            get_node2d_runtime(&obj)
                .bounds
                .is_local_bounds_rectangle_valid
                .is_some()
        );
        let plain: Node2DTest = create_node2d(HTML_VIEW_KIND.to_string(), None);
        assert!(
            get_node2d_runtime(&plain)
                .bounds
                .is_local_bounds_rectangle_valid
                .is_none()
        );
    }

    #[test]
    fn resets_the_base_node_runtime_tier() {
        let obj: Node2DTest = create_node2d(DISPLAY_OBJECT_KIND.to_string(), None);
        let runtime = get_node_runtime(&obj);
        assert!(runtime.children.is_none() && runtime.parent.is_none());
        assert_eq!(runtime.world_transform_using_local_transform_id, -1);
    }
}

mod create_node2d_runtime {
    use super::*;

    #[test]
    fn returns_a_runtime_tier_with_no_scene() {
        let runtime = create_node2d_runtime(None);
        assert!(runtime.scene2d.is_none() && runtime.appearance.world_alpha.is_none());
    }

    #[test]
    fn allows_a_custom_bounds_calculation() {
        let func: flight_node::contract::NodeLocalBoundsComputer =
            Arc::new(|_out: &mut Rectangle, _source: &dyn Node| {});
        let methods = Node2DRuntimeMethods {
            compute_local_bounds_rectangle: Some(func.clone()),
            is_local_bounds_rectangle_valid: None,
        };
        let runtime = create_node2d_runtime(Some(&methods));
        assert!(Arc::ptr_eq(
            &runtime.bounds.compute_local_bounds_rectangle,
            &func
        ));
    }
}

mod get_display_object_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_tier_of_the_display_object() {
        let shared = create_display_object();
        let obj = shared.read().unwrap();
        assert!(std::ptr::eq(
            get_display_object_runtime(&obj),
            get_node2d_runtime(&*obj)
        ));
    }
}

mod get_node2d_runtime {
    use super::*;

    #[test]
    fn returns_the_runtime_tier_of_any_node2d() {
        let shared = display_object();
        let obj = shared.read().unwrap();
        assert!(std::ptr::eq(
            get_node2d_runtime(&*obj),
            obj.node2d_fields().node2d_runtime()
        ));
    }
}

mod get_node_color_adjustments {
    use super::*;

    #[test]
    fn defaults_to_null_on_a_fresh_node() {
        assert!(get_node_color_adjustments(&*display_object().read().unwrap()).is_none());
    }
}

mod initialize_display_object {
    use super::*;

    #[test]
    fn constructs_a_raw_allocation_without_replacing_its_identity_or_binding() {
        let mut obj: DisplayObject = allocate_entity();
        let id = get_entity_id(&obj);
        let binding = Arc::new(());
        set_entity_uid(&mut obj, "raw-display".to_string());
        attach_entity_binding(&mut obj, Box::new(binding.clone()));
        assert!(!is_node2d(&obj));

        initialize_display_object(&mut obj);

        assert_eq!(get_entity_id(&obj), id);
        assert_eq!(get_entity_uid(&mut obj), "raw-display");
        assert!(Arc::ptr_eq(
            get_entity_binding_as::<Arc<()>, _>(&obj).unwrap(),
            &binding
        ));
        assert_eq!(obj.kind, DISPLAY_OBJECT_KIND);
        assert!(is_node2d(&obj));
        assert!(obj.enabled && obj.visible);
        assert!(obj.name.is_none() && obj.clip.is_none() && obj.material.is_none());
        assert!(obj.blend_mode.is_none() && obj.material_data.is_none());
        assert_eq!(
            (obj.x, obj.y, obj.rotation, obj.alpha),
            (0.0, 0.0, 0.0, 1.0)
        );
        assert_eq!((obj.scale_x, obj.scale_y), (1.0, 1.0));
        assert_eq!(
            (obj.pivot_x, obj.pivot_y, obj.skew_x, obj.skew_y),
            (0.0, 0.0, 0.0, 0.0)
        );
        let runtime = get_display_object_runtime(&obj);
        assert!(runtime.scene2d.is_none());
        assert_eq!(runtime.transform2d.rotation_cosine, 1.0);
        assert!(runtime.bounds.is_local_bounds_rectangle_valid.is_none());
        let mut bounds = create_rectangle(1.0, 2.0, 3.0, 4.0);
        (runtime.bounds.compute_local_bounds_rectangle)(&mut bounds, &obj);
        assert_eq!(bounds, create_rectangle(1.0, 2.0, 3.0, 4.0));

        let published = publish_node2d(obj);
        let erased: flight_node::NodeRef = published.clone();
        let recovered = as_node2d_ref(&erased).unwrap();
        assert!(std::ptr::addr_eq(
            Arc::as_ptr(&published),
            Arc::as_ptr(&recovered)
        ));
        assert_eq!(get_entity_id(&*published.read().unwrap()), id);
    }

    #[test]
    fn is_the_construction_initializer_of_create_display_object() {
        let obj = create_display_object();
        let mut guard = obj.write().unwrap();
        initialize_display_object(&mut *guard);
        assert!(is_node2d(&*guard));
    }
}

mod is_node2d {
    use super::*;

    #[test]
    fn returns_true_for_display_objects_and_every_2d_kind() {
        assert!(is_node2d(&*display_object().read().unwrap()));
        assert!(is_node2d(&*create_sprite().read().unwrap()));
        assert!(is_node2d(&*create_html_view().read().unwrap()));
        let custom: Node2DTest = create_node2d("Custom".to_string(), None);
        assert!(is_node2d(&custom));
    }

    #[test]
    fn returns_false_for_a_node_of_another_family() {
        assert!(!is_node2d(&*plain_node("Node").read().unwrap()));
    }

    #[test]
    fn create_node2d_installs_the_node2d_traits_key_on_the_base_runtime() {
        let obj: Node2DTest = create_node2d(DISPLAY_OBJECT_KIND.to_string(), None);
        let traits = get_node_runtime(&obj).traits.as_ref().unwrap();
        assert!(std::sync::Arc::ptr_eq(
            &traits.key,
            &flight_scene2d::NODE2D_TRAITS_KEY
        ));
        assert!(traits.narrow.downcast_ref::<Node2DTraitsKey>().is_some());
        assert!(
            get_node_runtime(&*plain_node("Node").read().unwrap())
                .traits
                .is_none()
        );
    }
}

mod publish_node2d {
    use super::*;

    #[test]
    fn binds_a_weak_self_handle_that_never_keeps_its_node_alive() {
        let sprite = create_sprite();
        let weak = Arc::downgrade(&sprite);
        let erased: flight_node::NodeRef = sprite.clone();
        assert!(as_node2d_ref(&erased).is_some());
        drop(erased);
        drop(sprite);
        assert!(weak.upgrade().is_none());
    }

    #[test]
    fn keeps_the_one_private_runtime_uid_of_the_published_node() {
        let published = publish_node2d(create_node2d::<Node2DTest>(
            DISPLAY_OBJECT_KIND.to_string(),
            None,
        ));
        let uid = flight_entity::get_entity_uid(published.write().unwrap().node_fields_mut());
        let erased: flight_node::NodeRef = published.clone();
        let recovered = as_node2d_ref(&erased).unwrap();
        let recovered_uid =
            flight_entity::get_entity_uid(published.write().unwrap().node_fields_mut());
        assert!(Arc::ptr_eq(&recovered, &(published.clone() as Node2DRef)));
        assert_eq!(recovered_uid, uid);
    }
}

mod set_node2d_clip {
    use super::*;

    fn clip(width: f32, height: f32) -> Ref<flight_clip::ClipRegion> {
        return create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, width, height));
    }

    #[test]
    fn sets_clip() {
        let obj = display_object();
        let value = clip(100.0, 50.0);
        set_node2d_clip(&obj, Some(value.clone()));
        assert!(Arc::ptr_eq(
            obj.read().unwrap().node2d_fields().clip.as_ref().unwrap(),
            &value
        ));
    }

    #[test]
    fn accepts_null() {
        let obj = display_object();
        set_node2d_clip(&obj, Some(clip(1.0, 1.0)));
        set_node2d_clip(&obj, None);
        assert!(obj.read().unwrap().node2d_fields().clip.is_none());
    }

    #[test]
    fn invalidates_appearance() {
        let obj = display_object();
        let before = appearance_id(&obj);
        set_node2d_clip(&obj, Some(clip(10.0, 10.0)));
        assert_ne!(appearance_id(&obj), before);
    }
}

mod set_node_color_adjustments {
    use super::*;

    #[test]
    fn sets_the_stack_and_invalidates_appearance() {
        let obj = display_object();
        let before = appearance_id(&obj);
        let tint: AdjustmentRef =
            Arc::new(std::sync::RwLock::new(create_tint_adjustment(0xffffffff)));
        let stack = Arc::new(std::sync::RwLock::new(vec![tint]));
        set_node_color_adjustments(&as_node(&obj), Some(stack.clone()));
        // TS `toBe(stack)`: the node returns the caller's very stack handle (Principal 8d88d5a0).
        assert!(Arc::ptr_eq(
            &get_node_color_adjustments(&*obj.read().unwrap()).unwrap(),
            &stack
        ));
        assert_ne!(appearance_id(&obj), before);
    }

    #[test]
    fn accepts_null() {
        let obj = display_object();
        let tint: AdjustmentRef =
            Arc::new(std::sync::RwLock::new(create_tint_adjustment(0xffffffff)));
        set_node_color_adjustments(
            &as_node(&obj),
            Some(Arc::new(std::sync::RwLock::new(vec![tint]))),
        );
        set_node_color_adjustments(&as_node(&obj), None);
        assert!(get_node_color_adjustments(&*obj.read().unwrap()).is_none());
    }

    #[test]
    fn caches_a_complete_channel_mixing_matrix_without_marking_it_unsupported() {
        let obj = display_object();
        let matrix = [
            1.0, 0.5, 0.0, 0.0, 0.1, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        let value: AdjustmentRef = Arc::new(std::sync::RwLock::new(
            create_color_matrix_adjustment(matrix),
        ));
        set_node_color_adjustments(
            &as_node(&obj),
            Some(Arc::new(std::sync::RwLock::new(vec![value]))),
        );
        let node = obj.read().unwrap();
        assert_eq!(get_node_runtime(&*node).resolved_color_matrix, Some(matrix));
        assert!(!get_node_runtime(&*node).color_adjustments_unsupported);
    }
}

mod set_node_color_adjustments_tint {
    use super::*;

    #[test]
    fn replaces_the_stack_with_one_tint_adjustment_built_from_the_packed_color() {
        let obj = display_object();
        set_node_color_adjustments_tint(&as_node(&obj), 0xff0000ff);
        let stack = get_node_color_adjustments(&*obj.read().unwrap()).unwrap();
        let stack = stack.read().unwrap();
        assert_eq!(stack.len(), 1);
        assert_eq!(
            stack[0].read().unwrap().adjustment_fields().kind,
            "TintAdjustment"
        );
    }

    #[test]
    fn replaces_any_prior_adjustments_rather_than_layering() {
        let obj = display_object();
        set_node_color_adjustments_tint(&as_node(&obj), 0xff0000ff);
        set_node_color_adjustments_tint(&as_node(&obj), 0x00ff00ff);
        assert_eq!(
            get_node_color_adjustments(&*obj.read().unwrap())
                .unwrap()
                .read()
                .unwrap()
                .len(),
            1
        );
    }
}
