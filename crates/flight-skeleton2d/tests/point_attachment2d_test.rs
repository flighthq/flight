use flight_geometry::create_vector2;
use flight_skeleton2d::contract::*;

use crate::support::*;

mod compute_skeleton_2d_point_attachment_position {
    use super::*;

    fn point(x: f32, y: f32, rotation: f32) -> PointAttachment2D {
        let mut out: PointAttachment2D = flight_entity::allocate_entity();
        out.kind = String::from(POINT_ATTACHMENT_2D_KIND);
        out.x = x;
        out.y = y;
        out.rotation = rotation;
        return out;
    }

    fn rig(x: f32, y: f32, rotation: f32, scale_x: f32, scale_y: f32) -> Skeleton2D {
        let mut root = bone();
        root.x = x;
        root.y = y;
        root.rotation = rotation;
        root.scale_x = scale_x;
        root.scale_y = scale_y;
        let mut value = skeleton(vec![root], None);
        compute_skeleton_2d_world_transforms(&mut value);
        return value;
    }

    #[test]
    fn carries_the_local_offset_through_the_bone_world_transform() {
        let mut out = create_vector2(0.0, 0.0);
        compute_skeleton_2d_point_attachment_position(
            &mut out,
            &point(2.0, 3.0, 0.0),
            &rig(10.0, 20.0, 0.0, 1.0, 1.0),
            0,
        );
        assert!(close(out.x, 12.0) && close(out.y, 23.0));
    }

    #[test]
    fn leaves_out_untouched_for_an_out_of_range_bone() {
        let mut out = create_vector2(7.0, 8.0);
        compute_skeleton_2d_point_attachment_position(
            &mut out,
            &point(2.0, 3.0, 0.0),
            &rig(0.0, 0.0, 0.0, 1.0, 1.0),
            5,
        );
        assert!(close(out.x, 7.0) && close(out.y, 8.0));
    }
}

mod compute_skeleton_2d_point_attachment_rotation {
    use super::*;

    fn point(rotation: f32) -> PointAttachment2D {
        let mut out: PointAttachment2D = flight_entity::allocate_entity();
        out.rotation = rotation;
        return out;
    }

    fn rig(rotation: f32, scale_x: f32, scale_y: f32) -> Skeleton2D {
        let mut root = bone();
        root.rotation = rotation;
        root.scale_x = scale_x;
        root.scale_y = scale_y;
        let mut value = skeleton(vec![root], None);
        compute_skeleton_2d_world_transforms(&mut value);
        return value;
    }

    #[test]
    fn follows_the_bone_axis_rather_than_its_rotation_angle() {
        let value = rig(30.0, 2.0, 1.0);
        let result = compute_skeleton_2d_point_attachment_rotation(&point(0.0), &value, 0);
        assert!(close(result, 30.0));
    }

    #[test]
    fn returns_the_local_rotation_for_an_out_of_range_bone() {
        assert!(close(
            compute_skeleton_2d_point_attachment_rotation(&point(45.0), &rig(0.0, 1.0, 1.0), 9),
            45.0
        ));
    }
}

mod source_point_parity {
    use super::*;

    fn rig_value(rotation: f32, scale_x: f32, scale_y: f32) -> Skeleton2D {
        let mut root = bone();
        root.x = if rotation == 90.0 { 5.0 } else { 0.0 };
        root.rotation = rotation;
        root.scale_x = scale_x;
        root.scale_y = scale_y;
        let mut value = skeleton(vec![root], None);
        compute_skeleton_2d_world_transforms(&mut value);
        return value;
    }

    #[test]
    fn carries_a_local_offset_through_the_rotated_bone() {
        let mut out = create_vector2(0.0, 0.0);
        compute_skeleton_2d_point_attachment_position(
            &mut out,
            &point_attachment(3.0, 0.0, 0.0),
            &rig_value(90.0, 1.0, 1.0),
            0,
        );
        assert!(close(out.x, 5.0));
        assert!(close(out.y, 3.0));
    }

    #[test]
    fn out_of_range_position_keeps_the_marker_values() {
        let mut out = create_vector2(-1.0, -1.0);
        compute_skeleton_2d_point_attachment_position(
            &mut out,
            &point_attachment(3.0, 0.0, 0.0),
            &rig_value(0.0, 1.0, 1.0),
            9,
        );
        assert!(close(out.x, -1.0) && close(out.y, -1.0));
    }

    #[test]
    fn adds_the_bone_world_rotation_to_the_local_rotation() {
        let result = compute_skeleton_2d_point_attachment_rotation(
            &point_attachment(0.0, 0.0, 30.0),
            &rig_value(90.0, 1.0, 1.0),
            0,
        );
        assert!(close(result, 120.0), "rotation {result}");
    }

    #[test]
    fn non_uniform_scale_turns_the_world_axis_not_the_angle_sum() {
        let result = compute_skeleton_2d_point_attachment_rotation(
            &point_attachment(0.0, 0.0, 45.0),
            &rig_value(0.0, 1.0, 4.0),
            0,
        );
        let expected = (4.0f32).atan2(1.0).to_degrees();
        assert!(
            close(result, expected),
            "rotation {result} expected {expected}"
        );
        assert!(!close(result, 45.0));
    }

    fn point_attachment(x: f32, y: f32, rotation: f32) -> PointAttachment2D {
        let mut out: PointAttachment2D = flight_entity::allocate_entity();
        out.kind = String::from(POINT_ATTACHMENT_2D_KIND);
        out.x = x;
        out.y = y;
        out.rotation = rotation;
        return out;
    }
}
