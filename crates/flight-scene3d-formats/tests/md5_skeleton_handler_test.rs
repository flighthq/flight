use super::md5_test_helper::*;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d_formats::*;
use std::sync::Arc;

mod build_md5_skeleton_document {
    use super::*;

    #[test]
    fn malformed_parent_chains_are_roots_with_ordered_aggregate_diagnostics() {
        for joints in [
            vec![joint("negative", -2, 1.0)],
            vec![joint("too-large", 99, 1.0)],
            vec![joint("self", 0, 1.0)],
            vec![joint("a", 1, 1.0), joint("b", 0, 3.0)],
        ] {
            let mut document = empty_document();
            let mut drops = Vec::new();
            let skin = build_md5_skeleton_document(&mut document, &joints, Some(&mut drops));
            assert_eq!(document.nodes[0].children.len(), joints.len());
            assert_eq!(skin.joints.len(), joints.len());
            assert_eq!(drops.len(), 1);
            assert_eq!(drops[0].value.kind, "md5mesh.joint-parent-out-of-range");
            assert_eq!(drops[0].value.severity, ImportDiagnosticSeverity::Recover);
            assert_eq!(drops[0].value.count, joints.len());
            assert_eq!(
                drops[0].value.detail.get("firstJoint"),
                Some(&ImportDiagnosticDetailValue::Number(0.0))
            );
            assert_eq!(
                drops[0].value.detail.get("firstParent"),
                Some(&ImportDiagnosticDetailValue::Number(
                    joints[0].parent_index as f32
                ))
            );
            assert_eq!(document.nodes[1].transform.position.z, -1.0);
        }
    }

    #[test]
    fn nested_local_positions_and_absolute_inverse_bind_are_distinct() {
        let mut document = empty_document();
        let skin = build_md5_skeleton_document(
            &mut document,
            &[joint("root", -1, 1.0), joint("spine", 0, 3.0)],
            None,
        );
        assert_eq!(document.nodes[1].transform.position.z, -1.0);
        assert_eq!(document.nodes[2].transform.position.z, -2.0);
        assert_eq!(skin.inverse_bind.len(), 2);
        assert_eq!(skin.inverse_bind[0].m[14], 1.0);
        assert_eq!(skin.inverse_bind[1].m[14], 3.0);
    }

    #[test]
    fn wires_joint_parent_hierarchy_without_flattening() {
        let mut document = empty_document();
        let skin = build_md5_skeleton_document(
            &mut document,
            &[joint("root", -1, 0.0), joint("spine", 0, 1.0)],
            None,
        );
        assert_eq!(document.nodes[0].name.as_deref(), Some("skeleton"));
        assert_eq!(document.nodes.len(), 3);
        assert_eq!(skin.joints.len(), 2);
        assert_eq!(document.nodes[0].children, [1]);
        assert_eq!(document.nodes[1].children, [2]);
        assert_eq!(document.scenes[0].root_nodes, [0]);
    }
    #[test]
    fn constructs_independent_skin_records_for_each_authored_hierarchy_without_mutating_previous_arrays()
     {
        let mut document = empty_document();
        let joints = [joint("root", -1, 1.0)];
        let first = build_md5_skeleton_document(&mut document, &joints, None);
        let second = build_md5_skeleton_document(&mut document, &joints, None);
        assert_eq!(first.joints, [1]);
        assert_eq!(second.joints, [3]);
        assert_eq!(first.inverse_bind.len(), 1);
        assert_eq!(second.inverse_bind.len(), 1);
        assert_ne!(first.joints.as_ptr(), second.joints.as_ptr());
        assert_ne!(first.inverse_bind.as_ptr(), second.inverse_bind.as_ptr());
        assert_eq!(first.inverse_bind[0].m, second.inverse_bind[0].m);
        assert_eq!(document.nodes.len(), 4);
        assert_eq!(document.scenes[0].root_nodes, [0, 2]);
    }
}

mod md5_skeleton_handler {
    use super::*;

    #[test]
    fn empty_joints_emit_neither_nodes_nor_skin() {
        let mut document = empty_document();
        let mut context = Md5ParseContext {
            diagnostics: None,
            document: &mut document,
            drops: None,
            joints: &[],
            mesh: None,
            skin: None,
        };
        let collect = MD5_SKELETON_HANDLER.read().unwrap().collect.clone();
        collect(&mut context);
        assert_eq!(context.skin, None);
        assert!(context.document.nodes.is_empty());
        assert!(context.document.skins.is_empty());
    }

    #[test]
    fn family_and_handler_claim_the_skeleton_feature_with_same_identity() {
        assert_eq!(MD5_SKELETON_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(&MD5_SKELETON_FAMILY[0], &MD5_SKELETON_HANDLER));
        assert_eq!(
            MD5_SKELETON_HANDLER.read().unwrap().feature,
            MD5_SKELETON_FEATURE
        );
    }

    #[test]
    fn records_skin_index_and_emits_group_joints_and_skin() {
        let mut document = empty_document();
        let joints = [joint("root", -1, 0.0), joint("spine", 0, 1.0)];
        let mut context = Md5ParseContext {
            diagnostics: None,
            document: &mut document,
            drops: None,
            joints: &joints,
            mesh: None,
            skin: None,
        };
        assert_eq!(context.skin, None);
        let collect = MD5_SKELETON_HANDLER.read().unwrap().collect.clone();
        collect(&mut context);
        assert_eq!(context.skin, Some(0));
        assert_eq!(context.document.nodes.len(), 3);
        assert_eq!(context.document.nodes[0].name.as_deref(), Some("skeleton"));
        assert_eq!(context.document.skins.len(), 1);
        assert_eq!(context.document.skins[0].joints.len(), 2);
    }
}
