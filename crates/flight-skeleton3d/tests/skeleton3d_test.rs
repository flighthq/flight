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
            source.inverse_bind_matrices.as_ptr(),
            clone.inverse_bind_matrices.as_ptr()
        );
        assert_ne!(
            source.joint_matrices.as_ptr(),
            clone.joint_matrices.as_ptr()
        );
        assert_ne!(
            source.normal_matrices.as_ptr(),
            clone.normal_matrices.as_ptr()
        );
        assert_ne!(source.joints.as_ptr(), clone.joints.as_ptr());
        assert!(Arc::ptr_eq(&source.joints[0], &clone.joints[0]));
        assert_eq!(source.inverse_bind_matrices, clone.inverse_bind_matrices);
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
        assert!(!Arc::ptr_eq(&source.joints[0], &clone.joints[0]));
        assert!(!Arc::ptr_eq(&source.joints[1], &clone.joints[1]));
        let r: NodeRef = clone.joints[0].clone();
        let c: NodeRef = clone.joints[1].clone();
        assert!(get_node_parent(&r).is_none());
        assert!(Arc::ptr_eq(&get_node_parent(&c).unwrap(), &r));
        assert!(Arc::ptr_eq(
            &get_node_parent(&child_ref).unwrap(),
            &root_ref
        ));
        assert_ne!(
            source.inverse_bind_matrices.as_ptr(),
            clone.inverse_bind_matrices.as_ptr()
        );
        assert_eq!(clone.names, source.names);
        clone.joints[0]
            .write()
            .unwrap()
            .node3d_fields_mut()
            .position
            .x = 6.0;
        invalidate_node_local_transform(&r);
        compute_skeleton3d_joint_matrices(&mut source, &mut revisions());
        compute_skeleton3d_joint_matrices(&mut clone, &mut revisions());
        close(source.joint_matrices[12], 0.0);
        close(source.joint_matrices[28], 0.0);
        close(clone.joint_matrices[12], 5.0);
        close(clone.joint_matrices[28], 5.0);
    }
}
mod compute_skeleton3d_joint_matrices {
    use super::*;
    #[test]
    fn encodes_pose_delta_and_rest_identity_for_every_joint() {
        let node = joint(5.0, 0.0, 0.0);
        let mut rig = skeleton(vec![node.clone()], None);
        compute_skeleton3d_joint_matrices(&mut rig, &mut revisions());
        close(rig.joint_matrices[0], 1.0);
        close(rig.joint_matrices[12], 0.0);
        close(rig.joint_matrices[13], 0.0);
        node.write().unwrap().position.y = 3.0;
        let erased: NodeRef = node;
        invalidate_node_local_transform(&erased);
        compute_skeleton3d_joint_matrices(&mut rig, &mut revisions());
        close(rig.joint_matrices[12], 0.0);
        close(rig.joint_matrices[13], 3.0);
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
            close(rig.joint_matrices[index], expected);
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
        assert_eq!(rig.normal_matrices.len(), 12);
        assert_eq!(
            rig.normal_matrices.as_ref(),
            &[0.5, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        );
    }
}
mod create_skeleton3d {
    use super::*;
    #[test]
    fn sizes_zeroed_palettes_captures_optional_bind_pose_and_retains_supplied_buffers() {
        let mut rig = skeleton(vec![joint(0.0, 0.0, 0.0), joint(0.0, 0.0, 0.0)], None);
        assert_eq!(rig.joint_matrices.len(), 32);
        assert_eq!(rig.inverse_bind_matrices.len(), 32);
        assert_eq!(rig.normal_matrices.len(), 24);
        assert!(rig.joint_matrices.iter().all(|v| *v == 0.0));
        assert!(!flight_entity::get_entity_uid(&mut rig).is_empty());
        let supplied = vec![7.0; 16].into_boxed_slice();
        let pointer = supplied.as_ptr();
        let rig = create_skeleton3d(
            vec![joint(99.0, 0.0, 0.0)],
            Some(supplied),
            None,
            &mut revisions(),
            &guards(),
        );
        assert_eq!(rig.inverse_bind_matrices.as_ptr(), pointer);
        assert_eq!(rig.inverse_bind_matrices.as_ref(), &[7.0; 16]);
    }
}
mod dispose_skeleton3d {
    use super::*;
    #[test]
    fn clears_joint_references_and_names_without_dropping_palettes_or_parenting_nodes() {
        let node = joint(0.0, 0.0, 0.0);
        let mut rig = skeleton(vec![node], Some(vec!["a".to_string()]));
        let palette = rig.joint_matrices.as_ptr();
        dispose_skeleton3d(&mut rig);
        assert!(rig.joints.is_empty());
        assert!(rig.names.is_none());
        assert_eq!(rig.joint_matrices.as_ptr(), palette);
        assert_eq!(rig.joint_matrices.len(), 16);
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
        other.joint_matrices[0] = 99.0;
        assert!(equals_skeleton3d(&a, &other));
        other.inverse_bind_matrices[0] = f32::NAN;
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
    fn assigns_all_original_fields_to_an_actual_entity_without_replacing_its_uid() {
        let mut rig = skeleton(Vec::new(), None);
        flight_entity::set_entity_uid(&mut rig, "kept".to_string());
        let node = joint(0.0, 0.0, 0.0);
        initialize_skeleton3d(
            &mut rig,
            vec![1.0; 16].into_boxed_slice(),
            vec![2.0; 16].into_boxed_slice(),
            vec![node.clone()],
            Some(vec!["name".to_string()]),
            vec![3.0; 12].into_boxed_slice(),
        );
        assert_eq!(flight_entity::get_entity_uid(&mut rig), "kept");
        assert!(Arc::ptr_eq(
            &rig.joints[0],
            &(node as flight_scene3d::Node3DRef)
        ));
        assert_eq!(rig.joint_matrices[0], 2.0);
        assert_eq!(rig.normal_matrices[0], 3.0);
    }
}
mod set_skeleton3d_bind_pose {
    use super::*;
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
        assert!(rig.inverse_bind_matrices.iter().all(|v| v.is_finite()));
        assert_eq!(&rig.inverse_bind_matrices[..16], &create_matrix4().m);
        close(rig.inverse_bind_matrices[28], -3.0);
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
        close(rig.joint_matrices[12], 0.0);
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
        rig.inverse_bind_matrices = vec![0.0; 16].into_boxed_slice();
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
