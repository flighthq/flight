use flight_skeleton2d::contract::*;

use crate::support::*;

fn clip(end_slot_index: i32) -> ClippingAttachment2D {
    let mut out: ClippingAttachment2D = flight_entity::allocate_entity();
    out.kind = String::from(CLIPPING_ATTACHMENT_2D_KIND);
    out.end_slot_index = end_slot_index;
    out.vertices = Some(vec![0.0, 0.0]);
    out.point_count = 1;
    return out;
}

mod compute_skeleton_2d_clipping_attachment_vertices {
    use super::*;

    #[test]
    fn carries_the_polygon_through_the_slot_bone() {
        let mut root = bone();
        root.x = 4.0;
        let mut value = skeleton(vec![root], None);
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = [0.0f32; 2];
        compute_skeleton_2d_clipping_attachment_vertices(
            &mut out,
            &clip(1),
            &value,
            0,
            None,
            &empty_guards(),
        );
        assert_eq!(out, [4.0, 0.0]);
    }
}

mod get_skeleton_2d_clipping_attachment_slot_range {
    use super::*;

    #[test]
    fn starts_after_the_clipping_slot_and_ends_one_past_the_inclusive_end() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(4), 1, 8);
        assert_eq!((range.start, range.end), (2, 5));
    }

    #[test]
    fn runs_to_the_end_for_minus_one() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(-1), 1, 8);
        assert_eq!((range.start, range.end), (2, 8));
    }

    #[test]
    fn clamps_an_end_past_the_slot_array() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(20), 1, 8);
        assert_eq!((range.start, range.end), (2, 8));
    }

    #[test]
    fn returns_an_empty_range_for_a_last_clipping_slot() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(7), 7, 8);
        assert_eq!(range.start, range.end);
    }
}

mod source_clipping_parity {
    use super::*;

    fn polygon(end_slot_index: i32, vertices: Vec<f32>) -> ClippingAttachment2D {
        let mut out: ClippingAttachment2D = flight_entity::allocate_entity();
        out.kind = String::from(CLIPPING_ATTACHMENT_2D_KIND);
        out.end_slot_index = end_slot_index;
        out.point_count = vertices.len() / 2;
        out.vertices = Some(vertices);
        return out;
    }

    #[test]
    fn carries_the_whole_polygon_through_the_slot_bone_transform() {
        let mut root = bone();
        root.x = 4.0;
        let mut value = skeleton(vec![root], None);
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = [0.0f32; 4];
        compute_skeleton_2d_clipping_attachment_vertices(
            &mut out,
            &polygon(-1, vec![0.0, 0.0, 2.0, 2.0]),
            &value,
            0,
            None,
            &empty_guards(),
        );
        assert!(close(out[0], 4.0));
        assert!(close(out[2], 6.0));
        assert!(close(out[3], 2.0));
    }

    #[test]
    fn range_starts_after_the_clipping_slot_and_ends_one_past_the_inclusive_end() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(4), 1, 10);
        assert_eq!((range.start, range.end), (2, 5));
    }

    #[test]
    fn range_runs_to_the_end_for_minus_one() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(-1), 3, 10);
        assert_eq!((range.start, range.end), (4, 10));
    }

    #[test]
    fn range_runs_to_the_end_when_the_declared_end_is_at_or_before_the_clipping_slot() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(2), 5, 10);
        assert_eq!((range.start, range.end), (6, 10));
    }

    #[test]
    fn range_clamps_an_end_past_the_slot_array() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(99), 0, 4);
        assert_eq!((range.start, range.end), (1, 4));
    }

    #[test]
    fn range_is_empty_when_the_clipping_slot_is_last() {
        let range = get_skeleton_2d_clipping_attachment_slot_range(&clip(-1), 3, 4);
        assert_eq!(range.end, range.start);
    }
}
