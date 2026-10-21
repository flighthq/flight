use crate::support::*;
use flight_meshgeometry::*;
use flight_skeleton3d::*;
use std::sync::{Arc, RwLock};
fn one_vertex() -> MeshGeometry {
    return geometry(
        [1.0, 2.0, 3.0],
        [0.0, 1.0, 0.0],
        [2.0, 0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0, -1.0],
    );
}
mod capture_mesh_skin_bind_pose {
    use super::*;
    #[test]
    fn deinterleaves_channels_and_allocates_independent_reusable_scratch() {
        let g = one_vertex();
        let pose = capture_mesh_skin_bind_pose(&g);
        assert_eq!(pose.positions.as_ref(), &[1.0, 2.0, 3.0]);
        assert_eq!(pose.normals.as_ref(), &[0.0, 1.0, 0.0]);
        assert_eq!(pose.tangents.as_ref(), &[1.0, 0.0, 0.0, -1.0]);
        assert_eq!(pose.joints[0], 2.0);
        assert_eq!(pose.weights[0], 1.0);
        assert_eq!(pose.skinned_positions.len(), 3);
        assert_eq!(pose.skinned_normals.len(), 3);
        assert_eq!(pose.skinned_tangents.len(), 4);
        assert_ne!(pose.positions.as_ptr(), pose.skinned_positions.as_ptr());
        assert_eq!(g.vertices[0], 1.0);
    }
    #[test]
    fn decodes_packed_joint_indices_and_normalized_weights_through_canonical_attributes() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                },
                VertexAttribute {
                    byte_offset: 12,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Normal,
                },
                VertexAttribute {
                    byte_offset: 24,
                    format: VertexFormat::Uint8x4,
                    semantic: VertexSemantic::Joints0,
                },
                VertexAttribute {
                    byte_offset: 28,
                    format: VertexFormat::Unorm8x4,
                    semantic: VertexSemantic::Weights0,
                },
            ],
            stride: 32,
        };
        let mut vertices = vec![1.0, 2.0, 3.0, 0.0, 1.0, 0.0, 0.0, 0.0].into_boxed_slice();
        vertices[6] = f32::from_bits(u32::from_le_bytes([3, 2, 1, 0]));
        vertices[7] = f32::from_bits(u32::from_le_bytes([128, 64, 32, 31]));
        let g = create_mesh_geometry(MeshGeometryOptions {
            vertices,
            layout: Arc::new(RwLock::new(layout)),
            indices: None,
            subsets: None,
            topology: None,
        });
        let pose = capture_mesh_skin_bind_pose(&g);
        assert_eq!(pose.joints.as_ref(), &[3.0, 2.0, 1.0, 0.0]);
        for (actual, byte) in pose.weights.iter().zip([128, 64, 32, 31]) {
            close(*actual, byte as f32 / 255.0);
        }
        assert!(pose.tangents.is_empty());
        assert!(pose.skinned_tangents.is_empty());
    }
    #[test]
    fn honors_reordered_offsets_missing_channels_and_zero_stride() {
        let layout = VertexAttributeLayout {
            attributes: vec![VertexAttribute {
                byte_offset: 4,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            }],
            stride: 16,
        };
        let mut g = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![99.0, 1.0, 2.0, 3.0].into_boxed_slice(),
            layout: Arc::new(RwLock::new(layout)),
            indices: None,
            subsets: None,
            topology: None,
        });
        let pose = capture_mesh_skin_bind_pose(&g);
        assert_eq!(pose.positions.as_ref(), &[1.0, 2.0, 3.0]);
        assert_eq!(pose.normals.as_ref(), &[0.0; 3]);
        assert_eq!(pose.joints.as_ref(), &[0.0; 4]);
        assert_eq!(pose.weights.as_ref(), &[0.0; 4]);
        g.layout.write().unwrap().stride = 0;
        let pose = capture_mesh_skin_bind_pose(&g);
        assert!(pose.positions.is_empty());
    }
}
mod skin_mesh_geometry {
    use super::*;
    #[test]
    fn follows_the_actual_joint_palette_from_authored_rotation_through_tangent_writeback() {
        let mut geometry = geometry(
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0; 4],
            [1.0, 0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0, -1.0],
        );
        let joint = joint(0.0, 0.0, 0.0);
        let mut skeleton = skeleton(vec![joint.clone()], None);
        let mut pose = capture_mesh_skin_bind_pose(&geometry);
        joint.write().unwrap().rotation = flight_geometry::create_quaternion(
            0.0,
            0.0,
            std::f32::consts::FRAC_1_SQRT_2,
            std::f32::consts::FRAC_1_SQRT_2,
        );
        let node: flight_node::NodeRef = joint;
        flight_node::invalidate_node_local_transform(&node);
        compute_skeleton3d_joint_matrices(&mut skeleton, &mut revisions());
        skin_mesh_geometry(&mut geometry, &skeleton, &mut pose);
        close(geometry.vertices[6], 0.0);
        close(geometry.vertices[7], 1.0);
        close(geometry.vertices[8], 0.0);
        assert_eq!(geometry.vertices[9], -1.0);
        close(
            geometry.vertices[6]
                .hypot(geometry.vertices[7])
                .hypot(geometry.vertices[8]),
            1.0,
        );
        close(
            geometry.vertices[3] * geometry.vertices[6]
                + geometry.vertices[4] * geometry.vertices[7]
                + geometry.vertices[5] * geometry.vertices[8],
            0.0,
        );
    }
    #[test]
    fn writes_identity_then_translation_from_bind_pose_preserving_static_channels_and_version() {
        let mut g = geometry(
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0; 4],
            [1.0, 0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0, -1.0],
        );
        let original = g.vertices.clone();
        let mut pose = capture_mesh_skin_bind_pose(&g);
        let mut skeleton = palette_skeleton(translation(0.0, 0.0, 0.0));
        skeleton.normal_matrices = std::sync::Arc::new(std::sync::RwLock::new(
            vec![1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0].into_boxed_slice(),
        ));
        let version = g.version;
        skin_mesh_geometry(&mut g, &skeleton, &mut pose);
        assert_eq!(&g.vertices[..3], &[1.0, 0.0, 0.0]);
        assert_eq!(g.version, version + 1);
        skeleton.joint_matrices = std::sync::Arc::new(std::sync::RwLock::new(
            translation(0.0, 5.0, 0.0).into_boxed_slice(),
        ));
        skin_mesh_geometry(&mut g, &skeleton, &mut pose);
        assert_eq!(&g.vertices[..3], &[1.0, 5.0, 0.0]);
        assert_eq!(g.vertices[4], 1.0);
        assert_eq!(&g.vertices[10..], &original[10..]);
        assert_eq!(g.version, version + 2);
        skin_mesh_geometry(&mut g, &skeleton, &mut pose);
        assert_eq!(g.vertices[1], 5.0);
    }
    #[test]
    fn writes_rotated_tangent_and_its_handedness_to_interleaved_geometry() {
        let mut g = geometry(
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0; 4],
            [1.0, 0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0, -1.0],
        );
        let mut pose = capture_mesh_skin_bind_pose(&g);
        let mut skeleton = palette_skeleton(vec![
            0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ]);
        skeleton.normal_matrices = std::sync::Arc::new(std::sync::RwLock::new(
            vec![0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0].into_boxed_slice(),
        ));
        skin_mesh_geometry(&mut g, &skeleton, &mut pose);
        assert_eq!(&g.vertices[6..10], &[0.0, 1.0, 0.0, -1.0]);
        close(g.vertices[6].hypot(g.vertices[7]).hypot(g.vertices[8]), 1.0);
        close(
            g.vertices[3] * g.vertices[6]
                + g.vertices[4] * g.vertices[7]
                + g.vertices[5] * g.vertices[8],
            0.0,
        );
    }
}
mod update_mesh_skin_bind_pose_deform_input {
    use super::*;
    #[test]
    fn refreshes_only_position_and_normal_inputs_retaining_influence_and_scratch_allocations() {
        let mut g = one_vertex();
        let mut pose = capture_mesh_skin_bind_pose(&g);
        let joints = pose.joints.as_ptr();
        let weights = pose.weights.as_ptr();
        let scratch = pose.skinned_positions.as_ptr();
        let tangents = pose.tangents.as_ptr();
        g.vertices[..6].copy_from_slice(&[4.0, 5.0, 6.0, 1.0, 0.0, 0.0]);
        update_mesh_skin_bind_pose_deform_input(&mut pose, &g);
        assert_eq!(pose.positions.as_ref(), &[4.0, 5.0, 6.0]);
        assert_eq!(pose.normals.as_ref(), &[1.0, 0.0, 0.0]);
        assert_eq!(pose.joints.as_ptr(), joints);
        assert_eq!(pose.weights.as_ptr(), weights);
        assert_eq!(pose.skinned_positions.as_ptr(), scratch);
        assert_eq!(pose.tangents.as_ptr(), tangents);
        assert_eq!(pose.tangents.as_ref(), &[1.0, 0.0, 0.0, -1.0]);
    }
}
