use crate::gltf_diagnostics::{GltfDropTally, gltf_diagnostic_numbers, tally_gltf_numbers};
use crate::gltf_json::{GltfJsonMetadata, gltf_original_number};
use crate::gltf_schema::*;
use crate::gltf_types::*;
use flight_buffer::{ArrayBufferView, get_array_buffer_storage};
use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use std::sync::{Arc, RwLock};

#[cfg(test)]
#[path = "../tests/internal/gltf_accessor_test.rs"]
mod tests;

pub(crate) struct GltfAccessorReader {
    pub buffers: Vec<ArrayBufferView>,
    pub drops: Option<Ref<Vec<GltfDropTally>>>,
    pub metadata: Arc<GltfJsonMetadata>,
    pub source: Ref<GltfDocument>,
}

enum GltfComponentValue {
    Float(GltfFloatValue),
    Signed(GltfSignedValue),
    Unsigned(GltfUnsignedValue),
}

struct GltfFloatValue {
    value: f32,
}

struct GltfSignedValue {
    value: i32,
}

struct GltfUnsignedValue {
    value: u32,
}

struct GltfReadWindow {
    base: usize,
    count: usize,
    stride: usize,
}

fn create_gltf_component_array(component_type: u32, length: usize) -> GltfComponentArray {
    return match component_type {
        5120 => GltfComponentArray::Int8(GltfInt8Array {
            values: Arc::new(RwLock::new(vec![0; length].into_boxed_slice())),
        }),
        5121 => GltfComponentArray::Uint8(GltfUint8Array {
            values: Arc::new(RwLock::new(vec![0; length].into_boxed_slice())),
        }),
        5122 => GltfComponentArray::Int16(GltfInt16Array {
            values: Arc::new(RwLock::new(vec![0; length].into_boxed_slice())),
        }),
        5123 => GltfComponentArray::Uint16(GltfUint16Array {
            values: Arc::new(RwLock::new(vec![0; length].into_boxed_slice())),
        }),
        5125 => GltfComponentArray::Uint32(GltfUint32Array {
            values: Arc::new(RwLock::new(vec![0; length].into_boxed_slice())),
        }),
        _ => GltfComponentArray::Float32(GltfFloat32Array {
            values: Arc::new(RwLock::new(vec![0.0; length].into_boxed_slice())),
        }),
    };
}

fn apply_gltf_accessor_sparse(
    reader: &GltfAccessorReader,
    sparse: &Ref<GltfAccessorSparse>,
    accessor_count: usize,
    component_type: u32,
    component_count: usize,
    normalize: bool,
    out: &GltfComponentArray,
) {
    let (indices, values, count) = {
        let row = sparse.read().unwrap();
        (row.indices.clone(), row.values.clone(), row.count)
    };
    let (indices_view_index, index_component_type, indices_offset) = {
        let row = indices.read().unwrap();
        (
            gltf_integer_field(&reader.metadata, &indices, "bufferView", row.buffer_view),
            gltf_integer_field(
                &reader.metadata,
                &indices,
                "componentType",
                row.component_type,
            ),
            gltf_integer_field(
                &reader.metadata,
                &indices,
                "byteOffset",
                row.byte_offset.unwrap_or(0.0),
            ),
        )
    };
    let (values_view_index, values_offset) = {
        let row = values.read().unwrap();
        (
            gltf_integer_field(&reader.metadata, &values, "bufferView", row.buffer_view),
            gltf_integer_field(
                &reader.metadata,
                &values,
                "byteOffset",
                row.byte_offset.unwrap_or(0.0),
            ),
        )
    };
    let (Some(indices_view), Some(values_view)) = (
        gltf_buffer_view(reader, indices_view_index),
        gltf_buffer_view(reader, values_view_index),
    ) else {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            "gltf.sparse-bufferview-not-found",
            &[],
        );
        return;
    };
    let (Some(index_bytes), Some(value_bytes)) = (
        gltf_buffer_bytes(reader, &indices_view),
        gltf_buffer_bytes(reader, &values_view),
    ) else {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            "gltf.sparse-buffer-not-found",
            &[],
        );
        return;
    };
    let count_integer = gltf_integer_field(&reader.metadata, sparse, "count", count);
    let index_component_type = index_component_type.and_then(|value| u32::try_from(value).ok());
    let index_size = index_component_type.and_then(gltf_component_byte_size);
    let value_size = gltf_component_byte_size(component_type).unwrap();
    let value_element_size = component_count.checked_mul(value_size);
    let index_window = if indices_view.read().unwrap().byte_stride.is_none() {
        resolve_gltf_read_window(
            reader,
            &index_bytes,
            &indices_view,
            indices_offset,
            index_size,
            index_size,
            count_integer,
        )
    } else {
        None
    };
    let value_window = if values_view.read().unwrap().byte_stride.is_none() {
        resolve_gltf_read_window(
            reader,
            &value_bytes,
            &values_view,
            values_offset,
            value_element_size,
            value_element_size,
            count_integer,
        )
    } else {
        None
    };
    let (Some(index_window), Some(value_window), Some(index_component_type), Some(index_size)) =
        (index_window, value_window, index_component_type, index_size)
    else {
        tally_gltf_numbers(
            reader.drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            "gltf.sparse-invalid-read",
            &[("firstCount", count)],
        );
        return;
    };
    let index_storage = get_array_buffer_storage(&index_bytes.buffer);
    let index_storage = index_storage.read().unwrap();
    // Prove every destination before writing any replacement. One bad index skips the whole override.
    let mut targets = Vec::with_capacity(index_window.count);
    for s in 0..index_window.count {
        let target = read_gltf_component(
            &index_storage,
            index_component_type,
            index_window.base + s * index_size,
        );
        if gltf_sparse_index_out_of_range(&target, accessor_count) {
            tally_gltf_numbers(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Recover,
                "gltf.sparse-index-out-of-range",
                &[
                    ("firstCount", accessor_count as f32),
                    ("firstIndex", gltf_component_float(&target)),
                ],
            );
            return;
        }
        targets.push(gltf_component_index(&target));
    }
    drop(index_storage);
    let value_storage = get_array_buffer_storage(&value_bytes.buffer);
    let value_storage = value_storage.read().unwrap();
    for (s, target) in targets.into_iter().enumerate() {
        let Some(target) = target else {
            // DataView permits float sparse indices; typed-array writes to noninteger keys do nothing.
            continue;
        };
        for c in 0..component_count {
            let raw = read_gltf_component(
                &value_storage,
                component_type,
                value_window.base + (s * component_count + c) * value_size,
            );
            write_gltf_component(
                out,
                target * component_count + c,
                component_type,
                normalize,
                raw,
            );
        }
    }
}

pub(crate) fn gltf_accessor_fault(kind: &str, detail: &[(&str, f32)]) -> GltfAccessorData {
    return GltfAccessorData {
        count: 0,
        data: create_gltf_component_array(5126, 0),
        fault: Some(Arc::new(RwLock::new(GltfAccessorFault {
            detail: gltf_diagnostic_numbers(detail),
            kind: kind.to_string(),
        }))),
    };
}

fn gltf_buffer_bytes(
    reader: &GltfAccessorReader,
    view: &Ref<GltfBufferView>,
) -> Option<ArrayBufferView> {
    let row = view.read().unwrap();
    let index = gltf_integer_field(&reader.metadata, view, "buffer", row.buffer)?;
    return reader.buffers.get(index).cloned();
}

fn gltf_buffer_view(
    reader: &GltfAccessorReader,
    index: Option<usize>,
) -> Option<Ref<GltfBufferView>> {
    return reader
        .source
        .read()
        .unwrap()
        .buffer_views
        .as_ref()?
        .get(index?)
        .cloned();
}

fn gltf_component_byte_size(component_type: u32) -> Option<usize> {
    return match component_type {
        5120 | 5121 => Some(1),
        5122 | 5123 => Some(2),
        5125 | 5126 => Some(4),
        _ => None,
    };
}

fn gltf_component_count(kind: &str) -> Option<usize> {
    return match kind {
        "SCALAR" => Some(1),
        "VEC2" => Some(2),
        "VEC3" => Some(3),
        "VEC4" | "MAT2" => Some(4),
        "MAT3" => Some(9),
        "MAT4" => Some(16),
        _ => None,
    };
}

fn gltf_component_float(value: &GltfComponentValue) -> f32 {
    return match value {
        GltfComponentValue::Float(value) => value.value,
        GltfComponentValue::Signed(value) => value.value as f32,
        GltfComponentValue::Unsigned(value) => value.value as f32,
    };
}

fn gltf_component_index(value: &GltfComponentValue) -> Option<usize> {
    return match value {
        GltfComponentValue::Unsigned(value) => Some(value.value as usize),
        GltfComponentValue::Signed(value) => usize::try_from(value.value).ok(),
        GltfComponentValue::Float(value)
            if value.value.is_finite() && value.value >= 0.0 && value.value.fract() == 0.0 =>
        {
            Some(value.value as usize)
        }
        _ => None,
    };
}

// flight-lint: allow(f64) private exact-integer limb validates original JSON count/index/offset tokens before final usize lookup; no attribute arithmetic is widened
pub(crate) fn gltf_integer_field<T: ?Sized>(
    metadata: &GltfJsonMetadata,
    record: &Ref<T>,
    field: &str,
    current: f32,
) -> Option<usize> {
    let value = gltf_original_number(metadata, record, field, current);
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value >= usize::MAX as f64 {
        return None;
    }
    return Some(value as usize);
}

fn gltf_sparse_index_out_of_range(value: &GltfComponentValue, count: usize) -> bool {
    return match value {
        GltfComponentValue::Unsigned(value) => value.value as usize >= count,
        GltfComponentValue::Signed(value) => value.value < 0 || value.value as usize >= count,
        GltfComponentValue::Float(value) => {
            value.value < 0.0
                || (!value.value.is_nan()
                    && (!value.value.is_finite() || value.value as usize >= count))
        }
    };
}

fn normalize_gltf_component(component_type: u32, value: &GltfComponentValue) -> f32 {
    let value = gltf_component_float(value);
    return match component_type {
        5120 => (value / 127.0).max(-1.0),
        5121 => value / 255.0,
        5122 => (value / 32767.0).max(-1.0),
        5123 => value / 65535.0,
        5125 => value / 4294967295.0,
        _ => value,
    };
}

pub(crate) fn read_gltf_accessor(
    reader: &GltfAccessorReader,
    accessor_index: usize,
    expected_type: Option<&str>,
) -> GltfAccessorData {
    let accessor = reader
        .source
        .read()
        .unwrap()
        .accessors
        .as_ref()
        .and_then(|rows| rows.get(accessor_index).cloned());
    let detail = [("firstAccessor", accessor_index as f32)];
    let Some(accessor) = accessor else {
        return gltf_accessor_fault("gltf.accessor-not-found", &detail);
    };
    let (kind, component_type, count, normalized, view_index, byte_offset, sparse) = {
        let row = accessor.read().unwrap();
        (
            row.r#type.clone(),
            gltf_integer_field(
                &reader.metadata,
                &accessor,
                "componentType",
                row.component_type,
            )
            .and_then(|value| u32::try_from(value).ok()),
            gltf_integer_field(&reader.metadata, &accessor, "count", row.count),
            row.normalized == Some(true),
            gltf_integer_field(
                &reader.metadata,
                &accessor,
                "bufferView",
                row.buffer_view.unwrap_or(-1.0),
            ),
            gltf_integer_field(
                &reader.metadata,
                &accessor,
                "byteOffset",
                row.byte_offset.unwrap_or(0.0),
            ),
            row.sparse.clone(),
        )
    };
    if expected_type.is_some_and(|expected| expected != kind) {
        return gltf_accessor_fault("gltf.accessor-type-mismatch", &detail);
    }
    let component_count = gltf_component_count(&kind);
    let component_byte_size = component_type.and_then(gltf_component_byte_size);
    let (Some(component_type), Some(component_count), Some(component_byte_size), Some(count)) =
        (component_type, component_count, component_byte_size, count)
    else {
        return gltf_accessor_fault("gltf.accessor-invalid-read", &detail);
    };
    let Some(total) = count.checked_mul(component_count) else {
        return gltf_accessor_fault("gltf.accessor-invalid-read", &detail);
    };
    let normalize = normalized && component_type != 5126;
    let out = create_gltf_component_array(if normalize { 5126 } else { component_type }, total);
    if let Some(view) = gltf_buffer_view(reader, view_index) {
        let Some(bytes) = gltf_buffer_bytes(reader, &view) else {
            return gltf_accessor_fault(
                "gltf.accessor-buffer-not-found",
                &[
                    ("firstAccessor", accessor_index as f32),
                    ("firstBuffer", view.read().unwrap().buffer),
                ],
            );
        };
        let element_byte_size = component_count * component_byte_size;
        let stride = {
            let row = view.read().unwrap();
            if row.byte_stride.is_none() {
                Some(element_byte_size)
            } else {
                gltf_integer_field(
                    &reader.metadata,
                    &view,
                    "byteStride",
                    row.byte_stride.unwrap(),
                )
                .map(|stride| {
                    if stride == 0 {
                        element_byte_size
                    } else {
                        stride
                    }
                })
            }
        };
        let Some(window) = resolve_gltf_read_window(
            reader,
            &bytes,
            &view,
            byte_offset,
            Some(element_byte_size),
            stride,
            Some(count),
        ) else {
            return gltf_accessor_fault("gltf.accessor-invalid-read", &detail);
        };
        let storage = get_array_buffer_storage(&bytes.buffer);
        let storage = storage.read().unwrap();
        for i in 0..count {
            for c in 0..component_count {
                let raw = read_gltf_component(
                    &storage,
                    component_type,
                    window.base + i * window.stride + c * component_byte_size,
                );
                write_gltf_component(
                    &out,
                    i * component_count + c,
                    component_type,
                    normalize,
                    raw,
                );
            }
        }
    } else if sparse.is_none() {
        return gltf_accessor_fault(
            "gltf.accessor-bufferview-not-found",
            &[
                ("firstAccessor", accessor_index as f32),
                (
                    "firstBufferView",
                    accessor.read().unwrap().buffer_view.unwrap_or(-1.0),
                ),
            ],
        );
    }
    if let Some(sparse) = sparse {
        apply_gltf_accessor_sparse(
            reader,
            &sparse,
            count,
            component_type,
            component_count,
            normalize,
            &out,
        );
    }
    return GltfAccessorData {
        count,
        data: out,
        fault: None,
    };
}

fn read_gltf_component(bytes: &[u8], component_type: u32, offset: usize) -> GltfComponentValue {
    return match component_type {
        5120 => GltfComponentValue::Signed(GltfSignedValue {
            value: bytes[offset] as i8 as i32,
        }),
        5121 => GltfComponentValue::Unsigned(GltfUnsignedValue {
            value: bytes[offset] as u32,
        }),
        5122 => GltfComponentValue::Signed(GltfSignedValue {
            value: i16::from_le_bytes(bytes[offset..offset + 2].try_into().unwrap()) as i32,
        }),
        5123 => GltfComponentValue::Unsigned(GltfUnsignedValue {
            value: u16::from_le_bytes(bytes[offset..offset + 2].try_into().unwrap()) as u32,
        }),
        5125 => GltfComponentValue::Unsigned(GltfUnsignedValue {
            value: u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()),
        }),
        _ => GltfComponentValue::Float(GltfFloatValue {
            value: f32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()),
        }),
    };
}

fn resolve_gltf_read_window(
    reader: &GltfAccessorReader,
    bytes: &ArrayBufferView,
    view: &Ref<GltfBufferView>,
    byte_offset: Option<usize>,
    element_byte_size: Option<usize>,
    stride: Option<usize>,
    count: Option<usize>,
) -> Option<GltfReadWindow> {
    let row = view.read().unwrap();
    let view_offset = gltf_integer_field(
        &reader.metadata,
        view,
        "byteOffset",
        row.byte_offset.unwrap_or(0.0),
    )?;
    let view_length = gltf_integer_field(&reader.metadata, view, "byteLength", row.byte_length)?;
    let (byte_offset, element_byte_size, stride, count) =
        (byte_offset?, element_byte_size?, stride?, count?);
    if element_byte_size == 0 || stride < element_byte_size {
        return None;
    }
    let view_start = bytes.byte_offset.checked_add(view_offset)?;
    let start = view_start.checked_add(byte_offset)?;
    let declared_end = view_start.checked_add(view_length)?;
    let window_end = bytes.byte_offset.checked_add(bytes.byte_length)?;
    let storage_length = get_array_buffer_storage(&bytes.buffer)
        .read()
        .unwrap()
        .len();
    let limit = declared_end.min(window_end).min(storage_length);
    let end = if count == 0 {
        start
    } else {
        start
            .checked_add((count - 1).checked_mul(stride)?)?
            .checked_add(element_byte_size)?
    };
    if end > limit {
        return None;
    }
    return Some(GltfReadWindow {
        base: start,
        count,
        stride,
    });
}

fn write_gltf_component(
    out: &GltfComponentArray,
    index: usize,
    component_type: u32,
    normalize: bool,
    value: GltfComponentValue,
) {
    if normalize {
        let GltfComponentArray::Float32(out) = out else {
            unreachable!()
        };
        out.values.write().unwrap()[index] = normalize_gltf_component(component_type, &value);
        return;
    }
    match (out, value) {
        (GltfComponentArray::Float32(out), GltfComponentValue::Float(value)) => {
            out.values.write().unwrap()[index] = value.value
        }
        (GltfComponentArray::Int8(out), GltfComponentValue::Signed(value)) => {
            out.values.write().unwrap()[index] = value.value as i8
        }
        (GltfComponentArray::Int16(out), GltfComponentValue::Signed(value)) => {
            out.values.write().unwrap()[index] = value.value as i16
        }
        (GltfComponentArray::Uint8(out), GltfComponentValue::Unsigned(value)) => {
            out.values.write().unwrap()[index] = value.value as u8
        }
        (GltfComponentArray::Uint16(out), GltfComponentValue::Unsigned(value)) => {
            out.values.write().unwrap()[index] = value.value as u16
        }
        (GltfComponentArray::Uint32(out), GltfComponentValue::Unsigned(value)) => {
            out.values.write().unwrap()[index] = value.value
        }
        _ => unreachable!(),
    }
}
