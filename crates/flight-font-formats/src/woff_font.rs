use std::collections::HashMap;

use flight_compression::{Compression, CompressionFraming, Decompressor};
use flight_entity::Uint8Array;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};

use crate::binary::{unsigned16, unsigned32};
use crate::sfnt_assembly::{SfntFontTable, assemble_sfnt_font, compute_sfnt_table_checksum};
use crate::sfnt_table_directory::read_sfnt_tag;
use crate::types::WoffChecksumMismatch;

pub const WOFF_COMPRESSION: Compression = Compression::Deflate;

pub fn read_woff_checksum_mismatches(
    bytes: &Uint8Array,
    decompress: &Decompressor,
) -> Vec<WoffChecksumMismatch> {
    if bytes.len() < 44 {
        return Vec::new();
    }
    let table_count = usize::from(unsigned16(bytes, 12));
    let directory_end = 44 + table_count * 20;
    if table_count == 0 || directory_end > bytes.len() {
        return Vec::new();
    }
    let mut mismatches = Vec::new();
    for index in 0..table_count {
        let record = 44 + index * 20;
        let tag = unsigned32(bytes, record);
        let offset = unsigned32(bytes, record + 4) as usize;
        let compressed_length = unsigned32(bytes, record + 8) as usize;
        let original_length = unsigned32(bytes, record + 12) as usize;
        let stored = unsigned32(bytes, record + 16);
        if offset + compressed_length > bytes.len() {
            continue;
        }
        let raw = &bytes[offset..offset + compressed_length];
        let inflated;
        let data = if compressed_length != original_length {
            let Some(value) = decompress(raw, original_length, CompressionFraming::Rfc1950) else {
                continue;
            };
            if value.len() != original_length {
                continue;
            }
            inflated = value;
            &*inflated
        } else {
            raw
        };
        let computed = compute_sfnt_table_checksum(data, Some(tag == 0x68656164));
        if computed != stored {
            mismatches.push(WoffChecksumMismatch {
                computed,
                stored,
                tag: read_sfnt_tag(bytes, record),
            });
        }
    }
    return mismatches;
}

pub fn read_woff_font(
    bytes: &Uint8Array,
    decompress: &Decompressor,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<Box<Uint8Array>> {
    if bytes.len() < 44 {
        return None;
    }
    let table_count = usize::from(unsigned16(bytes, 12));
    if table_count == 0 {
        return None;
    }
    if 44 + table_count * 20 > bytes.len() {
        return None;
    }
    let flavor = unsigned32(bytes, 4);
    let mut unpacked_tables = Vec::new();
    for index in 0..table_count {
        let record = 44 + index * 20;
        let tag = unsigned32(bytes, record);
        let offset = unsigned32(bytes, record + 4) as usize;
        let compressed_length = unsigned32(bytes, record + 8) as usize;
        let original_length = unsigned32(bytes, record + 12) as usize;
        if offset + compressed_length > bytes.len() {
            return None;
        }
        let stored = &bytes[offset..offset + compressed_length];
        if compressed_length == original_length {
            unpacked_tables.push(SfntFontTable {
                data: stored.to_vec().into_boxed_slice(),
                tag,
            });
            continue;
        }
        let inflated = decompress(stored, original_length, CompressionFraming::Rfc1950);
        if inflated
            .as_ref()
            .is_none_or(|value| value.len() != original_length)
        {
            let mut detail = HashMap::new();
            detail.insert(
                "compressedLength".to_string(),
                ImportDiagnosticDetailValue::Number(compressed_length as f32),
            );
            detail.insert(
                "originalLength".to_string(),
                ImportDiagnosticDetailValue::Number(original_length as f32),
            );
            detail.insert(
                "outputLength".to_string(),
                ImportDiagnosticDetailValue::Number(
                    inflated.as_ref().map_or(-1.0, |value| value.len() as f32),
                ),
            );
            detail.insert(
                "table".to_string(),
                ImportDiagnosticDetailValue::String(read_sfnt_tag(bytes, record)),
            );
            report_import_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Reject,
                "woff.decompression-failed",
                "readWoffFont",
                Some(detail),
            );
            return None;
        }
        unpacked_tables.push(SfntFontTable {
            data: inflated.unwrap(),
            tag,
        });
    }
    return Some(assemble_sfnt_font(flavor, &unpacked_tables));
}
