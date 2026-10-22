use crate::support::*;
use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_swf::*;

mod collect_swf_content_capabilities {
    use super::*;

    #[test]
    fn counts_each_distinct_tag_code() {
        let shape = create_minimal_shape_body();
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(TAG_SET_BACKGROUND_COLOR, &[0xff; 3]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let result =
            collect_swf_content_capabilities(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap();
        assert_eq!(result.tag_counts.get(&TAG_DEFINE_SHAPE), Some(&2));
        assert_eq!(result.tag_counts.get(&TAG_SET_BACKGROUND_COLOR), Some(&1));
    }

    #[test]
    fn detects_bitmap_fills_from_bitmap_character_tags() {
        let source = create_swf(
            &[
                create_tag(21, &[1, 0, 0xff, 0xd8]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(
            collect_swf_content_capabilities(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap()
                .uses_bitmap_fills
        );
    }

    #[test]
    fn detects_blend_mode_from_place_object3_extended_flags() {
        let source = create_swf(
            &[create_tag(70, &[0, 2, 1, 0]), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let result =
            collect_swf_content_capabilities(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap();
        assert!(result.uses_blend_mode);
        assert!(!result.uses_filters);
    }

    #[test]
    fn detects_blend_mode_from_place_object4() {
        let source = create_swf(
            &[create_tag(94, &[0, 2, 1, 0]), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(
            collect_swf_content_capabilities(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap()
                .uses_blend_mode
        );
    }

    #[test]
    fn detects_filters_from_place_object3_extended_flags() {
        let source = create_swf(
            &[create_tag(70, &[0, 1, 1, 0]), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let result =
            collect_swf_content_capabilities(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap();
        assert!(result.uses_filters);
        assert!(!result.uses_blend_mode);
    }

    #[test]
    fn ignores_place_object3_bodies_shorter_than_two_bytes() {
        let source = create_swf(
            &[create_tag(70, &[0]), create_tag(TAG_END, &[])],
            24.0,
            [0, 2000, 0, 1000],
        );
        let result =
            collect_swf_content_capabilities(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap();
        assert!(!result.uses_blend_mode);
        assert!(!result.uses_filters);
    }

    #[test]
    fn reports_no_capabilities_when_no_relevant_tags_are_present() {
        let source = create_swf(
            &[
                create_tag(TAG_SET_BACKGROUND_COLOR, &[0xff; 3]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let result =
            collect_swf_content_capabilities(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap();
        assert!(!result.uses_blend_mode);
        assert!(!result.uses_filters);
        assert!(!result.uses_bitmap_fills);
    }

    #[test]
    fn returns_none_for_unreadable_input() {
        assert!(
            collect_swf_content_capabilities(
                &bytes_ref(Vec::new()),
                Some(&SDK_HOST_DECOMPRESS_DEFLATE),
                None
            )
            .is_none()
        );
    }
}
