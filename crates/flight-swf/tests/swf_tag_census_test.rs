use crate::support::*;
use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_swf::contract::*;

mod collect_swf_tag_counts {
    use super::*;

    #[test]
    fn counts_multiple_occurrences_of_the_same_tag() {
        let shape = create_minimal_shape_body();
        let source = create_swf(
            &[
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(TAG_DEFINE_SHAPE, &shape),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert_eq!(
            collect_swf_tag_counts(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap()
                .get(&TAG_DEFINE_SHAPE),
            Some(&2)
        );
    }

    #[test]
    fn rejects_truncated_tag_records() {
        let truncated_header = create_swf(
            &[create_tag(TAG_SHOW_FRAME, &[]), vec![0xff]],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert!(
            collect_swf_tag_counts(&truncated_header, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .is_none()
        );
        let declared = join_bytes(&[
            &uint16(((TAG_DEFINE_SHAPE << 6) | 0x3f) as u16),
            &uint32(64),
            &vec![0; 63],
        ]);
        let truncated_body = create_swf(&[declared], 24.0, [0, 2000, 0, 1000]);
        assert!(
            collect_swf_tag_counts(&truncated_body, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .is_none()
        );
        let huge = join_bytes(&[
            &uint16(((TAG_DEFINE_SHAPE << 6) | 0x3f) as u16),
            &uint32(0x80000000),
        ]);
        let huge = create_swf(&[huge], 24.0, [0, 2000, 0, 1000]);
        assert!(collect_swf_tag_counts(&huge, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None).is_none());
    }

    #[test]
    fn returns_none_for_input_that_is_not_a_readable_swf() {
        assert!(
            collect_swf_tag_counts(
                &bytes_ref(Vec::new()),
                Some(&SDK_HOST_DECOMPRESS_DEFLATE),
                None
            )
            .is_none()
        );
    }

    #[test]
    fn skips_short_and_extended_tag_bodies_without_parsing_payloads() {
        let source = create_swf(
            &[
                create_tag(TAG_PROTECT, &[0xff]),
                create_tag(TAG_DEFINE_SHAPE, &vec![0xff; 63]),
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        let counts =
            collect_swf_tag_counts(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None).unwrap();
        assert_eq!(counts.get(&TAG_SHOW_FRAME), Some(&1));
        assert_eq!(counts.get(&TAG_DEFINE_SHAPE), Some(&1));
        assert_eq!(counts.get(&TAG_PROTECT), Some(&1));
    }

    #[test]
    fn stops_before_end_and_every_tag_after_it() {
        let source = create_swf(
            &[
                create_tag(TAG_SHOW_FRAME, &[]),
                create_tag(TAG_END, &[]),
                create_tag(TAG_SHOW_FRAME, &[]),
            ],
            24.0,
            [0, 2000, 0, 1000],
        );
        assert_eq!(
            collect_swf_tag_counts(&source, Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap()
                .get(&TAG_SHOW_FRAME),
            Some(&1)
        );
    }

    #[test]
    fn uses_the_declared_file_length_as_the_stream_boundary() {
        let declared = create_swf(&[create_tag(TAG_SHOW_FRAME, &[])], 24.0, [0, 2000, 0, 1000]);
        let declared_bytes = declared.read().unwrap();
        let joined = join_bytes(&[
            &declared_bytes,
            &create_tag(TAG_SET_BACKGROUND_COLOR, &[1, 2, 3]),
        ]);
        drop(declared_bytes);
        let counts =
            collect_swf_tag_counts(&bytes_ref(joined), Some(&SDK_HOST_DECOMPRESS_DEFLATE), None)
                .unwrap();
        assert_eq!(counts.len(), 1);
        assert_eq!(counts.get(&TAG_SHOW_FRAME), Some(&1));
    }
}

mod get_swf_tag_name {
    use super::*;

    #[test]
    fn labels_an_unnamed_code_stably() {
        assert_eq!(get_swf_tag_name(TAG_UNKNOWN), "Unknown(100)");
    }

    #[test]
    fn names_a_known_tag_code() {
        assert_eq!(
            get_swf_tag_name(TAG_SET_BACKGROUND_COLOR),
            "SetBackgroundColor"
        );
        assert_eq!(get_swf_tag_name(TAG_PROTECT), "Protect");
    }
}
