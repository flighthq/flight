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
