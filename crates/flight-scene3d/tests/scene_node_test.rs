use crate::support::*;
use flight_node::contract::*;
use flight_scene3d::contract::*;
use std::sync::Arc;

#[derive(Default)]
struct CustomNode {
    node: Node3DFields,
    pub data: CustomData,
}
#[derive(Default)]
struct CustomData {
    value: i32,
}
flight_scene3d::impl_node3d!(CustomNode);

fn create_custom_node(kind: &str, value: i32) -> flight_entity::Ref<CustomNode> {
    let mut node: CustomNode = create_node3d(Some(kind.to_string()), None);
    node.data.value = value;
    return node.into_node3d_ref();
}

mod as_node3d_ref {
    use super::*;

    #[test]
    fn rejects_another_published_nodes_copied_narrowing_row_instead_of_returning_its_foreign_handle()
     {
        let original = create_custom_node("Original", 1);
        let borrowed_traits = {
            let guard = original.read().unwrap();
            let traits = guard.node_runtime().traits.as_ref().unwrap();
            NodeTraits {
                key: traits.key.clone(),
                narrow: traits.narrow.clone(),
            }
        };
        let other = create_custom_node("Other", 2);
        other.write().unwrap().node_runtime_mut().traits = Some(borrowed_traits);
        let other_erased: NodeRef = other.clone();
        assert!(as_node3d_ref(&other_erased).is_none());
        let original_erased: NodeRef = original.clone();
        let original_family: Node3DRef = original.clone();
        assert!(Arc::ptr_eq(
            &as_node3d_ref(&original_erased).unwrap(),
            &original_family
        ));
        assert_eq!(other.read().unwrap().data.value, 2);
    }

    #[test]
    fn custom_family_constructor_recovers_the_original_payload_uid_and_root_handle() {
        let custom = create_custom_node("Vendor.Original", 47);
        let original_uid = flight_entity::get_entity_uid(&mut *custom.write().unwrap());
        let erased: NodeRef = custom.clone();
        let recovered = as_node3d_ref(&erased).unwrap();
        let original: Node3DRef = custom.clone();
        assert!(Arc::ptr_eq(&recovered, &original));
        assert_eq!(
            flight_entity::get_entity_uid(recovered.write().unwrap().node3d_fields_mut()),
            original_uid
        );
        recovered.write().unwrap().node3d_fields_mut().position.x = 12.0;
        assert_eq!(custom.read().unwrap().position.x, 12.0);
        assert_eq!(custom.read().unwrap().data.value, 47);
        let mut scene = create_scene3d(None);
        scene.root = recovered;
        assert!(Arc::ptr_eq(&scene.root, &original));
        assert_eq!(
            scene.root.read().unwrap().node_fields().kind,
            "Vendor.Original"
        );
    }

    #[test]
    fn mesh_roots_and_every_built_in_factory_preserve_their_published_allocation() {
        let mesh = test_mesh();
        let mesh_node: NodeRef = mesh.clone();
        let mesh_family: Node3DRef = mesh.clone();
        let recovered = as_node3d_ref(&mesh_node).unwrap();
        assert!(Arc::ptr_eq(&recovered, &mesh_family));
        let mut scene = create_scene3d(None);
        scene.root = recovered;
        assert!(scene.root.read().unwrap().as_mesh().is_some());
        let billboard = create_billboard(test_geometry(), empty_materials(), None, None, None);
        let instanced = create_instanced_mesh(test_geometry(), empty_materials(), Some(0), None);
        let base = create_scene3d(None).root;
        for node in [
            mesh_family,
            billboard as Node3DRef,
            instanced as Node3DRef,
            base,
        ] {
            let erased: NodeRef = node.clone();
            assert!(Arc::ptr_eq(&as_node3d_ref(&erased).unwrap(), &node));
        }
        let cloned = clone_node3d_subtree(&mesh_node, None);
        let family = as_node3d_ref(&cloned).unwrap();
        let family_node: NodeRef = family;
        assert!(Arc::ptr_eq(&cloned, &family_node));
        assert!(!Arc::ptr_eq(&cloned, &mesh_node));
    }

    #[test]
    fn rejects_the_other_dimension_family() {
        let scene2d = flight_scene2d::create_scene2d(None);
        let two_d: NodeRef = scene2d.read().unwrap().root.clone();
        assert!(as_node3d_ref(&two_d).is_none());
    }

    #[test]
    fn retained_weak_expires_after_all_real_owners_drop() {
        let custom = create_custom_node("Unknown.At.Build.Time", 73);
        let weak = custom
            .read()
            .unwrap()
            .node_runtime()
            .traits
            .as_ref()
            .unwrap()
            .narrow
            .downcast_ref::<Node3DNarrow>()
            .unwrap()
            .self_handle
            .clone()
            .unwrap();
        let erased: NodeRef = custom.clone();
        let recovered = as_node3d_ref(&erased).unwrap();
        assert_eq!(Arc::strong_count(&custom), 3);
        drop(recovered);
        drop(erased);
        assert_eq!(Arc::strong_count(&custom), 1);
        drop(custom);
        assert!(weak.upgrade().is_none());
    }
}

mod create_node3d {
    use super::*;
    #[test]
    fn initializes_source_defaults_custom_kind_and_partial_fields() {
        let node: Node3DFields = create_node3d(None, None);
        assert_eq!(node.kind, NODE3D_KIND);
        assert!(node.enabled);
        assert!(node.name.is_none());
        assert_eq!(node.alpha, 1.0);
        assert!(node.visible);
        assert_eq!(
            (node.position.x, node.position.y, node.position.z),
            (0.0, 0.0, 0.0)
        );
        assert_eq!(
            (
                node.rotation.x,
                node.rotation.y,
                node.rotation.z,
                node.rotation.w
            ),
            (0.0, 0.0, 0.0, 1.0)
        );
        assert_eq!((node.scale.x, node.scale.y, node.scale.z), (1.0, 1.0, 1.0));
        let node: Node3DFields = create_node3d(
            Some("MyKind".to_string()),
            Some(&PartialNode3D {
                enabled: Some(false),
                name: Some("root".to_string()),
                alpha: Some(0.4),
                visible: Some(false),
            }),
        );
        assert_eq!(node.kind, "MyKind");
        assert!(!node.enabled);
        assert_eq!(node.name.as_deref(), Some("root"));
        close(node.alpha, 0.4);
        assert!(!node.visible);
    }
    #[test]
    fn distinct_custom_kinds_share_family_identity_and_borrow_original_flat_fields() {
        let a: Node3DFields = create_node3d(None, None);
        let mut b: CustomNode = create_node3d(Some("Custom".to_string()), None);
        b.data.value = 47;
        let ta = a.node_runtime().traits.as_ref().unwrap();
        let tb = b.node_runtime().traits.as_ref().unwrap();
        assert!(Arc::ptr_eq(&ta.key, &tb.key));
        assert!(Arc::ptr_eq(&ta.key, &NODE3D_TRAITS_KEY));
        let narrow = tb.narrow.downcast_ref::<Node3DNarrow>().unwrap();
        assert!(std::ptr::eq(
            (narrow.as_node3d)(&b).unwrap().node3d_fields(),
            b.node3d_fields()
        ));
        (narrow.as_node3d_mut)(&mut b)
            .unwrap()
            .node3d_fields_mut()
            .position
            .x = 12.0;
        assert_eq!(b.position.x, 12.0);
        assert_eq!(b.data.value, 47);
        let transform = b.transform3d();
        assert!(std::ptr::eq(transform.position, &b.position));
        let uid = flight_entity::get_entity_uid(&mut b);
        assert_eq!(uid, flight_entity::get_entity_uid(b.node3d_fields_mut()));
    }
}
mod create_node3d_runtime {
    use super::*;
    #[test]
    fn initializes_empty_transform_and_appearance_tiers() {
        let runtime = create_node3d_runtime();
        assert!(runtime.transform3d.world_matrix4.is_none());
        assert!(runtime.transform3d.local_matrix4.is_none());
        assert!(!runtime.transform3d.local_matrix4_detached);
        assert!(runtime.appearance.world_alpha.is_none());
        assert_eq!(runtime.appearance.world_alpha_using_appearance_id, -1);
        let node = node3d();
        let n = node.read().unwrap();
        let base = get_node_runtime(&*n);
        assert_eq!(base.local_transform_id, 0);
        assert_eq!(base.world_transform_id, 0);
        assert_eq!(base.world_transform_using_local_transform_id, -1);
        assert_eq!(base.world_transform_using_parent_transform_id, -1);
    }
}
mod enable_node3d_signals {
    use super::*;
    #[test]
    fn creates_then_retains_the_same_complete_signal_bag() {
        let node = node3d();
        let erased = as_node_ref(&node);
        let signals = enable_node3d_signals(&erased);
        assert!(Arc::ptr_eq(&signals, &enable_node3d_signals(&erased)));
        assert!(Arc::ptr_eq(
            &signals,
            node.read()
                .unwrap()
                .node_runtime()
                .node_signals
                .as_ref()
                .unwrap()
        ));
        let s = signals.read().unwrap();
        assert!(s.on_child_added.data.read().unwrap().is_none());
        assert!(s.on_parent_changed.data.read().unwrap().is_none());
    }
}
mod get_node3d_runtime {
    use super::*;
    #[test]
    fn returns_the_actual_private_runtime_with_empty_base_hierarchy() {
        let n = node3d();
        let n = n.read().unwrap();
        assert!(std::ptr::eq(get_node3d_runtime(&*n), n.node3d_runtime()));
        assert!(n.node_runtime().children.is_none());
        assert!(n.node_runtime().parent.is_none());
        assert!(get_node3d_runtime(&*n).transform3d.world_matrix4.is_none());
    }
}
mod get_node3d_signals {
    use super::*;
    #[test]
    fn stays_null_until_enabled_then_returns_the_retained_bag() {
        let node = node3d();
        assert!(get_node3d_signals(&*node.read().unwrap()).is_none());
        let signals = enable_node3d_signals(&as_node_ref(&node));
        assert!(Arc::ptr_eq(
            &signals,
            &get_node3d_signals(&*node.read().unwrap()).unwrap()
        ));
    }
}
mod is_node3d {
    use super::*;
    #[test]
    fn distinguishes_actual_scene2d_and_scene3d_families() {
        let a = node3d();
        let b = flight_scene2d::create_display_object(None);
        assert!(is_node3d(&*a.read().unwrap()));
        assert!(!is_node3d(&*b.read().unwrap()));
    }
}
mod publish_node3d {
    use super::*;

    #[test]
    fn binds_composed_base_fields_to_the_actual_concrete_custom_kind() {
        let custom = CustomNode {
            node: create_node3d(Some("Composed.Custom".to_string()), None),
            data: CustomData { value: 11 },
        };
        let published = custom.into_node3d_ref();
        let guard = published.read().unwrap();
        let narrow = guard
            .node_runtime()
            .traits
            .as_ref()
            .unwrap()
            .narrow
            .downcast_ref::<Node3DNarrow>()
            .unwrap();
        assert!((narrow.as_node3d)(&*guard).is_some());
        assert_eq!(guard.data.value, 11);
        drop(guard);
        let erased: NodeRef = published.clone();
        let original: Node3DRef = published;
        assert!(Arc::ptr_eq(&as_node3d_ref(&erased).unwrap(), &original));
    }
    #[test]
    fn binds_distinct_custom_kinds_without_a_roster_or_a_second_uid() {
        for kind in ["Vendor.ArbitraryA", "Vendor.ArbitraryB"] {
            let mut owned: CustomNode = create_node3d(Some(kind.to_string()), None);
            owned.data.value = 39;
            let uid = flight_entity::get_entity_uid(&mut owned);
            let published = publish_node3d(owned);
            assert_eq!(
                flight_entity::get_entity_uid(&mut *published.write().unwrap()),
                uid
            );
            assert_eq!(published.read().unwrap().data.value, 39);
            let erased: NodeRef = published.clone();
            let typed: Node3DRef = published;
            assert!(Arc::ptr_eq(&as_node3d_ref(&erased).unwrap(), &typed));
        }
    }

    #[test]
    fn shared_narrowing_metadata_gets_a_self_handle_for_each_original_node() {
        let a: CustomNode = create_node3d(Some("A".to_string()), None);
        let mut b: CustomNode = create_node3d(Some("B".to_string()), None);
        let traits = a.node_runtime().traits.as_ref().unwrap();
        b.node_runtime_mut().traits = Some(NodeTraits {
            key: traits.key.clone(),
            narrow: traits.narrow.clone(),
        });
        let a = publish_node3d(a);
        let b = publish_node3d(b);
        let a_node: NodeRef = a.clone();
        let b_node: NodeRef = b.clone();
        let a: Node3DRef = a;
        let b: Node3DRef = b;
        assert!(Arc::ptr_eq(&as_node3d_ref(&a_node).unwrap(), &a));
        assert!(Arc::ptr_eq(&as_node3d_ref(&b_node).unwrap(), &b));
        assert!(!Arc::ptr_eq(&a, &b));
    }
}

mod source_transform_and_hierarchy {
    use super::*;
    #[test]
    fn resolves_identity_and_carries_an_authored_detached_matrix() {
        let node = node3d();
        let erased = as_node_ref(&node);
        let m = get_node_local_matrix4(&erased);
        for i in [0, 5, 10, 15] {
            assert_eq!(m.m[i], 1.0);
        }
        for i in [12, 13, 14] {
            assert_eq!(m.m[i], 0.0);
        }
        let mut m = flight_geometry::create_matrix4();
        m.m.fill(0.0);
        m.m[12] = 42.0;
        set_node_local_matrix4(&erased, &m);
        assert_eq!(get_node_local_matrix4(&erased).m[12], 42.0);
        let before = node.read().unwrap().node_runtime().local_transform_id;
        invalidate_node_local_transform(&erased);
        assert_eq!(
            node.read().unwrap().node_runtime().local_transform_id,
            before + 1
        );
        node.write()
            .unwrap()
            .node_runtime_mut()
            .world_transform_using_parent_transform_id = 5;
        invalidate_node_parent_reference(&erased);
        assert_eq!(
            node.read()
                .unwrap()
                .node_runtime()
                .world_transform_using_parent_transform_id,
            -1
        );
    }
    #[test]
    fn links_reparents_unlinks_and_traverses_to_the_top_without_cycles() {
        let a = as_node_ref(&node3d());
        let b = as_node_ref(&node3d());
        let mid = as_node_ref(&node3d());
        let child = as_node_ref(&node3d());
        add_node_child(&a, &mid);
        add_node_child(&mid, &child);
        assert!(Arc::ptr_eq(&get_node_parent(&child).unwrap(), &mid));
        assert!(Arc::ptr_eq(&get_node_root(&child), &a));
        assert!(Arc::ptr_eq(&get_node_root(&mid), &a));
        assert!(Arc::ptr_eq(&get_node_root(&a), &a));
        add_node_child(&b, &child);
        assert_eq!(get_node_child_count(&mid), 0);
        assert_eq!(get_node_child_count(&b), 1);
        assert!(Arc::ptr_eq(&get_node_parent(&child).unwrap(), &b));
        remove_node_child(&b, &child);
        assert!(get_node_parent(&child).is_none());
        assert_eq!(get_node_child_count(&b), 0);
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| add_node_child(&a, &a)))
                .is_err()
        );
    }
    #[test]
    fn composes_parent_times_local_and_recomputes_only_when_invalidated() {
        let parent = node3d();
        let child = node3d();
        let p = as_node_ref(&parent);
        let c = as_node_ref(&child);
        let mut state = revision_state();
        child.write().unwrap().position = flight_geometry::create_vector3(10.0, 20.0, 30.0);
        invalidate_node_local_transform(&c);
        let world = get_node_world_matrix4(&c, &mut state);
        assert_eq!(&world.m[12..15], &[10.0, 20.0, 30.0]);
        add_node_child(&p, &c);
        parent.write().unwrap().position.x = 5.0;
        child.write().unwrap().position.x = 3.0;
        invalidate_node_local_transform(&p);
        invalidate_node_local_transform(&c);
        close(get_node_world_matrix4(&c, &mut state).m[12], 8.0);
        let before = child.read().unwrap().node_runtime().world_transform_id;
        ensure_node_world_matrix4(&c, &mut state);
        assert_eq!(
            child.read().unwrap().node_runtime().world_transform_id,
            before
        );
        child.write().unwrap().position.x = 99.0;
        invalidate_node_local_transform(&c);
        ensure_node_world_matrix4(&c, &mut state);
        assert_ne!(
            child.read().unwrap().node_runtime().world_transform_id,
            before
        );
        child.write().unwrap().position.x = 0.0;
        parent.write().unwrap().position.x = 7.0;
        invalidate_node_local_transform(&p);
        invalidate_node_local_transform(&c);
        close(get_node_world_matrix4(&c, &mut state).m[12], 7.0);
    }
}
