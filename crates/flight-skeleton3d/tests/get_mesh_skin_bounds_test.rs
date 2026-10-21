use crate::support::*;
use flight_geometry::create_aabb;
use flight_meshgeometry::MeshSkinBindPose;
use flight_skeleton3d::*;
fn pose(positions: Vec<f32>, indices: &[f32]) -> MeshSkinBindPose {
    let count = positions.len() / 3;
    let mut joints = vec![0.0; count * 4].into_boxed_slice();
    let mut weights = vec![0.0; count * 4].into_boxed_slice();
    for v in 0..count {
        joints[v * 4] = indices[v];
        weights[v * 4] = 1.0;
    }
    return MeshSkinBindPose {
        joints,
        weights,
        positions: positions.into_boxed_slice(),
        normals: vec![0.0; count * 3].into_boxed_slice(),
        skinned_positions: vec![0.0; count * 3].into_boxed_slice(),
        skinned_normals: vec![0.0; count * 3].into_boxed_slice(),
        tangents: Box::new([]),
        skinned_tangents: Box::new([]),
    };
}
mod get_mesh_skin_conservative_bounds {
    use super::*;
    #[test]
    fn sweeps_only_referenced_joints_and_unions_the_rest_box() {
        let pose = pose(vec![0.0; 6], &[0.0, 1.0]);
        let skeleton =
            palette_skeleton([translation(10.0, 0.0, 0.0), translation(0.0, 20.0, 0.0)].concat());
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        get_mesh_skin_conservative_bounds(&mut out, &pose, &skeleton);
        assert_eq!([out.min.x, out.min.y, out.min.z], [0.0; 3]);
        assert_eq!([out.max.x, out.max.y, out.max.z], [10.0, 20.0, 0.0]);
        let pose = super::pose(vec![1.0, 0.0, 0.0], &[0.0]);
        let skeleton = palette_skeleton(
            [
                translation(0.0, 0.0, 0.0),
                translation(1000.0, 1000.0, 1000.0),
            ]
            .concat(),
        );
        get_mesh_skin_conservative_bounds(&mut out, &pose, &skeleton);
        assert_eq!([out.max.x, out.max.y, out.max.z], [1.0, 0.0, 0.0]);
    }
    #[test]
    fn writes_empty_boxes_for_empty_rest_pose_or_no_valid_referenced_joints() {
        let mut out = create_aabb(1.0, 2.0, 3.0, 4.0, 5.0, 6.0);
        let skeleton = palette_skeleton(translation(0.0, 0.0, 0.0));
        for pose in [pose(Vec::new(), &[]), pose(vec![1.0, 2.0, 3.0], &[99.0])] {
            get_mesh_skin_conservative_bounds(&mut out, &pose, &skeleton);
            assert_eq!(out.min.x, f32::INFINITY);
            assert_eq!(out.max.x, f32::NEG_INFINITY);
        }
    }
}
mod get_mesh_skin_exact_bounds {
    use super::*;
    #[test]
    fn takes_the_tight_box_of_every_skinned_vertex_using_the_original_scratch() {
        let mut pose = pose(
            vec![0.0, 0.0, 0.0, 2.0, 2.0, 0.0, 0.0, 0.0, 0.0, 2.0, 2.0, 0.0],
            &[0.0, 0.0, 1.0, 1.0],
        );
        let scratch = pose.skinned_positions.as_ptr();
        let skeleton =
            palette_skeleton([translation(0.0, 0.0, 0.0), translation(10.0, 0.0, 0.0)].concat());
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        get_mesh_skin_exact_bounds(&mut out, &mut pose, &skeleton);
        assert_eq!([out.min.x, out.min.y, out.min.z], [0.0; 3]);
        assert_eq!([out.max.x, out.max.y, out.max.z], [12.0, 2.0, 0.0]);
        assert_eq!(pose.skinned_positions.as_ptr(), scratch);
    }
    #[test]
    fn is_contained_in_the_conservative_sweep_for_scaled_and_translated_joints() {
        let mut pose = pose(
            vec![
                -1.0, -1.0, -1.0, 1.0, 1.0, 1.0, 0.5, -0.5, 0.25, -0.75, 0.6, -0.4,
            ],
            &[0.0, 1.0, 0.0, 1.0],
        );
        let mut first = translation(3.0, 0.0, 0.0);
        first[0] = 2.0;
        first[5] = 2.0;
        first[10] = 2.0;
        let skeleton = palette_skeleton([first, translation(0.0, -5.0, 2.0)].concat());
        let mut exact = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mut conservative = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        get_mesh_skin_exact_bounds(&mut exact, &mut pose, &skeleton);
        get_mesh_skin_conservative_bounds(&mut conservative, &pose, &skeleton);
        for (c, e) in [
            (conservative.min.x, exact.min.x),
            (conservative.min.y, exact.min.y),
            (conservative.min.z, exact.min.z),
        ] {
            assert!(c <= e + 0.00001);
        }
        for (c, e) in [
            (conservative.max.x, exact.max.x),
            (conservative.max.y, exact.max.y),
            (conservative.max.z, exact.max.z),
        ] {
            assert!(c >= e - 0.00001);
        }
    }
}
