use super::awd2_test_helper::handler;
use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_scene3d_formats::*;
use std::sync::Arc;

fn fragment() -> Awd2ParseOptionsFragment {
    return Awd2ParseOptionsFragment {
        blocks: None,
        deflate: None,
        lzma: None,
    };
}

mod merge_awd2_parse_options {
    use super::*;

    #[test]
    fn concatenates_all_fragments_in_order_preserves_duplicates_and_allocates_a_new_result_array() {
        let a = handler(vec![1]);
        let b = handler(vec![2]);
        let c = handler(vec![3]);
        let d = handler(vec![4]);
        let fragments = [
            Awd2ParseOptionsFragment {
                blocks: Some(vec![a.clone(), b.clone()]),
                ..fragment()
            },
            fragment(),
            Awd2ParseOptionsFragment {
                blocks: Some(Vec::new()),
                ..fragment()
            },
            Awd2ParseOptionsFragment {
                blocks: Some(vec![c.clone(), d.clone()]),
                ..fragment()
            },
            Awd2ParseOptionsFragment {
                blocks: Some(vec![a.clone()]),
                ..fragment()
            },
        ];
        let merged = {
            let mut output = Awd2ParseOptions {
                blocks: Vec::new(),
                deflate: None,
                lzma: None,
            };
            merge_awd2_parse_options(&mut output, &fragments);
            output
        };
        assert_eq!(merged.blocks.len(), 5);
        for (actual, expected) in merged.blocks.iter().zip([&a, &b, &c, &d, &a]) {
            assert!(Arc::ptr_eq(actual, expected));
        }
        assert_ne!(
            merged.blocks.as_ptr(),
            fragments[0].blocks.as_ref().unwrap().as_ptr()
        );
        let reverse = {
            let mut output = Awd2ParseOptions {
                blocks: Vec::new(),
                deflate: None,
                lzma: None,
            };
            merge_awd2_parse_options(
                &mut output,
                &[
                    Awd2ParseOptionsFragment {
                        blocks: Some(vec![b.clone()]),
                        ..fragment()
                    },
                    Awd2ParseOptionsFragment {
                        blocks: Some(vec![a]),
                        ..fragment()
                    },
                ],
            );
            output
        };
        assert!(Arc::ptr_eq(&reverse.blocks[0], &b));
        let merged = {
            let mut output = Awd2ParseOptions {
                blocks: Vec::new(),
                deflate: None,
                lzma: None,
            };
            merge_awd2_parse_options(&mut output, &[]);
            output
        };
        assert!(merged.blocks.is_empty());
        assert!(merged.deflate.is_none());
        assert!(merged.lzma.is_none());
    }

    #[test]
    fn distinguishes_omitted_and_explicit_null_capabilities_and_keeps_the_last_stated_original_callback_for_both_fields()
     {
        for field in ["deflate", "lzma"] {
            let callback: flight_compression::Decompressor = Arc::new(|_, _, _| None);
            let first_deflate = Arc::new(HostDecompressDeflateCapability {
                decompress: callback.clone(),
            });
            let second_deflate = Arc::new(HostDecompressDeflateCapability {
                decompress: callback.clone(),
            });
            let first_lzma = Arc::new(HostDecompressLzmaCapability {
                decompress: callback.clone(),
            });
            let second_lzma = Arc::new(HostDecompressLzmaCapability {
                decompress: callback,
            });
            let mut a = fragment();
            let mut b = fragment();
            let mut null = fragment();
            if field == "deflate" {
                a.deflate = Some(Some(first_deflate.clone()));
                b.deflate = Some(Some(second_deflate.clone()));
                null.deflate = Some(None);
            } else {
                a.lzma = Some(Some(first_lzma.clone()));
                b.lzma = Some(Some(second_lzma.clone()));
                null.lzma = Some(None);
            }
            let merged = {
                let mut output = Awd2ParseOptions {
                    blocks: Vec::new(),
                    deflate: None,
                    lzma: None,
                };
                merge_awd2_parse_options(&mut output, &[a, b, fragment()]);
                output
            };
            if field == "deflate" {
                let actual = merged.deflate.as_ref().unwrap().as_ref().unwrap();
                assert!(Arc::ptr_eq(actual, &second_deflate));
                assert!(!Arc::ptr_eq(actual, &first_deflate));
            } else {
                let actual = merged.lzma.as_ref().unwrap().as_ref().unwrap();
                assert!(Arc::ptr_eq(actual, &second_lzma));
                assert!(!Arc::ptr_eq(actual, &first_lzma));
            }
            let nullable = {
                let mut output = Awd2ParseOptions {
                    blocks: Vec::new(),
                    deflate: None,
                    lzma: None,
                };
                merge_awd2_parse_options(&mut output, &[null, fragment()]);
                output
            };
            assert!(if field == "deflate" {
                nullable.deflate.unwrap().is_none()
            } else {
                nullable.lzma.unwrap().is_none()
            });
            let omitted = {
                let mut output = Awd2ParseOptions {
                    blocks: Vec::new(),
                    deflate: None,
                    lzma: None,
                };
                merge_awd2_parse_options(&mut output, &[fragment()]);
                output
            };
            assert!(omitted.deflate.is_none());
            assert!(omitted.lzma.is_none());
        }
    }
    #[test]
    fn snapshots_retained_input_fields_before_clearing_the_output_and_reuses_its_blocks_buffer() {
        let original = handler(vec![42]);
        let capability = Arc::new(HostDecompressDeflateCapability {
            decompress: Arc::new(|_, _, _| None),
        });
        let mut out = Awd2ParseOptions {
            blocks: Vec::with_capacity(16),
            deflate: Some(Some(capability.clone())),
            lzma: Some(None),
        };
        out.blocks.push(original.clone());
        let source = Awd2ParseOptionsFragment {
            blocks: Some(out.blocks.clone()),
            deflate: out.deflate.clone(),
            lzma: out.lzma.clone(),
        };
        let pointer = out.blocks.as_ptr();
        let capacity = out.blocks.capacity();
        merge_awd2_parse_options(&mut out, &[source, fragment()]);
        assert_eq!(out.blocks.len(), 1);
        assert!(Arc::ptr_eq(&out.blocks[0], &original));
        assert!(Arc::ptr_eq(
            out.deflate.as_ref().unwrap().as_ref().unwrap(),
            &capability
        ));
        assert!(out.lzma.as_ref().unwrap().is_none());
        assert_eq!(out.blocks.as_ptr(), pointer);
        assert_eq!(out.blocks.capacity(), capacity);
        merge_awd2_parse_options(&mut out, &[]);
        assert!(out.blocks.is_empty());
        assert!(out.deflate.is_none());
        assert!(out.lzma.is_none());
        assert_eq!(out.blocks.as_ptr(), pointer);
        assert_eq!(out.blocks.capacity(), capacity);
    }
}
