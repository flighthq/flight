use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, RwLock};

use flight_entity::{FlightError, FlightErrorKind, Ref, Uint8Array, Unknown};

/// The exact optional `Blob.arrayBuffer()` provider callback. Its returned future retains the
/// provider's ArrayBuffer allocation or canonical Unknown rejection value without conversion.
pub type BlobArrayBufferReader = Arc<
    dyn Fn() -> Pin<Box<dyn Future<Output = Result<ArrayBuffer, Unknown>> + Send>> + Send + Sync,
>;

/// A forward-only little/big-endian cursor over a byte view (TS `ByteReader`), shared by the
/// binary format parsers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ByteReader<'a> {
    pub view: &'a Uint8Array,
    pub offset: usize,
}

/// JavaScript `ArrayBuffer`: one fixed-length byte allocation shared by identity. Cloning never
/// copies or flattens the bytes; views and clones retain the same storage allocation.
#[derive(Clone)]
pub struct ArrayBuffer {
    storage: Ref<Box<[u8]>>,
}

/// The exact view constructors used by the pinned Flight project. `Uint8ClampedArray` is present;
/// BigInt and Float16 views are absent because the audited source does not use them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArrayBufferViewKind {
    Uint8Array,
    Uint8ClampedArray,
    Int8Array,
    Uint16Array,
    Int16Array,
    Uint32Array,
    Int32Array,
    Float32Array,
    Float64Array,
    DataView,
}

/// A JavaScript `ArrayBufferView`: a bounded alias into one shared `ArrayBuffer` allocation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ArrayBufferView {
    pub buffer: ArrayBuffer,
    pub byte_offset: usize,
    pub byte_length: usize,
    pub kind: ArrayBufferViewKind,
}

/// JavaScript `Blob` contract data. Callers share this immutable record through `Arc<Blob>`;
/// `payload` is provider-owned and opaque, and `None` is canonical `unknown` null. A provider may
/// supply the exact asynchronous `arrayBuffer()` operation without granting any other host I/O.
pub struct Blob {
    pub mime_type: String,
    pub size: usize,
    pub payload: Unknown,
    pub array_buffer_reader: Option<BlobArrayBufferReader>,
}

/// Allocates a zero-filled fixed-length buffer.
pub fn create_array_buffer(byte_length: usize) -> ArrayBuffer {
    let bytes: Box<[u8]> = std::iter::repeat_n(0, byte_length).collect();
    return create_array_buffer_from_bytes(bytes);
}

/// Wraps an owned fixed-length byte slice without copying it through a growable `Vec`.
pub fn create_array_buffer_from_bytes(bytes: Box<[u8]>) -> ArrayBuffer {
    return ArrayBuffer {
        storage: Arc::new(RwLock::new(bytes)),
    };
}

/// Creates a bounded alias into `buffer`; an out-of-range offset/length returns `None`.
pub fn create_array_buffer_view(
    buffer: &ArrayBuffer,
    byte_offset: usize,
    byte_length: usize,
    kind: ArrayBufferViewKind,
) -> Option<ArrayBufferView> {
    let end = byte_offset.checked_add(byte_length)?;
    if end > get_array_buffer_byte_length(buffer) {
        return None;
    }
    return Some(ArrayBufferView {
        buffer: buffer.clone(),
        byte_offset,
        byte_length,
        kind,
    });
}

/// Creates the immutable shared Blob record. The optional reader is retained by identity; creation
/// performs no I/O and does not interpret the provider payload.
pub fn create_blob(
    mime_type: String,
    size: usize,
    payload: Unknown,
    array_buffer_reader: Option<BlobArrayBufferReader>,
) -> Arc<Blob> {
    return Arc::new(Blob {
        mime_type,
        size,
        payload,
        array_buffer_reader,
    });
}

/// ArrayBuffer equality is allocation identity, as in JavaScript object equality.
pub fn equals_array_buffer(a: &ArrayBuffer, b: &ArrayBuffer) -> bool {
    return Arc::ptr_eq(&a.storage, &b.storage);
}

/// Returns the immutable allocation length.
pub fn get_array_buffer_byte_length(buffer: &ArrayBuffer) -> usize {
    return buffer.storage.read().unwrap().len();
}

/// Returns the shared fixed-length storage handle for host/provider integration. The returned
/// handle aliases the buffer; locking it never changes allocation identity or length.
pub fn get_array_buffer_storage(buffer: &ArrayBuffer) -> Ref<Box<[u8]>> {
    return buffer.storage.clone();
}

/// D9e exact string table for JavaScript ArrayBuffer view constructor names.
pub fn get_array_buffer_view_kind_string(value: ArrayBufferViewKind) -> &'static str {
    return match value {
        ArrayBufferViewKind::Uint8Array => "Uint8Array",
        ArrayBufferViewKind::Uint8ClampedArray => "Uint8ClampedArray",
        ArrayBufferViewKind::Int8Array => "Int8Array",
        ArrayBufferViewKind::Uint16Array => "Uint16Array",
        ArrayBufferViewKind::Int16Array => "Int16Array",
        ArrayBufferViewKind::Uint32Array => "Uint32Array",
        ArrayBufferViewKind::Int32Array => "Int32Array",
        ArrayBufferViewKind::Float32Array => "Float32Array",
        ArrayBufferViewKind::Float64Array => "Float64Array",
        ArrayBufferViewKind::DataView => "DataView",
    };
}

/// D9e parser accepting only exact JavaScript ArrayBuffer view constructor names.
pub fn parse_array_buffer_view_kind(value: &str) -> Option<ArrayBufferViewKind> {
    return match value {
        "Uint8Array" => Some(ArrayBufferViewKind::Uint8Array),
        "Uint8ClampedArray" => Some(ArrayBufferViewKind::Uint8ClampedArray),
        "Int8Array" => Some(ArrayBufferViewKind::Int8Array),
        "Uint16Array" => Some(ArrayBufferViewKind::Uint16Array),
        "Int16Array" => Some(ArrayBufferViewKind::Int16Array),
        "Uint32Array" => Some(ArrayBufferViewKind::Uint32Array),
        "Int32Array" => Some(ArrayBufferViewKind::Int32Array),
        "Float32Array" => Some(ArrayBufferViewKind::Float32Array),
        "Float64Array" => Some(ArrayBufferViewKind::Float64Array),
        "DataView" => Some(ArrayBufferViewKind::DataView),
        _ => None,
    };
}

/// Reads the Blob through its supplied provider callback. Missing I/O capability is an explicit
/// `NotReadableError` value; callback rejection values, including canonical null, pass through
/// unchanged. This operation is intentionally not abortable.
pub async fn read_blob_array_buffer(blob: &Blob) -> Result<ArrayBuffer, Unknown> {
    let Some(reader) = &blob.array_buffer_reader else {
        return Err(Some(Arc::new(FlightError {
            kind: FlightErrorKind::NotReadableError,
            message: "Blob data is not readable".to_string(),
        })));
    };
    return reader().await;
}

// flight-lint: allow(sugar-delegates) trait boilerplate: Debug exposes only the fixed byte length, never the shared storage contents
impl fmt::Debug for ArrayBuffer {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("ArrayBuffer")
            .field("byte_length", &get_array_buffer_byte_length(self))
            .finish_non_exhaustive();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: ArrayBuffer equality is prescribed allocation identity
impl PartialEq for ArrayBuffer {
    fn eq(&self, other: &Self) -> bool {
        return equals_array_buffer(self, other);
    }
}

impl Eq for ArrayBuffer {}

// flight-lint: allow(sugar-delegates) trait boilerplate: the provider-owned Unknown payload is opaque, so Debug reports only whether it is null
impl fmt::Debug for Blob {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("Blob")
            .field("mime_type", &self.mime_type)
            .field("size", &self.size)
            .field("payload_is_null", &self.payload.is_none())
            .field(
                "has_array_buffer_reader",
                &self.array_buffer_reader.is_some(),
            )
            .finish();
    }
}
