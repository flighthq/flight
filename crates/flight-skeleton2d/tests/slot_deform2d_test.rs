use flight_skeleton2d::contract::*;

use crate::support::*;

fn slot_with(attachment: Attachment2DRef) -> Slot2D {
    let mut value = slot(0);
    value.attachment = Some(attachment);
    return value;
}

mod get_skeleton_2d_slot_deform_offsets {
    use super::*;

    #[test]
    fn returns_offsets_authored_for_the_attachment_now_shown() {
        let shown = region_ref(region(1.0, 1.0));
        let mut value = slot_with(shown.clone());
        set_skeleton_2d_slot_deform(&mut value, Some(shown), Some(&[1.0, 2.0]));
        assert_eq!(
            get_skeleton_2d_slot_deform_offsets(&value),
            Some(&[1.0f32, 2.0][..])
        );
    }

    #[test]
    fn returns_none_after_a_swap_to_an_equal_size_attachment() {
        let authored = region_ref(region(1.0, 1.0));
        let replacement = region_ref(region(1.0, 1.0));
        let mut value = slot_with(authored.clone());
        set_skeleton_2d_slot_deform(&mut value, Some(authored), Some(&[1.0, 2.0]));
        value.attachment = Some(replacement);
        assert!(get_skeleton_2d_slot_deform_offsets(&value).is_none());
    }

    #[test]
    fn returns_none_when_the_slot_shows_nothing() {
        let authored = region_ref(region(1.0, 1.0));
        let mut value = slot_with(authored.clone());
        set_skeleton_2d_slot_deform(&mut value, Some(authored), Some(&[1.0, 2.0]));
        value.attachment = None;
        assert!(get_skeleton_2d_slot_deform_offsets(&value).is_none());
    }

    #[test]
    fn matches_a_deform_authored_for_the_empty_slot() {
        let mut value = slot_with(region_ref(region(1.0, 1.0)));
        set_skeleton_2d_slot_deform(&mut value, None, Some(&[3.0, 4.0]));
        value.attachment = None;
        assert_eq!(
            get_skeleton_2d_slot_deform_offsets(&value),
            Some(&[3.0f32, 4.0][..])
        );
    }

    #[test]
    fn returns_none_for_a_slot_with_no_deform() {
        assert!(
            get_skeleton_2d_slot_deform_offsets(&slot_with(region_ref(region(1.0, 1.0)))).is_none()
        );
    }
}

mod set_skeleton_2d_slot_deform {
    use super::*;

    #[test]
    fn reuses_the_buffer_when_the_length_is_unchanged() {
        let attachment = region_ref(region(1.0, 1.0));
        let mut value = slot_with(attachment.clone());
        set_skeleton_2d_slot_deform(&mut value, Some(attachment.clone()), Some(&[1.0, 2.0]));
        let first = value.deform.as_ref().unwrap().offsets.as_ptr();
        set_skeleton_2d_slot_deform(&mut value, Some(attachment), Some(&[3.0, 4.0]));
        assert_eq!(value.deform.as_ref().unwrap().offsets.as_ptr(), first);
        assert_eq!(
            get_skeleton_2d_slot_deform_offsets(&value),
            Some(&[3.0f32, 4.0][..])
        );
    }

    #[test]
    fn reallocates_when_the_length_changes() {
        let attachment = region_ref(region(1.0, 1.0));
        let mut value = slot_with(attachment.clone());
        set_skeleton_2d_slot_deform(&mut value, Some(attachment.clone()), Some(&[1.0, 2.0]));
        set_skeleton_2d_slot_deform(&mut value, Some(attachment), Some(&[1.0, 2.0, 3.0, 4.0]));
        assert_eq!(value.deform.as_ref().unwrap().offsets.len(), 4);
    }

    #[test]
    fn copies_rather_than_aliasing_the_caller_buffer() {
        let attachment = region_ref(region(1.0, 1.0));
        let mut value = slot_with(attachment.clone());
        let mut scratch = [1.0f32, 2.0];
        set_skeleton_2d_slot_deform(&mut value, Some(attachment), Some(&scratch));
        scratch[0] = 9.0;
        let _ = scratch;
        assert_eq!(
            get_skeleton_2d_slot_deform_offsets(&value),
            Some(&[1.0f32, 2.0][..])
        );
    }

    #[test]
    fn clears_the_slot_deform_when_given_none() {
        let attachment = region_ref(region(1.0, 1.0));
        let mut value = slot_with(attachment.clone());
        set_skeleton_2d_slot_deform(&mut value, Some(attachment), Some(&[1.0, 2.0]));
        assert!(set_skeleton_2d_slot_deform(&mut value, None, None).is_none());
        assert!(value.deform.is_none());
    }
}

mod source_slot_deform_parity {
    use super::*;

    #[test]
    fn swap_to_a_smaller_attachment_returns_none() {
        let authored = region_ref(region(4.0, 4.0));
        let replacement = region_ref(region(2.0, 2.0));
        let mut value = slot_with(authored.clone());
        set_skeleton_2d_slot_deform(&mut value, Some(authored), Some(&[7.0; 8]));
        value.attachment = Some(replacement);
        assert!(get_skeleton_2d_slot_deform_offsets(&value).is_none());
    }

    #[test]
    fn swap_to_a_larger_attachment_returns_none() {
        let authored = region_ref(region(2.0, 2.0));
        let replacement = region_ref(region(4.0, 4.0));
        let mut value = slot_with(authored.clone());
        set_skeleton_2d_slot_deform(&mut value, Some(authored), Some(&[1.0; 4]));
        value.attachment = Some(replacement);
        assert!(get_skeleton_2d_slot_deform_offsets(&value).is_none());
    }

    #[test]
    fn authored_offsets_for_the_empty_slot_remain_visible_after_clearing_art() {
        let mut value = slot_with(region_ref(region(1.0, 1.0)));
        set_skeleton_2d_slot_deform(&mut value, None, Some(&[5.0, 5.0]));
        value.attachment = None;
        assert_eq!(
            get_skeleton_2d_slot_deform_offsets(&value),
            Some(&[5.0f32, 5.0][..])
        );
    }
}
