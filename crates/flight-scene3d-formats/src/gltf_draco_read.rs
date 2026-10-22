use crate::gltf_accessor::{GltfAccessorReader, gltf_integer_field};
use crate::gltf_diagnostics::tally_gltf_numbers;
use crate::gltf_json::gltf_original_number;
use crate::gltf_schema::{GltfBufferView, GltfPrimitive};
use crate::gltf_types::{GltfDracoMesh, GltfImportOptions};
use flight_buffer::{ArrayBufferView, ArrayBufferViewKind};
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use std::panic::{AssertUnwindSafe, catch_unwind};

#[cfg(test)]
#[path = "../tests/internal/gltf_draco_read_test.rs"]
mod tests;

// flight-lint: allow(f64) private exact-index limb implements source subarray ToInteger and negative/clamped slice edges from original JSON byte metadata; payload bytes are not widened or copied
fn gltf_draco_payload(
    reader: &GltfAccessorReader,
    view: &Ref<GltfBufferView>,
    bytes: &ArrayBufferView,
) -> ArrayBufferView {
    let row = view.read().unwrap();
    let start = gltf_original_number(
        &reader.metadata,
        view,
        "byteOffset",
        row.byte_offset.unwrap_or(0.0),
    );
    let length = gltf_original_number(&reader.metadata, view, "byteLength", row.byte_length);
    let edge = |value: f64| {
        let value = if value.is_nan() { 0.0 } else { value.trunc() };
        return if value < 0.0 {
            bytes.byte_length.saturating_sub(value.abs() as usize)
        } else {
            (value as usize).min(bytes.byte_length)
        };
    };
    let relative_start = edge(start);
    let relative_end = edge(start + length).max(relative_start);
    return ArrayBufferView {
        buffer: bytes.buffer.clone(),
        byte_offset: bytes.byte_offset + relative_start,
        byte_length: relative_end - relative_start,
        kind: ArrayBufferViewKind::Uint8Array,
    };
}

pub(crate) fn resolve_gltf_draco_mesh(
    reader: &GltfAccessorReader,
    primitive: &Ref<GltfPrimitive>,
    options: Option<&GltfImportOptions>,
) -> Option<Ref<GltfDracoMesh>> {
    let block = primitive
        .read()
        .unwrap()
        .extensions
        .as_ref()
        .and_then(|extensions| {
            extensions
                .read()
                .unwrap()
                .khr_draco_mesh_compression
                .clone()
        })?;
    let decoder = options
        .and_then(|options| options.draco_registry.as_ref())
        .and_then(|registry| registry.read().unwrap().decoder.clone());
    let Some(decoder) = decoder else {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Drop,
            "gltf.draco-decoder-missing",
            &[],
        );
        return None;
    };
    let (view_index, view_number, attributes) = {
        let row = block.read().unwrap();
        (
            gltf_integer_field(&reader.metadata, &block, "bufferView", row.buffer_view),
            row.buffer_view,
            row.attributes.clone(),
        )
    };
    let view = reader
        .source
        .read()
        .unwrap()
        .buffer_views
        .as_ref()
        .and_then(|views| view_index.and_then(|index| views.get(index)))
        .cloned();
    let bytes = view.as_ref().and_then(|view| {
        let row = view.read().unwrap();
        return gltf_integer_field(&reader.metadata, view, "buffer", row.buffer)
            .and_then(|index| reader.buffers.get(index))
            .cloned();
    });
    let (Some(view), Some(bytes)) = (view, bytes) else {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Drop,
            "gltf.draco-payload-missing",
            &[("firstBufferView", view_number)],
        );
        return None;
    };
    let payload = gltf_draco_payload(reader, &view, &bytes);
    // The canonical view retains backing identity while every parser/source/registry guard is dropped.
    let decoded = catch_unwind(AssertUnwindSafe(|| decoder(&payload, &attributes)))
        .ok()
        .flatten();
    if decoded.is_none() {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Drop,
            "gltf.draco-decode-failed",
            &[("firstBufferView", view_number)],
        );
    }
    return decoded;
}
