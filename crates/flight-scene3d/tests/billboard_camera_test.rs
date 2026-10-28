use crate::support::*;
use flight_geometry::{create_quaternion, create_vector3, set_quaternion_from_axis_angle};
use flight_node::contract::get_node_world_matrix4;
use flight_node::{add_node_child, invalidate_node_local_transform};
use flight_scene3d::contract::*;
use std::sync::{Arc, Mutex};
fn billboard(mode: BillboardMode) -> flight_entity::Ref<Billboard> {
    return {
        let out = create_billboard(test_geometry(), empty_materials());
        {
            let mut fields = out.write().unwrap();
            fields.mode = mode;
        }
        out
    };
}
mod orient_billboard_to_camera {
    use super::*;
    #[test]
    fn declines_a_singular_camera_without_changing_a_finite_existing_transform() {
        let b = billboard(BillboardMode::Full);
        b.write().unwrap().position = create_vector3(1.0, 2.0, 3.0);
        let n = as_node_ref(&b);
        invalidate_node_local_transform(&n);
        let before = get_node_world_matrix4(&n).m;
        assert!(!orient_billboard_to_camera(
            &n,
            &singular_camera(),
            &guard_state()
        ));
        let after = get_node_world_matrix4(&n).m;
        assert_eq!(after, before);
        assert!(after.iter().all(|n| n.is_finite()));
    }
    #[test]
    fn faces_a_positive_z_camera_with_an_identity_basis_and_reports_success() {
        let b = as_node_ref(&billboard(BillboardMode::Full));
        assert!(orient_billboard_to_camera(
            &b,
            &camera_looking_from(0.0, 0.0, 10.0),
            &guard_state()
        ));
        let m = get_node_world_matrix4(&b).m;
        for i in [0, 5, 10] {
            close(m[i], 1.0);
        }
        for i in [1, 4, 8] {
            close(m[i], 0.0);
        }
    }
    #[test]
    fn points_normal_at_eye_and_preserves_position_and_scale_across_repeated_orientation() {
        let b = billboard(BillboardMode::Full);
        b.write().unwrap().position.x = 3.0;
        b.write().unwrap().scale = create_vector3(2.0, 2.0, 2.0);
        let n = as_node_ref(&b);
        invalidate_node_local_transform(&n);
        let camera = camera_looking_from(0.0, 0.0, 10.0);
        for _ in 0..3 {
            assert!(orient_billboard_to_camera(&n, &camera, &guard_state()));
        }
        let m = get_node_world_matrix4(&n).m;
        close(m[12], 3.0);
        close(m[13], 0.0);
        close(m[14], 0.0);
        let length = (-3.0f32).hypot(10.0);
        close(m[8] / 2.0, -3.0 / length);
        close(m[9], 0.0);
        close(m[10] / 2.0, 10.0 / length);
        for i in [0, 4, 8] {
            close(m[i].hypot(m[i + 1]).hypot(m[i + 2]), 2.0);
        }
    }
    #[test]
    fn axis_y_yaws_without_tilting_and_screen_aligned_adopts_camera_basis() {
        let axis = as_node_ref(&billboard(BillboardMode::AxisY));
        orient_billboard_to_camera(&axis, &camera_looking_from(10.0, 5.0, 0.0), &guard_state());
        let m = get_node_world_matrix4(&axis).m;
        for (i, value) in [
            (8, 1.0),
            (9, 0.0),
            (10, 0.0),
            (4, 0.0),
            (5, 1.0),
            (6, 0.0),
            (0, 0.0),
            (2, -1.0),
        ] {
            close(m[i], value);
        }
        let b = billboard(BillboardMode::ScreenAligned);
        b.write().unwrap().position = create_vector3(5.0, 3.0, 0.0);
        let b = as_node_ref(&b);
        invalidate_node_local_transform(&b);
        orient_billboard_to_camera(&b, &camera_looking_from(0.0, 0.0, 10.0), &guard_state());
        let m = get_node_world_matrix4(&b).m;
        for i in [0, 5, 10] {
            close(m[i], 1.0);
        }
        close(m[12], 5.0);
        close(m[13], 3.0);
        close(m[14], 0.0);
    }
}
mod orient_scene3d_billboards_to_camera {
    use super::*;
    #[test]
    fn orients_billboards_and_leaves_other_meshes_untouched() {
        let root = as_node_ref(&node3d());
        let mesh = test_mesh();
        mesh.write().unwrap().position.x = 7.0;
        let m = as_node_ref(&mesh);
        invalidate_node_local_transform(&m);
        let b = as_node_ref(&billboard(BillboardMode::Full));
        add_node_child(&root, &m);
        add_node_child(&root, &b);
        assert!(orient_scene3d_billboards_to_camera(
            &root,
            &camera_looking_from(0.0, 0.0, 10.0),
            &guard_state()
        ));
        let matrix = get_node_world_matrix4(&b).m;
        close(matrix[0], 1.0);
        close(matrix[10], 1.0);
        close(get_node_world_matrix4(&m).m[12], 7.0);
    }
    #[test]
    fn compensates_parent_rotation_in_world_space() {
        let parent = node3d();
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(
            &mut q,
            &create_vector3(0.0, 1.0, 0.0),
            std::f32::consts::FRAC_PI_2,
        );
        parent.write().unwrap().rotation = q;
        let p = as_node_ref(&parent);
        invalidate_node_local_transform(&p);
        let b = as_node_ref(&billboard(BillboardMode::Full));
        add_node_child(&p, &b);
        orient_scene3d_billboards_to_camera(
            &p,
            &camera_looking_from(0.0, 0.0, 10.0),
            &guard_state(),
        );
        let m = get_node_world_matrix4(&b).m;
        for i in [0, 5, 10] {
            close(m[i], 1.0);
        }
        for i in [2, 8] {
            close(m[i], 0.0);
        }
    }
}
mod set_billboard_camera_basis_guard {
    use super::*;
    #[test]
    fn notifies_only_on_decline_and_can_be_removed() {
        let state = guard_state();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        set_billboard_camera_basis_guard(
            &state,
            Some(Arc::new(move |camera| {
                sink.lock().unwrap().push(camera.view.read().unwrap().m[0])
            })),
        );
        let b = as_node_ref(&billboard(BillboardMode::Full));
        orient_billboard_to_camera(&b, &singular_camera(), &state);
        orient_billboard_to_camera(&b, &camera_looking_from(0.0, 0.0, 10.0), &state);
        assert_eq!(*seen.lock().unwrap(), vec![0.0]);
        set_billboard_camera_basis_guard(&state, None);
        orient_billboard_to_camera(&b, &singular_camera(), &state);
        assert_eq!(seen.lock().unwrap().len(), 1);
    }
}
