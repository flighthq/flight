use crate::gltf_container::decode_gltf_base64;
use crate::gltf_diagnostics::{
    GltfDiagnosticDetail, GltfDiagnosticValues, GltfDropTally, gltf_diagnostic_values,
    tally_gltf_drop,
};
use crate::gltf_schema::GltfBuffer;
use crate::gltf_types::{GltfExternalBuffer, GltfImportOptions};
use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, get_array_buffer_storage,
};
use flight_entity::{Ref, get_record_value};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};

#[cfg(test)]
#[path = "../tests/internal/gltf_buffer_test.rs"]
mod tests;

pub(crate) fn decode_gltf_buffer(
    buffer: &Ref<GltfBuffer>,
    binary: Option<&ArrayBufferView>,
    options: Option<&GltfImportOptions>,
    drops: Option<&Ref<Vec<GltfDropTally>>>,
) -> ArrayBufferView {
    let uri = buffer.read().unwrap().uri.clone();
    let Some(uri) = uri else {
        if let Some(binary) = binary {
            return binary.clone();
        }
        tally_gltf_empty_buffer(
            drops,
            "no-uri",
            &[(
                "reason",
                ImportDiagnosticDetailValue::String("no-uri-no-binary".to_string()),
            )],
        );
        return gltf_owned_byte_view(Box::new([]));
    };
    if uri.starts_with("data:") {
        if let Some(comma) = uri.find(',') {
            return gltf_owned_byte_view(decode_gltf_base64(&uri[comma + 1..]));
        }
    }
    if let Some(supplied) = options.and_then(|options| options.external_buffers.as_ref()) {
        let supplied = supplied.read().unwrap();
        if let Some(supplied) = get_record_value(&supplied, &uri) {
            return gltf_owned_byte_view(gltf_external_bytes(supplied));
        }
    }
    tally_gltf_empty_buffer(
        drops,
        "external-missing",
        &[
            ("firstUri", ImportDiagnosticDetailValue::String(uri)),
            (
                "reason",
                ImportDiagnosticDetailValue::String("external-not-supplied".to_string()),
            ),
        ],
    );
    return gltf_owned_byte_view(Box::new([]));
}

fn gltf_external_bytes(source: &GltfExternalBuffer) -> Box<[u8]> {
    return match source {
        GltfExternalBuffer::Values(source) => source
            .values
            .read()
            .unwrap()
            .iter()
            .map(|value| gltf_uint8(*value))
            .collect(),
        GltfExternalBuffer::View(source) => {
            let source = &source.view;
            let storage = get_array_buffer_storage(&source.buffer);
            let storage = storage.read().unwrap();
            let Some(bytes) = source
                .byte_offset
                .checked_add(source.byte_length)
                .and_then(|end| storage.get(source.byte_offset..end))
            else {
                return Box::new([]);
            };
            match source.kind {
                ArrayBufferViewKind::Uint8Array
                | ArrayBufferViewKind::Uint8ClampedArray
                | ArrayBufferViewKind::Int8Array => bytes.into(),
                ArrayBufferViewKind::Uint16Array | ArrayBufferViewKind::Int16Array => bytes
                    .chunks_exact(2)
                    .map(|chunk| u16::from_le_bytes(chunk.try_into().unwrap()) as u8)
                    .collect(),
                ArrayBufferViewKind::Uint32Array | ArrayBufferViewKind::Int32Array => bytes
                    .chunks_exact(4)
                    .map(|chunk| u32::from_le_bytes(chunk.try_into().unwrap()) as u8)
                    .collect(),
                ArrayBufferViewKind::Float32Array => bytes
                    .chunks_exact(4)
                    .map(|chunk| gltf_uint8(f32::from_le_bytes(chunk.try_into().unwrap())))
                    .collect(),
                ArrayBufferViewKind::Float64Array => {
                    bytes.chunks_exact(8).map(gltf_uint8_from_float64).collect()
                }
                ArrayBufferViewKind::DataView => Box::new([]),
            }
        }
    };
}

pub(crate) fn gltf_owned_byte_view(bytes: Box<[u8]>) -> ArrayBufferView {
    let length = bytes.len();
    return ArrayBufferView {
        buffer: create_array_buffer_from_bytes(bytes),
        byte_offset: 0,
        byte_length: length,
        kind: ArrayBufferViewKind::Uint8Array,
    };
}

fn gltf_uint8(value: f32) -> u8 {
    if !value.is_finite() || value == 0.0 {
        return 0;
    }
    return value.trunc().rem_euclid(256.0) as u8;
}

// flight-lint: allow(f64) private exact-byte conversion reads the canonical caller Float64Array wire value and applies source Uint8Array.from ToUint8 before its final integer write
fn gltf_uint8_from_float64(bytes: &[u8]) -> u8 {
    let value = f64::from_le_bytes(bytes.try_into().unwrap());
    if !value.is_finite() || value == 0.0 {
        return 0;
    }
    return value.trunc().rem_euclid(256.0) as u8;
}

fn tally_gltf_empty_buffer(
    drops: Option<&Ref<Vec<GltfDropTally>>>,
    discriminator: &str,
    values: &[(&str, ImportDiagnosticDetailValue)],
) {
    if drops.is_none() {
        return;
    }
    tally_gltf_drop(
        drops,
        ImportDiagnosticSeverity::Recover,
        "gltf.buffer-empty",
        discriminator,
        GltfDiagnosticDetail::Values(GltfDiagnosticValues {
            value: gltf_diagnostic_values(values),
        }),
    );
}
