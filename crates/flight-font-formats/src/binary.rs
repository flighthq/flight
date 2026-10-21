use flight_buffer::{ArrayBufferView, ArrayBufferViewKind};
use flight_entity::{Uint8Array, throw_range_error, throw_type_error};

pub(crate) fn assert_uint8_view(view: &ArrayBufferView) {
    if view.kind != ArrayBufferViewKind::Uint8Array {
        throw_type_error("Font byte view must be a Uint8Array");
    }
}

pub(crate) fn byte(bytes: &Uint8Array, offset: usize) -> u8 {
    return *bytes
        .get(offset)
        .unwrap_or_else(|| throw_range_error("Offset is outside the bounds of the DataView"));
}

pub(crate) fn signed16(bytes: &Uint8Array, offset: usize) -> i16 {
    return unsigned16(bytes, offset) as i16;
}

pub(crate) fn signed32(bytes: &Uint8Array, offset: usize) -> i32 {
    return unsigned32(bytes, offset) as i32;
}

pub(crate) fn to_uint32(value: f32) -> u32 {
    if !value.is_finite() || value == 0.0 {
        return 0;
    }
    let magnitude = (value.abs().trunc() % 4294967296.0) as u32;
    return if value < 0.0 {
        magnitude.wrapping_neg()
    } else {
        magnitude
    };
}

pub(crate) fn unsigned16(bytes: &Uint8Array, offset: usize) -> u16 {
    return u16::from_be_bytes([byte(bytes, offset), byte(bytes, offset + 1)]);
}

pub(crate) fn unsigned32(bytes: &Uint8Array, offset: usize) -> u32 {
    return u32::from_be_bytes([
        byte(bytes, offset),
        byte(bytes, offset + 1),
        byte(bytes, offset + 2),
        byte(bytes, offset + 3),
    ]);
}

pub(crate) fn write16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

pub(crate) fn write32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_be_bytes());
}
