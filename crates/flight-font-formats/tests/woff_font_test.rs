use std::sync::{Arc, Mutex};

use crate::support::{font_options, font_view};
use flight_compression::{
    Compression, CompressionFraming, Decompressor, HostDecompressDeflateCapability,
    SDK_HOST_DECOMPRESS_DEFLATE, compress_deflate_zlib, decompress_deflate,
};
use flight_font_formats::*;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_path::create_path;

fn decoder() -> Decompressor {
    return Arc::new(decompress_deflate);
}
fn put32(bytes: &mut [u8], at: usize, value: u32) {
    bytes[at..at + 4].copy_from_slice(&value.to_be_bytes());
}
fn compressed_table() -> (Vec<u8>, Vec<u8>) {
    let original = vec![42; 80];
    let compressed = compress_deflate_zlib(&original);
    let mut woff = vec![0; 64];
    woff[..4].copy_from_slice(b"wOFF");
    put32(&mut woff, 4, 0x10000);
    woff[12..14].copy_from_slice(&1u16.to_be_bytes());
    put32(&mut woff, 44, pack_sfnt_tag("cmap"));
    put32(&mut woff, 48, 64);
    put32(&mut woff, 52, compressed.len() as u32);
    put32(&mut woff, 56, original.len() as u32);
    put32(&mut woff, 60, compute_sfnt_table_checksum(&original, None));
    woff.extend_from_slice(&compressed);
    let length = woff.len() as u32;
    put32(&mut woff, 8, length);
    return (woff, original);
}

mod read_woff_checksum_mismatches {
    use super::*;
    #[test]
    fn reports_nothing_for_truthful_container_checksums() {
        assert!(
            read_woff_checksum_mismatches(
                &encode_synthetic_woff(&create_synthetic_font(None), None),
                &decoder()
            )
            .is_empty()
        );
    }
    #[test]
    fn names_only_the_mismatching_table_with_stored_and_computed_values() {
        let mut woff = encode_synthetic_woff(&create_synthetic_font(None), None);
        let tag = read_sfnt_tag(&woff, 44);
        put32(&mut woff, 60, 0xdeadbeef);
        let found = read_woff_checksum_mismatches(&woff, &decoder());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].stored, 0xdeadbeef);
        assert_ne!(found[0].computed, 0xdeadbeef);
        assert_eq!(found[0].tag, tag);
    }
    #[test]
    fn mismatches_are_information_and_do_not_prevent_loading() {
        let mut woff = encode_synthetic_woff(&create_synthetic_font(None), None);
        put32(&mut woff, 60, 0xdeadbeef);
        assert_eq!(read_woff_checksum_mismatches(&woff, &decoder()).len(), 1);
        assert!(read_woff_font(&woff, &decoder(), None).is_some());
    }
    #[test]
    fn returns_an_empty_report_for_an_unreadable_container() {
        assert!(read_woff_checksum_mismatches(&[0; 8], &decoder()).is_empty());
    }
    #[test]
    fn skips_unreadable_payloads_or_failed_decompressions_and_retains_directory_order() {
        let (mut bytes, _) = compressed_table();
        let decline: Decompressor = Arc::new(|_, _, _| None);
        assert!(read_woff_checksum_mismatches(&bytes, &decline).is_empty());
        put32(&mut bytes, 48, u32::MAX);
        assert!(read_woff_checksum_mismatches(&bytes, &decoder()).is_empty());
    }
}

mod read_woff_font {
    use super::*;
    #[test]
    fn produces_identical_outlines_and_advances_to_the_plain_font() {
        let original = create_synthetic_font(Some(&SyntheticFontOptions {
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(100.0)]),
            ..font_options()
        }));
        let rebuilt =
            read_woff_font(&encode_synthetic_woff(&original, None), &decoder(), None).unwrap();
        let before = create_glyph_outline_source_from_open_type_font(
            &font_view(original),
            &SDK_HOST_DECOMPRESS_DEFLATE,
            None,
        )
        .unwrap();
        let after = create_glyph_outline_source_from_open_type_font(
            &font_view(rebuilt),
            &SDK_HOST_DECOMPRESS_DEFLATE,
            None,
        )
        .unwrap();
        let mut a = create_path(None);
        let mut b = create_path(None);
        assert!((before.get_glyph_outline)(&mut a, 1));
        assert!((after.get_glyph_outline)(&mut b, 1));
        assert_eq!(b.commands, a.commands);
        assert_eq!(b.data, a.data);
        assert!(!a.commands.is_empty());
        assert_eq!(
            (after.get_glyph_outline_advance)(1),
            (before.get_glyph_outline_advance)(1)
        );
    }
    #[test]
    fn rebuilds_an_sfnt_with_the_same_table_names() {
        let original = create_synthetic_font(None);
        let rebuilt =
            read_woff_font(&encode_synthetic_woff(&original, None), &decoder(), None).unwrap();
        assert_eq!(
            read_sfnt_table_directory(&rebuilt).unwrap().table_order,
            read_sfnt_table_directory(&original).unwrap().table_order
        );
    }
    #[test]
    fn preserves_every_table_byte_for_byte() {
        let original = create_synthetic_font(None);
        let rebuilt =
            read_woff_font(&encode_synthetic_woff(&original, None), &decoder(), None).unwrap();
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
    fn carries_cff_flavor_through_the_wrapper() {
        let original = create_synthetic_font(Some(&SyntheticFontOptions {
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..font_options()
        }));
        let rebuilt =
            read_woff_font(&encode_synthetic_woff(&original, None), &decoder(), None).unwrap();
        assert_eq!(
            read_sfnt_table_directory(&rebuilt).unwrap().sfnt_version,
            0x4f54544f
        );
    }
    #[test]
    fn sorts_the_directory_even_when_woff_entries_are_descending() {
        let rebuilt = read_woff_font(
            &encode_synthetic_woff(&create_synthetic_font(None), Some(true)),
            &decoder(),
            None,
        )
        .unwrap();
        let order = read_sfnt_table_directory(&rebuilt).unwrap().table_order;
        let mut sorted = order.clone();
        sorted.sort();
        assert_eq!(order, sorted);
    }
    #[test]
    fn aligns_every_rebuilt_table_even_when_some_lengths_are_not_aligned() {
        let rebuilt = read_woff_font(
            &encode_synthetic_woff(&create_synthetic_font(None), None),
            &decoder(),
            None,
        )
        .unwrap();
        let directory = read_sfnt_table_directory(&rebuilt).unwrap();
        assert!(
            directory
                .table_order
                .iter()
                .any(|tag| directory.tables.get(tag).unwrap().length % 4 != 0)
        );
        for tag in &directory.table_order {
            assert_eq!(directory.tables.get(tag).unwrap().offset % 4, 0);
        }
    }
    #[test]
    fn reads_stored_tables_with_the_supplied_decompressor_available() {
        let rebuilt = read_woff_font(
            &encode_synthetic_woff(&create_synthetic_font(None), None),
            &decoder(),
            None,
        );
        assert!(rebuilt.is_some());
    }
    #[test]
    fn returns_null_for_truncated_containers() {
        let woff = encode_synthetic_woff(&create_synthetic_font(None), None);
        assert!(read_woff_font(&woff[..20], &decoder(), None).is_none());
        assert!(read_woff_font(&woff[..woff.len() - 8], &decoder(), None).is_none());
    }
    #[test]
    fn returns_null_for_zero_table_count() {
        let mut woff = encode_synthetic_woff(&create_synthetic_font(None), None);
        woff[12..14].copy_from_slice(&0u16.to_be_bytes());
        assert!(read_woff_font(&woff, &decoder(), None).is_none());
    }
    #[test]
    fn rejects_wrong_decompression_length_with_exact_diagnostic_fields() {
        let mut woff = encode_synthetic_woff(&create_synthetic_font(None), None);
        put32(&mut woff, 52, 4);
        let mut diagnostics = Vec::new();
        let wrong: Decompressor = Arc::new(|_, _, framing| {
            assert_eq!(framing, CompressionFraming::Rfc1950);
            return Some(vec![0; 3].into_boxed_slice());
        });
        assert!(read_woff_font(&woff, &wrong, Some(&mut diagnostics)).is_none());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "woff.decompression-failed");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(diagnostics[0].origin, "readWoffFont");
        assert_eq!(
            diagnostics[0].detail.as_ref().unwrap().get("outputLength"),
            Some(&ImportDiagnosticDetailValue::Number(3.0))
        );
    }
    #[test]
    fn emits_the_same_reject_diagnostic_from_the_public_outline_importer() {
        let mut woff = encode_synthetic_woff(&create_synthetic_font(None), None);
        put32(&mut woff, 52, 4);
        let failing = HostDecompressDeflateCapability {
            decompress: Arc::new(|_, _, framing| {
                assert_eq!(framing, CompressionFraming::Rfc1950);
                return None;
            }),
        };
        let mut diagnostics = Vec::new();
        assert!(
            create_glyph_outline_source_from_open_type_font(
                &font_view(woff),
                &failing,
                Some(&mut diagnostics)
            )
            .is_none()
        );
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "woff.decompression-failed");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(diagnostics[0].origin, "readWoffFont");
    }
    #[test]
    fn uses_the_actual_canonical_inflater_with_the_original_sliced_payload_and_declared_length() {
        let (woff, original) = compressed_table();
        let mut backing = vec![91, 92];
        backing.extend_from_slice(&woff);
        backing.push(93);
        let view = &backing[2..backing.len() - 1];
        let expected_pointer = view[64..].as_ptr() as usize;
        let seen = Arc::new(Mutex::new(Vec::new()));
        let record = Arc::clone(&seen);
        let decompress: Decompressor = Arc::new(move |bytes, length, framing| {
            record
                .lock()
                .unwrap()
                .push((bytes.as_ptr() as usize, length, framing));
            return decompress_deflate(bytes, length, framing);
        });
        let rebuilt = read_woff_font(view, &decompress, None).unwrap();
        let directory = read_sfnt_table_directory(&rebuilt).unwrap();
        let cmap = directory.tables.get("cmap").unwrap();
        assert_eq!(&rebuilt[cmap.offset..cmap.offset + cmap.length], &original);
        assert!(read_woff_checksum_mismatches(view, &decompress).is_empty());
        assert_eq!(
            *seen.lock().unwrap(),
            vec![
                (
                    expected_pointer,
                    original.len(),
                    CompressionFraming::Rfc1950
                );
                2
            ]
        );
    }
    #[test]
    fn appends_to_the_original_diagnostic_sink_in_order_and_reports_null_output_as_negative_one() {
        let (woff, _) = compressed_table();
        let mut diagnostics = vec![ImportDiagnostic {
            detail: None,
            kind: "prior".to_string(),
            origin: "fixture".to_string(),
            severity: ImportDiagnosticSeverity::Recover,
        }];
        let identity = &diagnostics as *const Vec<ImportDiagnostic> as usize;
        let decline: Decompressor = Arc::new(|_, _, _| None);
        assert!(read_woff_font(&woff, &decline, Some(&mut diagnostics)).is_none());
        assert_eq!(
            &diagnostics as *const Vec<ImportDiagnostic> as usize,
            identity
        );
        assert_eq!(
            diagnostics
                .iter()
                .map(|entry| entry.kind.clone())
                .collect::<Vec<_>>(),
            ["prior", "woff.decompression-failed"]
        );
        assert_eq!(
            diagnostics[1].detail.as_ref().unwrap().get("outputLength"),
            Some(&ImportDiagnosticDetailValue::Number(-1.0))
        );
    }
}

mod woff_compression {
    use super::*;
    #[test]
    fn names_deflate_through_the_shared_algorithm_type() {
        assert_eq!(WOFF_COMPRESSION, Compression::Deflate);
    }
}
