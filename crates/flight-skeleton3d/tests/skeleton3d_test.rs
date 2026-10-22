use crate::support::*;
use flight_geometry::create_matrix4;
use flight_node::{NodeRef, add_node_child, get_node_parent, invalidate_node_local_transform};
use flight_skeleton3d::contract::*;
use std::sync::{Arc, Mutex};
mod clone_skeleton3d {
    use super::*;
    #[test]
    fn copies_all_buffers_arrays_and_names_into_a_new_entity_while_retaining_joint_nodes() {
        let node = joint(5.0, 0.0, 0.0);
        let source = skeleton(vec![node.clone()], Some(vec!["root".to_string()]));
        let mut clone = clone_skeleton3d(&source);
        assert!(!std::ptr::eq(&source, &clone));
        assert_ne!(
            source.inverse_bind_matrices.read().unwrap().as_ptr(),
            clone.inverse_bind_matrices.read().unwrap().as_ptr()
        );
        assert_ne!(
            source.joint_matrices.read().unwrap().as_ptr(),
            clone.joint_matrices.read().unwrap().as_ptr()
        );
        assert_ne!(
            source.normal_matrices.read().unwrap().as_ptr(),
            clone.normal_matrices.read().unwrap().as_ptr()
        );
        assert!(!Arc::ptr_eq(&source.joints, &clone.joints));
        assert!(Arc::ptr_eq(
            &source.joints.read().unwrap()[0],
            &clone.joints.read().unwrap()[0]
        ));
        assert_eq!(
            *source.inverse_bind_matrices.read().unwrap(),
            *clone.inverse_bind_matrices.read().unwrap()
        );
        assert_eq!(clone.names, Some(vec!["root".to_string()]));
        assert_ne!(
            source.names.as_ref().unwrap().as_ptr(),
            clone.names.as_ref().unwrap().as_ptr()
        );
        assert!(!flight_entity::get_entity_uid(&mut clone).is_empty());
        assert!(
            clone_skeleton3d(&skeleton(vec![joint(0.0, 0.0, 0.0)], None))
                .names
                .is_none()
        );
    }
}
mod clone_skeleton3d_joint_hierarchy {
    use super::*;
    #[test]
    fn releases_joint_array_before_user_clone_policy() {
        let rig = skeleton(vec![joint(0.0, 0.0, 0.0), joint(1.0, 0.0, 0.0)], None);
        let original_array = rig.joints.clone();
        let cloned = clone_skeleton3d_joint_hierarchy(
            &rig,
            Arc::new(move |_, _| {
                assert!(original_array.try_write().is_ok());
                return joint(0.0, 0.0, 0.0);
            }),
        );
        assert_eq!(cloned.joints.read().unwrap().len(), 2);
        assert!(!Arc::ptr_eq(&cloned.joints, &rig.joints));
    }
    #[test]
    fn rebuilds_only_joint_parent_links_and_isolates_pose_updates_without_caching_the_source() {
        let external: NodeRef = joint(0.0, 0.0, 0.0);
        let root = joint(1.0, 0.0, 0.0);
        let child = joint(0.0, 2.0, 0.0);
        let root_ref: NodeRef = root.clone();
        let child_ref: NodeRef = child.clone();
        add_node_child(&external, &root_ref);
        add_node_child(&root_ref, &child_ref);
        let mut source = skeleton(
            vec![root.clone(), child.clone()],
            Some(vec!["root".to_string(), "child".to_string()]),
        );
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let mut clone = clone_skeleton3d_joint_hierarchy(
            &source,
            Arc::new(move |joint, index| {
                sink.lock().unwrap().push(index);
                assert!(joint.try_write().is_ok());
                let joint = joint.read().unwrap();
                let fields = joint.node3d_fields();
                let out = super::joint(fields.position.x, fields.position.y, fields.position.z);
                return out;
            }),
        );
        assert_eq!(*seen.lock().unwrap(), vec![0, 1]);
        assert!(!Arc::ptr_eq(
            &source.joints.read().unwrap()[0],
            &clone.joints.read().unwrap()[0]
        ));
        assert!(!Arc::ptr_eq(
            &source.joints.read().unwrap()[1],
            &clone.joints.read().unwrap()[1]
        ));
        let r: NodeRef = clone.joints.read().unwrap()[0].clone();
        let c: NodeRef = clone.joints.read().unwrap()[1].clone();
        assert!(get_node_parent(&r).is_none());
        assert!(Arc::ptr_eq(&get_node_parent(&c).unwrap(), &r));
        assert!(Arc::ptr_eq(
            &get_node_parent(&child_ref).unwrap(),
            &root_ref
        ));
        assert_ne!(
            source.inverse_bind_matrices.read().unwrap().as_ptr(),
            clone.inverse_bind_matrices.read().unwrap().as_ptr()
        );
        assert_eq!(clone.names, source.names);
        clone.joints.read().unwrap()[0]
            .write()
            .unwrap()
            .node3d_fields_mut()
            .position
            .x = 6.0;
        invalidate_node_local_transform(&r);
        compute_skeleton3d_joint_matrices(&mut source, &mut revisions());
        compute_skeleton3d_joint_matrices(&mut clone, &mut revisions());
        close(source.joint_matrices.read().unwrap()[12], 0.0);
        close(source.joint_matrices.read().unwrap()[28], 0.0);
        close(clone.joint_matrices.read().unwrap()[12], 5.0);
        close(clone.joint_matrices.read().unwrap()[28], 5.0);
    }
}
mod compute_skeleton3d_joint_matrices {
    use super::*;
    #[test]
    fn is_alias_safe_when_inverse_bind_and_joint_palettes_are_the_exact_same_shared_buffer() {
        let first = joint(0.0, 0.0, 0.0);
        let second = joint(3.0, 0.0, 0.0);
        let temporary = skeleton(vec![first.clone(), second.clone()], None);
        let shared = Arc::new(std::sync::RwLock::new(vec![0.0; 32].into_boxed_slice()));
        shared
            .write()
            .unwrap()
            .copy_from_slice(&temporary.inverse_bind_matrices.read().unwrap());
        let mut aliased = skeleton(vec![first, second], None);
        aliased.inverse_bind_matrices = shared.clone();
        aliased.joint_matrices = shared.clone();
        compute_skeleton3d_joint_matrices(&mut aliased, &mut revisions());
        assert!(Arc::ptr_eq(&aliased.inverse_bind_matrices, &shared));
        assert!(Arc::ptr_eq(&aliased.joint_matrices, &shared));
        assert!(shared.try_write().is_ok());
        let values = shared.read().unwrap();
        for index in [12, 13, 28, 29] {
            close(values[index], 0.0);
        }
    }
    #[test]
    fn throws_the_source_range_error_before_a_short_palette_set_and_retains_short_normal_writes() {
        let mut rig = skeleton(vec![joint(0.0, 0.0, 0.0)], None);
        rig.joint_matrices =
            std::sync::Arc::new(std::sync::RwLock::new(vec![0.0; 15].into_boxed_slice()));
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            compute_skeleton3d_joint_matrices(&mut rig, &mut revisions())
        }))
        .unwrap_err();
        let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
        assert_eq!(error.message, "offset is out of bounds");
        rig.joint_matrices =
            std::sync::Arc::new(std::sync::RwLock::new(vec![0.0; 16].into_boxed_slice()));
        rig.normal_matrices =
            std::sync::Arc::new(std::sync::RwLock::new(vec![17.0; 1].into_boxed_slice()));
        compute_skeleton3d_joint_matrices(&mut rig, &mut revisions());
        assert_eq!(rig.normal_matrices.read().unwrap().as_ref(), &[1.0]);
    }
    #[test]
    fn encodes_pose_delta_and_rest_identity_for_every_joint() {
        let node = joint(5.0, 0.0, 0.0);
        let mut rig = skeleton(vec![node.clone()], None);
        compute_skeleton3d_joint_matrices(&mut rig, &mut revisions());
        close(rig.joint_matrices.read().unwrap()[0], 1.0);
        close(rig.joint_matrices.read().unwrap()[12], 0.0);
        close(rig.joint_matrices.read().unwrap()[13], 0.0);
        node.write().unwrap().position.y = 3.0;
        let erased: NodeRef = node;
        invalidate_node_local_transform(&erased);
        compute_skeleton3d_joint_matrices(&mut rig, &mut revisions());
        close(rig.joint_matrices.read().unwrap()[12], 0.0);
        close(rig.joint_matrices.read().unwrap()[13], 3.0);
        let a = joint(1.0, 0.0, 0.0);
        let b = joint(0.0, 1.0, 0.0);
        let c = joint(0.0, 0.0, 1.0);
        let mut rig = skeleton(vec![a, b.clone(), c], None);
        b.write().unwrap().position.y = 2.0;
        let erased: NodeRef = b;
        invalidate_node_local_transform(&erased);
        compute_skeleton3d_joint_matrices(&mut rig, &mut revisions());
        for (index, expected) in [
            (12, 0.0),
            (13, 0.0),
            (14, 0.0),
            (28, 0.0),
            (29, 1.0),
            (30, 0.0),
            (44, 0.0),
            (45, 0.0),
            (46, 0.0),
        ] {
            close(rig.joint_matrices.read().unwrap()[index], expected);
        }
    }
    #[test]
    fn fills_inverse_transpose_normals_as_three_padded_vec4_columns() {
        let node = joint(0.0, 0.0, 0.0);
        let mut rig = skeleton(vec![node.clone()], None);
        node.write().unwrap().scale.x = 2.0;
        let erased: NodeRef = node;
        invalidate_node_local_transform(&erased);
        compute_skeleton3d_joint_matrices(&mut rig, &mut revisions());
        assert_eq!(rig.normal_matrices.read().unwrap().len(), 12);
        assert_eq!(
            rig.normal_matrices.read().unwrap().as_ref(),
            &[0.5, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        );
    }
}
mod create_skeleton3d {
    use super::*;
    #[test]
    fn retains_input_joint_array_mutations_and_dispose_clears_all_aliases() {
        let first: flight_scene3d::Node3DRef = joint(0.0, 0.0, 0.0);
        let joints = Arc::new(std::sync::RwLock::new(vec![first.clone()]));
        let mut rig = create_skeleton3d(joints.clone(), None, &mut revisions(), &guards());
        rig.names = Some(vec!["first".to_string()]);
        assert!(Arc::ptr_eq(&rig.joints, &joints));
        let second: flight_scene3d::Node3DRef = joint(1.0, 0.0, 0.0);
        joints.write().unwrap().push(second.clone());
        assert_eq!(rig.joints.read().unwrap().len(), 2);
        assert!(Arc::ptr_eq(&rig.joints.read().unwrap()[1], &second));
        let cloned = clone_skeleton3d(&rig);
        assert!(!Arc::ptr_eq(&cloned.joints, &joints));
        assert!(Arc::ptr_eq(&cloned.joints.read().unwrap()[0], &first));
        rig.joints.write().unwrap().pop();
        assert_eq!(joints.read().unwrap().len(), 1);
        assert_eq!(cloned.joints.read().unwrap().len(), 2);
        let palette = rig.joint_matrices.clone();
        dispose_skeleton3d(&mut rig);
        assert!(joints.read().unwrap().is_empty());
        assert!(Arc::ptr_eq(&rig.joints, &joints));
        assert!(Arc::ptr_eq(&rig.joint_matrices, &palette));
        assert_eq!(cloned.joints.read().unwrap().len(), 2);
        assert!(rig.names.is_none());
    }
    #[test]
    fn sizes_zeroed_palettes_captures_optional_bind_pose_and_retains_supplied_buffers() {
        let mut rig = skeleton(vec![joint(0.0, 0.0, 0.0), joint(0.0, 0.0, 0.0)], None);
        assert_eq!(rig.joint_matrices.read().unwrap().len(), 32);
        assert_eq!(rig.inverse_bind_matrices.read().unwrap().len(), 32);
        assert_eq!(rig.normal_matrices.read().unwrap().len(), 24);
        assert!(rig.joint_matrices.read().unwrap().iter().all(|v| *v == 0.0));
        assert!(!flight_entity::get_entity_uid(&mut rig).is_empty());
        let supplied = Arc::new(std::sync::RwLock::new(vec![7.0; 16].into_boxed_slice()));
        let original = supplied.clone();
        let pointer = supplied.read().unwrap().as_ptr();
        let rig = create_skeleton3d(
            Arc::new(std::sync::RwLock::new(vec![joint(99.0, 0.0, 0.0)])),
            Some(supplied),
            &mut revisions(),
            &guards(),
        );
        assert!(Arc::ptr_eq(&rig.inverse_bind_matrices, &original));
        assert_eq!(rig.inverse_bind_matrices.read().unwrap().as_ptr(), pointer);
        assert_eq!(
            rig.inverse_bind_matrices.read().unwrap().as_ref(),
            &[7.0; 16]
        );
    }
}
mod dispose_skeleton3d {
    use super::*;
    #[test]
    fn clears_joint_references_and_names_without_dropping_palettes_or_parenting_nodes() {
        let node = joint(0.0, 0.0, 0.0);
        let mut rig = skeleton(vec![node], Some(vec!["a".to_string()]));
        let palette = rig.joint_matrices.read().unwrap().as_ptr();
        dispose_skeleton3d(&mut rig);
        assert!(rig.joints.read().unwrap().is_empty());
        assert!(rig.names.is_none());
        assert_eq!(rig.joint_matrices.read().unwrap().as_ptr(), palette);
        assert_eq!(rig.joint_matrices.read().unwrap().len(), 16);
    }
}
mod equals_skeleton3d {
    use super::*;
    #[test]
    fn compares_reflexively_then_joint_count_bind_values_and_optional_names_only() {
        let a = skeleton(vec![joint(1.0, 0.0, 0.0)], None);
        assert!(equals_skeleton3d(&a, &a));
        assert!(equals_skeleton3d(&a, &clone_skeleton3d(&a)));
        assert!(!equals_skeleton3d(
            &a,
            &skeleton(vec![joint(9.0, 0.0, 0.0)], None)
        ));
        assert!(!equals_skeleton3d(
            &a,
            &skeleton(vec![joint(0.0, 0.0, 0.0), joint(0.0, 0.0, 0.0)], None)
        ));
        let mut named = clone_skeleton3d(&a);
        named.names = Some(vec!["root".to_string()]);
        assert!(!equals_skeleton3d(&a, &named));
        let mut other = clone_skeleton3d(&named);
        other.names = Some(vec!["other".to_string()]);
        assert!(!equals_skeleton3d(&named, &other));
        other.names = Some(Vec::new());
        assert!(!equals_skeleton3d(&named, &other));
        other = clone_skeleton3d(&a);
        other.joint_matrices.write().unwrap()[0] = 99.0;
        assert!(equals_skeleton3d(&a, &other));
        other.inverse_bind_matrices.write().unwrap()[0] = f32::NAN;
        assert!(equals_skeleton3d(&other, &other));
        assert!(!equals_skeleton3d(&other, &clone_skeleton3d(&other)));
    }
}
mod get_skeleton3d_joint_index_by_name {
    use super::*;
    #[test]
    fn returns_first_matching_name_or_negative_one() {
        let rig = skeleton(
            vec![joint(0.0, 0.0, 0.0), joint(0.0, 0.0, 0.0)],
            Some(vec!["hip".to_string(), "spine".to_string()]),
        );
        assert_eq!(get_skeleton3d_joint_index_by_name(&rig, "spine"), 1);
        assert_eq!(get_skeleton3d_joint_index_by_name(&rig, "missing"), -1);
        assert_eq!(
            get_skeleton3d_joint_index_by_name(&skeleton(Vec::new(), None), "hip"),
            -1
        );
    }
}
mod get_skeleton3d_joint_world_matrix {
    use super::*;
    #[test]
    fn copies_original_joint_world_pose_and_leaves_invalid_output_unchanged() {
        let rig = skeleton(vec![joint(5.0, 3.0, 0.0)], None);
        let mut out = create_matrix4();
        assert!(get_skeleton3d_joint_world_matrix(
            &mut out,
            &rig,
            0,
            &mut revisions()
        ));
        assert_eq!(&out.m[12..15], &[5.0, 3.0, 0.0]);
        let before = out.m;
        assert!(!get_skeleton3d_joint_world_matrix(
            &mut out,
            &rig,
            5,
            &mut revisions()
        ));
        assert!(!get_skeleton3d_joint_world_matrix(
            &mut out,
            &rig,
            -1,
            &mut revisions()
        ));
        assert_eq!(out.m, before);
    }
}
mod get_skeleton3d_joint_world_matrix_by_name {
    use super::*;
    #[test]
    fn resolves_the_named_original_joint_and_preserves_output_for_missing_names() {
        let rig = skeleton(
            vec![joint(0.0, 0.0, 0.0), joint(7.0, 0.0, 0.0)],
            Some(vec!["hip".to_string(), "hand".to_string()]),
        );
        let mut out = create_matrix4();
        assert!(get_skeleton3d_joint_world_matrix_by_name(
            &mut out,
            &rig,
            "hand",
            &mut revisions()
        ));
        close(out.m[12], 7.0);
        assert!(!get_skeleton3d_joint_world_matrix_by_name(
            &mut out,
            &rig,
            "missing",
            &mut revisions()
        ));
        close(out.m[12], 7.0);
    }
}
mod initialize_skeleton3d {
    use super::*;
    #[test]
    fn retains_defining_refs_and_runtime_while_accepting_names_after_construction() {
        let mut out: Skeleton3D = flight_entity::allocate_entity();
        let id = flight_entity::get_entity_id(&out);
        flight_entity::set_entity_uid(&mut out, "skeleton-under-construction".to_string());
        let runtime = flight_entity::get_entity_runtime(&out).unwrap() as *const _;
        let node: flight_scene3d::Node3DRef = joint(0.0, 0.0, 0.0);
        let joints = Arc::new(std::sync::RwLock::new(vec![node]));
        let inverse = Arc::new(std::sync::RwLock::new(vec![1.0; 16].into_boxed_slice()));
        let palette = Arc::new(std::sync::RwLock::new(vec![2.0; 16].into_boxed_slice()));
        let normals = Arc::new(std::sync::RwLock::new(vec![3.0; 12].into_boxed_slice()));
        initialize_skeleton3d(
            &mut out,
            inverse.clone(),
            palette.clone(),
            joints.clone(),
            normals.clone(),
        );
        assert!(out.names.is_none());
        assert!(Arc::ptr_eq(&out.joints, &joints));
        assert!(Arc::ptr_eq(&out.inverse_bind_matrices, &inverse));
        assert!(Arc::ptr_eq(&out.joint_matrices, &palette));
        assert!(Arc::ptr_eq(&out.normal_matrices, &normals));
        out.names = Some(vec!["root".to_string()]);
        assert_eq!(get_skeleton3d_joint_index_by_name(&out, "root"), 0);
        assert_eq!(flight_entity::get_entity_id(&out), id);
        assert_eq!(
            flight_entity::get_entity_uid(&mut out),
            "skeleton-under-construction"
        );
        assert_eq!(
            flight_entity::get_entity_runtime(&out).unwrap() as *const _,
            runtime
        );
        inverse.write().unwrap()[0] = 4.0;
        palette.write().unwrap()[0] = 5.0;
        normals.write().unwrap()[0] = 6.0;
        assert_eq!(out.inverse_bind_matrices.read().unwrap()[0], 4.0);
        assert_eq!(out.joint_matrices.read().unwrap()[0], 5.0);
        assert_eq!(out.normal_matrices.read().unwrap()[0], 6.0);
    }
    #[test]
    fn retains_exact_joint_array_handle_without_replacing_entity_runtime() {
        let mut rig = skeleton(Vec::new(), None);
        flight_entity::set_entity_uid(&mut rig, "same-runtime".to_string());
        let joints = Arc::new(std::sync::RwLock::new(Vec::new()));
        let empty = Arc::new(std::sync::RwLock::new(Vec::<f32>::new().into_boxed_slice()));
        initialize_skeleton3d(
            &mut rig,
            empty.clone(),
            empty.clone(),
            joints.clone(),
            empty,
        );
        assert!(Arc::ptr_eq(&rig.joints, &joints));
        assert_eq!(flight_entity::get_entity_uid(&mut rig), "same-runtime");
        let node: flight_scene3d::Node3DRef = joint(0.0, 0.0, 0.0);
        joints.write().unwrap().push(node.clone());
        assert!(Arc::ptr_eq(&rig.joints.read().unwrap()[0], &node));
    }
    #[test]
    fn retains_original_shared_buffer_refs_and_clone_allocates_distinct_empty_arrays() {
        let shared: flight_entity::Ref<Box<flight_entity::Float32Array>> =
            Arc::new(std::sync::RwLock::new(Box::new([])));
        let mut rig = skeleton(Vec::new(), None);
        initialize_skeleton3d(
            &mut rig,
            shared.clone(),
            shared.clone(),
            Arc::new(std::sync::RwLock::new(Vec::new())),
            shared.clone(),
        );
        assert!(Arc::ptr_eq(&rig.inverse_bind_matrices, &shared));
        assert!(Arc::ptr_eq(&rig.joint_matrices, &shared));
        assert!(Arc::ptr_eq(&rig.normal_matrices, &shared));
        let cloned = clone_skeleton3d(&rig);
        assert!(!Arc::ptr_eq(&cloned.inverse_bind_matrices, &shared));
        assert!(!Arc::ptr_eq(&cloned.joint_matrices, &shared));
        assert!(!Arc::ptr_eq(&cloned.normal_matrices, &shared));
        assert!(!Arc::ptr_eq(
            &cloned.joint_matrices,
            &cloned.inverse_bind_matrices
        ));
    }
    #[test]
    fn assigns_all_original_fields_to_an_actual_entity_without_replacing_its_uid() {
        let mut rig = skeleton(Vec::new(), None);
        flight_entity::set_entity_uid(&mut rig, "kept".to_string());
        let node = joint(0.0, 0.0, 0.0);
        initialize_skeleton3d(
            &mut rig,
            Arc::new(std::sync::RwLock::new(vec![1.0; 16].into_boxed_slice())),
            Arc::new(std::sync::RwLock::new(vec![2.0; 16].into_boxed_slice())),
            Arc::new(std::sync::RwLock::new(vec![node.clone()])),
            Arc::new(std::sync::RwLock::new(vec![3.0; 12].into_boxed_slice())),
        );
        rig.names = Some(vec!["name".to_string()]);
        assert_eq!(flight_entity::get_entity_uid(&mut rig), "kept");
        assert!(Arc::ptr_eq(
            &rig.joints.read().unwrap()[0],
            &(node as flight_scene3d::Node3DRef)
        ));
        assert_eq!(rig.joint_matrices.read().unwrap()[0], 2.0);
        assert_eq!(rig.normal_matrices.read().unwrap()[0], 3.0);
    }
}
mod set_skeleton3d_bind_pose {
    use super::*;
    #[test]
    fn guard_can_clear_shared_joint_array_without_a_lock_or_stale_length() {
        let first = joint(0.0, 0.0, 0.0);
        first.write().unwrap().scale.x = 0.0;
        let second = joint(0.0, 0.0, 0.0);
        second.write().unwrap().scale.x = 0.0;
        let mut rig = skeleton(vec![first, second], None);
        let shared = rig.joints.clone();
        let state = guards();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        set_skeleton3d_bind_pose_guard(
            &state,
            Some(Arc::new(move |skeleton, index| {
                sink.lock().unwrap().push(index);
                skeleton.joints.try_write().unwrap().clear();
            })),
        );
        set_skeleton3d_bind_pose(&mut rig, &mut revisions(), &state);
        assert_eq!(*seen.lock().unwrap(), [0]);
        assert!(shared.read().unwrap().is_empty());
    }
    #[test]
    fn recovers_each_singular_joint_with_identity_while_preserving_healthy_bind_entries() {
        let collapsed = joint(0.0, 0.0, 0.0);
        let healthy = joint(0.0, 0.0, 0.0);
        let mut rig = skeleton(vec![collapsed.clone(), healthy.clone()], None);
        collapsed.write().unwrap().scale = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        healthy.write().unwrap().position.x = 3.0;
        let c: NodeRef = collapsed;
        let h: NodeRef = healthy;
        invalidate_node_local_transform(&c);
        invalidate_node_local_transform(&h);
        set_skeleton3d_bind_pose(&mut rig, &mut revisions(), &guards());
        assert!(
            rig.inverse_bind_matrices
                .read()
                .unwrap()
                .iter()
                .all(|v| v.is_finite())
        );
        assert_eq!(
            &rig.inverse_bind_matrices.read().unwrap()[..16],
            &create_matrix4().m
        );
        close(rig.inverse_bind_matrices.read().unwrap()[28], -3.0);
    }
    #[test]
    fn makes_the_current_pose_the_new_rest_pose() {
        let node = joint(0.0, 0.0, 0.0);
        let mut rig = skeleton(vec![node.clone()], None);
        node.write().unwrap().position.x = 2.0;
        let erased: NodeRef = node;
        invalidate_node_local_transform(&erased);
        set_skeleton3d_bind_pose(&mut rig, &mut revisions(), &guards());
        compute_skeleton3d_joint_matrices(&mut rig, &mut revisions());
        close(rig.joint_matrices.read().unwrap()[12], 0.0);
    }
}
mod set_skeleton3d_bind_pose_guard {
    use super::*;
    #[test]
    fn notifies_only_for_degenerate_joints_and_releases_the_guard_state_before_callbacks() {
        let state = guards();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let reentry = state.clone();
        set_skeleton3d_bind_pose_guard(
            &state,
            Some(Arc::new(move |_, index| {
                assert!(reentry.try_write().is_ok());
                sink.lock().unwrap().push(index);
            })),
        );
        let collapsed = joint(0.0, 0.0, 0.0);
        let mut rig = skeleton(vec![joint(0.0, 0.0, 0.0), collapsed.clone()], None);
        collapsed.write().unwrap().scale.x = 0.0;
        let erased: NodeRef = collapsed;
        invalidate_node_local_transform(&erased);
        set_skeleton3d_bind_pose(&mut rig, &mut revisions(), &state);
        assert_eq!(*seen.lock().unwrap(), vec![1]);
        set_skeleton3d_bind_pose_guard(&state, None);
        set_skeleton3d_bind_pose(&mut rig, &mut revisions(), &state);
        assert_eq!(*seen.lock().unwrap(), vec![1]);
    }
}
mod validate_skeleton3d {
    use super::*;
    #[test]
    fn reports_exact_length_diagnostic_and_accepts_a_valid_skeleton() {
        let mut rig = skeleton(vec![joint(0.0, 0.0, 0.0), joint(0.0, 0.0, 0.0)], None);
        assert!(validate_skeleton3d(&rig).is_none());
        rig.inverse_bind_matrices =
            std::sync::Arc::new(std::sync::RwLock::new(vec![0.0; 16].into_boxed_slice()));
        let diagnostic = validate_skeleton3d(&rig).unwrap();
        assert_eq!(diagnostic.joint_count, 2);
        assert_eq!(diagnostic.expected_inverse_bind_matrices_length, 32);
        assert_eq!(diagnostic.inverse_bind_matrices_length, 16);
        assert_eq!(
            diagnostic.message,
            "Skeleton3D inverseBindMatrices length 16 does not match jointCount 2 * 16 = 32."
        );
    }
}
