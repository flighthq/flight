use std::sync::{Arc, Mutex};

use crate::support::font_options;
use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    equals_array_buffer, get_array_buffer_storage,
};
use flight_compression::{Compression, CompressionFraming, Decompressor};
use flight_font_formats::*;

fn identity() -> Decompressor {
    return Arc::new(|compressed, _, framing| {
        assert_eq!(framing, CompressionFraming::Raw);
        return Some(compressed.to_vec().into_boxed_slice());
    });
}
fn byte_view(bytes: Vec<u8>) -> ArrayBufferView {
    let length = bytes.len();
    let buffer = create_array_buffer_from_bytes(bytes.into_boxed_slice());
    return create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array).unwrap();
}
fn view_bytes(view: &ArrayBufferView) -> Vec<u8> {
    let storage = get_array_buffer_storage(&view.buffer);
    let guard = storage.read().unwrap();
    return guard[view.byte_offset..view.byte_offset + view.byte_length].to_vec();
}

mod read_woff2_font {
    use super::*;
    #[test]
    fn validates_reverser_outputs_before_retaining_them_for_assembly() {
        let sfnt = assemble_sfnt_font(
            0x10000,
            &[SfntFontTable {
                data: vec![1, 2].into_boxed_slice(),
                tag: pack_sfnt_tag("glyf"),
            }],
        );
        let wrapped = encode_synthetic_woff2(&sfnt, Some(&["glyf".to_string()]));
        let reverse: Woff2TransformReverser = Arc::new(|_, transformed, _| {
            let mut invalid = transformed.clone();
            invalid.kind = ArrayBufferViewKind::DataView;
            return Some(invalid);
        });
        let thrown = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            read_woff2_font(&wrapped, Some(&identity()), Some(&reverse))
        }))
        .unwrap_err();
        assert_eq!(
            thrown
                .downcast::<flight_entity::FlightError>()
                .unwrap()
                .kind,
            flight_entity::FlightErrorKind::TypeError
        );
    }
    #[test]
    fn rebuilds_the_same_table_names() {
        let original = create_synthetic_font(None);
        let rebuilt = read_woff2_font(
            &encode_synthetic_woff2(&original, None),
            Some(&identity()),
            None,
        )
        .unwrap();
        assert_eq!(
            read_sfnt_table_directory(&rebuilt).unwrap().table_order,
            read_sfnt_table_directory(&original).unwrap().table_order
        );
    }
    #[test]
    fn preserves_each_table_byte_for_byte() {
        let original = create_synthetic_font(None);
        let rebuilt = read_woff2_font(
            &encode_synthetic_woff2(&original, None),
            Some(&identity()),
            None,
        )
        .unwrap();
        let before = read_sfnt_table_directory(&original).unwrap();
        let after = read_sfnt_table_directory(&rebuilt).unwrap();
        for tag in &before.table_order {
            let a = before.tables.get(tag).unwrap();
            let b = after.tables.get(tag).unwrap();
            assert_eq!(
                &original[a.offset..a.offset + a.length],
                &rebuilt[b.offset..b.offset + b.length]
            );
        }
    }
    #[test]
    fn carries_the_original_container_flavor() {
        let original = create_synthetic_font(Some(&SyntheticFontOptions {
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..font_options()
        }));
        let rebuilt = read_woff2_font(
            &encode_synthetic_woff2(&original, None),
            Some(&identity()),
            None,
        )
        .unwrap();
        assert_eq!(&rebuilt[..4], b"OTTO");
    }
    #[test]
    fn returns_null_without_a_decompressor() {
        assert!(
            read_woff2_font(
                &encode_synthetic_woff2(&create_synthetic_font(None), None),
                None,
                None
            )
            .is_none()
        );
    }
    #[test]
    fn returns_null_for_transforms_without_a_reverser() {
        let wrapped =
            encode_synthetic_woff2(&create_synthetic_font(None), Some(&["glyf".to_string()]));
        assert!(read_woff2_font(&wrapped, Some(&identity()), None).is_none());
    }
    #[test]
    fn passes_transformed_tables_to_the_supplied_reverser_and_uses_its_return() {
        let replacement = byte_view(vec![1, 2, 3, 4]);
        let retained = replacement.clone();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::clone(&seen);
        let reverse: Woff2TransformReverser = Arc::new(move |tag, _, _| {
            observed.lock().unwrap().push(tag.to_string());
            return Some(retained.clone());
        });
        let wrapped =
            encode_synthetic_woff2(&create_synthetic_font(None), Some(&["glyf".to_string()]));
        let rebuilt = read_woff2_font(&wrapped, Some(&identity()), Some(&reverse)).unwrap();
        assert_eq!(*seen.lock().unwrap(), ["glyf"]);
        let glyf = read_sfnt_table_directory(&rebuilt)
            .unwrap()
            .tables
            .get("glyf")
            .unwrap()
            .clone();
        assert_eq!(
            &rebuilt[glyf.offset..glyf.offset + glyf.length],
            &[1, 2, 3, 4]
        );
    }
    #[test]
    fn returns_null_when_a_transform_declines() {
        let wrapped =
            encode_synthetic_woff2(&create_synthetic_font(None), Some(&["glyf".to_string()]));
        let reverse: Woff2TransformReverser = Arc::new(|_, _, _| None);
        assert!(read_woff2_font(&wrapped, Some(&identity()), Some(&reverse)).is_none());
    }
    #[test]
    fn returns_null_for_truncated_containers() {
        let wrapped = encode_synthetic_woff2(&create_synthetic_font(None), None);
        assert!(read_woff2_font(&wrapped[..40], Some(&identity()), None).is_none());
    }
    #[test]
    fn passes_the_original_compressed_window_length_and_raw_framing_once() {
        let wrapped = encode_synthetic_woff2(&create_synthetic_font(None), None);
        let directory = read_woff2_table_directory(&wrapped).unwrap();
        let expected_pointer = wrapped[directory.stream_start..].as_ptr() as usize;
        let seen = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::clone(&seen);
        let decompress: Decompressor = Arc::new(move |bytes, length, framing| {
            observed
                .lock()
                .unwrap()
                .push((bytes.as_ptr() as usize, length, framing));
            return Some(bytes.to_vec().into_boxed_slice());
        });
        assert!(read_woff2_font(&wrapped, Some(&decompress), None).is_some());
        assert_eq!(
            *seen.lock().unwrap(),
            [(
                expected_pointer,
                directory.total_uncompressed_length,
                CompressionFraming::Raw
            )]
        );
    }
    #[test]
    fn retains_raw_slice_aliases_without_holding_a_read_lock_across_mutating_callbacks() {
        let sfnt = assemble_sfnt_font(
            0x10000,
            &[SfntFontTable {
                data: vec![3, 4].into_boxed_slice(),
                tag: pack_sfnt_tag("glyf"),
            }],
        );
        let wrapped = encode_synthetic_woff2(&sfnt, Some(&["glyf".to_string()]));
        let decoded_pointer = Arc::new(Mutex::new(0usize));
        let decoded_record = Arc::clone(&decoded_pointer);
        let decompress: Decompressor = Arc::new(move |bytes, _, _| {
            let result = bytes.to_vec().into_boxed_slice();
            *decoded_record.lock().unwrap() = result.as_ptr() as usize;
            return Some(result);
        });
        let retained = Arc::new(Mutex::new(Vec::new()));
        let record = Arc::clone(&retained);
        let pointer = Arc::clone(&decoded_pointer);
        let reverse: Woff2TransformReverser = Arc::new(move |tag, transformed, tables| {
            let other = tables.get(tag).unwrap();
            assert!(equals_array_buffer(&other.buffer, &transformed.buffer));
            let storage = get_array_buffer_storage(&transformed.buffer);
            assert_eq!(
                storage.read().unwrap().as_ptr() as usize + transformed.byte_offset,
                *pointer.lock().unwrap()
            );
            storage.write().unwrap()
                [transformed.byte_offset..transformed.byte_offset + transformed.byte_length]
                .fill(7);
            record.lock().unwrap().push(transformed.clone());
            return Some(transformed.clone());
        });
        let rebuilt = read_woff2_font(&wrapped, Some(&decompress), Some(&reverse)).unwrap();
        let directory = read_sfnt_table_directory(&rebuilt).unwrap();
        let glyf = directory.tables.get("glyf").unwrap();
        assert_eq!(&rebuilt[glyf.offset..glyf.offset + glyf.length], &[7, 7]);
        assert_eq!(view_bytes(&retained.lock().unwrap()[0]), vec![7, 7]);
        let retained_view = retained.lock().unwrap()[0].clone();
        let storage = get_array_buffer_storage(&retained_view.buffer);
        storage.write().unwrap()[retained_view.byte_offset] = 9;
        assert_eq!(&rebuilt[glyf.offset..glyf.offset + glyf.length], &[7, 7]);
        assert_eq!(view_bytes(&retained_view), vec![9, 7]);
    }
    #[test]
    fn defers_assembly_copies_until_later_callbacks_finish_mutating_earlier_outputs() {
        let sfnt = assemble_sfnt_font(
            0x10000,
            &[
                SfntFontTable {
                    data: vec![1].into_boxed_slice(),
                    tag: pack_sfnt_tag("aaaa"),
                },
                SfntFontTable {
                    data: vec![2].into_boxed_slice(),
                    tag: pack_sfnt_tag("bbbb"),
                },
            ],
        );
        let wrapped =
            encode_synthetic_woff2(&sfnt, Some(&["aaaa".to_string(), "bbbb".to_string()]));
        let first = byte_view(vec![3]);
        let first_record = first.clone();
        let second = byte_view(vec![4]);
        let reverse: Woff2TransformReverser = Arc::new(move |tag, _, _| {
            if tag == "aaaa" {
                return Some(first_record.clone());
            }
            get_array_buffer_storage(&first_record.buffer)
                .write()
                .unwrap()[0] = 9;
            return Some(second.clone());
        });
        let rebuilt = read_woff2_font(&wrapped, Some(&identity()), Some(&reverse)).unwrap();
        let directory = read_sfnt_table_directory(&rebuilt).unwrap();
        assert_eq!(rebuilt[directory.tables.get("aaaa").unwrap().offset], 9);
        assert_eq!(view_bytes(&first), vec![9]);
    }
    #[test]
    fn honors_directory_stream_start_and_declines_short_outputs() {
        let mut wrapped = encode_synthetic_woff2(&create_synthetic_font(None), None).into_vec();
        wrapped.extend_from_slice(&[0, 0, 0, 0]);
        assert!(read_woff2_font(&wrapped, Some(&identity()), None).is_some());
        let short: Decompressor = Arc::new(|_, _, _| Some(vec![].into_boxed_slice()));
        assert!(read_woff2_font(&wrapped, Some(&short), None).is_none());
    }
}

mod read_woff2_table_directory {
    use super::*;
    #[test]
    fn resolves_known_tag_indices() {
        let wrapped = encode_synthetic_woff2(&create_synthetic_font(None), None);
        let directory = read_woff2_table_directory(&wrapped).unwrap();
        assert!(directory.entries.iter().any(|entry| entry.tag == "glyf"));
        assert!(directory.entries.iter().any(|entry| entry.tag == "cmap"));
    }
    #[test]
    fn points_stream_start_past_the_directory() {
        let wrapped = encode_synthetic_woff2(&create_synthetic_font(None), None);
        let directory = read_woff2_table_directory(&wrapped).unwrap();
        assert!(directory.stream_start > 48);
        assert_eq!(
            directory.stream_start + directory.total_uncompressed_length,
            wrapped.len()
        );
    }
    #[test]
    fn inverts_transform_flag_meaning_for_the_glyph_pair() {
        let wrapped =
            encode_synthetic_woff2(&create_synthetic_font(None), Some(&["glyf".to_string()]));
        let directory = read_woff2_table_directory(&wrapped).unwrap();
        let glyf = directory
            .entries
            .iter()
            .find(|entry| entry.tag == "glyf")
            .unwrap();
        let cmap = directory
            .entries
            .iter()
            .find(|entry| entry.tag == "cmap")
            .unwrap();
        assert!(glyf.transformed);
        assert_eq!(glyf.transform_version, 0);
        assert!(!cmap.transformed);
        assert_eq!(cmap.transform_version, 0);
    }
    #[test]
    fn treats_the_glyph_pair_as_untransformed_only_at_version_three() {
        let wrapped = encode_synthetic_woff2(&create_synthetic_font(None), None);
        let directory = read_woff2_table_directory(&wrapped).unwrap();
        let glyf = directory
            .entries
            .iter()
            .find(|entry| entry.tag == "glyf")
            .unwrap();
        assert_eq!(glyf.transform_version, 3);
        assert!(!glyf.transformed);
    }
    #[test]
    fn returns_null_for_zero_tables() {
        let mut wrapped = encode_synthetic_woff2(&create_synthetic_font(None), None);
        wrapped[12..14].copy_from_slice(&0u16.to_be_bytes());
        assert!(read_woff2_table_directory(&wrapped).is_none());
    }
    #[test]
    fn returns_null_for_truncated_directories() {
        let wrapped = encode_synthetic_woff2(&create_synthetic_font(None), None);
        assert!(read_woff2_table_directory(&wrapped[..50]).is_none());
    }
    #[test]
    fn resolves_explicit_tags_and_rejects_noncanonical_base128_values() {
        let mut bytes = vec![0; 48];
        bytes[12..14].copy_from_slice(&1u16.to_be_bytes());
        bytes.extend_from_slice(&[63, b't', b'e', b's', b't', 0]);
        let directory = read_woff2_table_directory(&bytes).unwrap();
        assert_eq!(directory.entries[0].tag, "test");
        for length in [
            vec![0x80, 0],
            vec![0xff, 0xff, 0xff, 0xff, 0x7f],
            vec![0x81, 0x80, 0x80, 0x80, 0x80, 0],
        ] {
            let mut malformed = bytes[..53].to_vec();
            malformed.extend(length);
            assert!(read_woff2_table_directory(&malformed).is_none());
        }
    }
}

mod woff2_compression {
    use super::*;
    #[test]
    fn names_brotli_through_the_canonical_algorithm_type() {
        assert_eq!(WOFF2_COMPRESSION, Compression::Brotli);
    }
}
