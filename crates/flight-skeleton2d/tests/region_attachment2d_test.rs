use flight_skeleton2d::contract::*;

use crate::support::*;

mod compute_skeleton_2d_region_attachment_vertices {
    use super::*;

    fn translated_skeleton(x: f32, y: f32, rotation: f32) -> Skeleton2D {
        let mut root = bone();
        root.x = x;
        root.y = y;
        root.rotation = rotation;
        let mut value = skeleton(vec![root], None);
        compute_skeleton_2d_world_transforms(&mut value);
        return value;
    }

    #[test]
    fn offsets_a_region_rect_by_the_bone_translation() {
        let attachment = region(4.0, 2.0);
        let mut out = [0.0f32; 8];
        compute_skeleton_2d_region_attachment_vertices(
            &mut out,
            &attachment,
            &translated_skeleton(10.0, 20.0, 0.0),
            0,
        );
        assert_eq!(vertex_at(&out, 0), (8.0, 19.0));
        assert_eq!(vertex_at(&out, 1), (8.0, 21.0));
        assert_eq!(vertex_at(&out, 2), (12.0, 21.0));
        assert_eq!(vertex_at(&out, 3), (12.0, 19.0));
    }

    #[test]
    fn rotates_the_region_rect_through_a_ninety_degree_bone() {
        let attachment = region(4.0, 2.0);
        let mut out = [0.0f32; 8];
        compute_skeleton_2d_region_attachment_vertices(
            &mut out,
            &attachment,
            &translated_skeleton(0.0, 0.0, 90.0),
            0,
        );
        assert!(close(out[0], 1.0) && close(out[1], -2.0));
        assert!(close(out[2], -1.0) && close(out[3], -2.0));
    }

    #[test]
    fn applies_the_region_local_offset_and_scale_on_top_of_the_bone() {
        let mut attachment = region(2.0, 2.0);
        attachment.x = 5.0;
        attachment.scale_x = 2.0;
        let mut out = [0.0f32; 8];
        compute_skeleton_2d_region_attachment_vertices(
            &mut out,
            &attachment,
            &translated_skeleton(0.0, 0.0, 0.0),
            0,
        );
        assert!(close(out[0], 3.0) && close(out[1], -1.0));
        assert!(close(out[4], 7.0) && close(out[5], 1.0));
    }

    #[test]
    fn leaves_out_untouched_for_a_bone_index_outside_the_buffer() {
        let attachment = region(2.0, 2.0);
        let mut out = [7.0f32; 8];
        compute_skeleton_2d_region_attachment_vertices(
            &mut out,
            &attachment,
            &translated_skeleton(0.0, 0.0, 0.0),
            4,
        );
        assert_eq!(out, [7.0f32; 8]);
    }
}
