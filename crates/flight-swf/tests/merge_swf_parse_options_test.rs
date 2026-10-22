use std::sync::Arc;

use crate::support::create_test_handler;
use flight_compression::{
    CompressionFraming, HostDecompressDeflateCapability, HostDecompressLzmaCapability,
};
use flight_swf::contract::*;

fn deflate() -> HostDecompressDeflateCapability {
    return HostDecompressDeflateCapability {
        decompress: Arc::new(|_, _, _: CompressionFraming| None),
    };
}

fn fragment() -> SwfParseOptions {
    return SwfParseOptions {
        deflate: None,
        lzma: None,
        tags: None,
    };
}

fn lzma() -> HostDecompressLzmaCapability {
    return HostDecompressLzmaCapability {
        decompress: Arc::new(|_, _, _: CompressionFraming| None),
    };
}

mod merge_swf_parse_options {
    use super::*;

    #[test]
    fn always_reports_a_tags_array_even_with_no_fragments() {
        assert_eq!(merge_swf_parse_options(&[]).tags.unwrap().len(), 0);
        let mut option = fragment();
        option.deflate = Some(None);
        assert_eq!(merge_swf_parse_options(&[&option]).tags.unwrap().len(), 0);
    }

    #[test]
    fn concatenates_tags_in_argument_order() {
        let a = create_test_handler(&[1]);
        let b = create_test_handler(&[2]);
        let mut first = fragment();
        first.tags = Some(vec![a.clone()]);
        let mut second = fragment();
        second.tags = Some(vec![b.clone()]);
        let tags = merge_swf_parse_options(&[&first, &second]).tags.unwrap();
        assert_eq!(tags.len(), 2);
        assert!(Arc::ptr_eq(&tags[0], &a));
        assert!(Arc::ptr_eq(&tags[1], &b));
    }

    #[test]
    fn covers_every_declared_field() {
        let option = fragment();
        assert!(option.deflate.is_none());
        assert!(option.lzma.is_none());
        assert!(option.tags.is_none());
    }

    #[test]
    fn distinguishes_an_omitted_capability_from_explicit_null() {
        let mut first = fragment();
        first.deflate = Some(Some(deflate()));
        let mut second = fragment();
        second.deflate = Some(None);
        assert!(
            merge_swf_parse_options(&[&first, &second])
                .deflate
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn does_not_alias_an_input_tag_array() {
        let a = create_test_handler(&[1]);
        let input = vec![a];
        let input_pointer = input.as_ptr();
        let mut option = fragment();
        option.tags = Some(input);
        let merged = merge_swf_parse_options(&[&option]).tags.unwrap();
        assert_ne!(merged.as_ptr(), input_pointer);
    }

    #[test]
    fn keeps_a_duplicate_handler() {
        let a = create_test_handler(&[1]);
        let mut first = fragment();
        first.tags = Some(vec![a.clone()]);
        let mut second = fragment();
        second.tags = Some(vec![a.clone()]);
        let tags = merge_swf_parse_options(&[&first, &second]).tags.unwrap();
        assert_eq!(tags.len(), 2);
        assert!(Arc::ptr_eq(&tags[0], &tags[1]));
    }

    #[test]
    fn leaves_deflate_untouched_when_a_later_fragment_omits_it() {
        let capability = deflate();
        let expected = capability.decompress.clone();
        let mut first = fragment();
        first.deflate = Some(Some(capability));
        let mut second = fragment();
        second.tags = Some(Vec::new());
        let merged = merge_swf_parse_options(&[&first, &second]);
        assert!(Arc::ptr_eq(
            &merged.deflate.unwrap().unwrap().decompress,
            &expected
        ));
    }

    #[test]
    fn leaves_lzma_untouched_when_a_later_fragment_omits_it() {
        let capability = lzma();
        let expected = capability.decompress.clone();
        let mut first = fragment();
        first.lzma = Some(Some(capability));
        let mut second = fragment();
        second.tags = Some(Vec::new());
        let merged = merge_swf_parse_options(&[&first, &second]);
        assert!(Arc::ptr_eq(
            &merged.lzma.unwrap().unwrap().decompress,
            &expected
        ));
    }

    #[test]
    fn omits_deflate_when_no_fragment_states_it() {
        assert!(merge_swf_parse_options(&[&fragment()]).deflate.is_none());
    }

    #[test]
    fn omits_lzma_when_no_fragment_states_it() {
        assert!(merge_swf_parse_options(&[&fragment()]).lzma.is_none());
    }

    #[test]
    fn takes_the_last_stated_deflate() {
        let first_capability = deflate();
        let second_capability = deflate();
        let expected = second_capability.decompress.clone();
        let mut first = fragment();
        first.deflate = Some(Some(first_capability));
        let mut second = fragment();
        second.deflate = Some(Some(second_capability));
        assert!(Arc::ptr_eq(
            &merge_swf_parse_options(&[&first, &second])
                .deflate
                .unwrap()
                .unwrap()
                .decompress,
            &expected
        ));
    }

    #[test]
    fn takes_the_last_stated_lzma() {
        let first_capability = lzma();
        let second_capability = lzma();
        let expected = second_capability.decompress.clone();
        let mut first = fragment();
        first.lzma = Some(Some(first_capability));
        let mut second = fragment();
        second.lzma = Some(Some(second_capability));
        assert!(Arc::ptr_eq(
            &merge_swf_parse_options(&[&first, &second])
                .lzma
                .unwrap()
                .unwrap()
                .decompress,
            &expected
        ));
    }
}
