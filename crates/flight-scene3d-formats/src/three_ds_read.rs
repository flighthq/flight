use flight_entity::{Uint8Array, throw_range_error};

pub(crate) fn read_three_ds_f32(view: &Uint8Array, offset: usize) -> f32 {
    return f32::from_le_bytes(read_three_ds_slice::<4>(view, offset));
}

fn read_three_ds_slice<const N: usize>(view: &Uint8Array, offset: usize) -> [u8; N] {
    let end = offset
        .checked_add(N)
        .unwrap_or_else(|| throw_range_error("Offset is outside the bounds of the DataView"));
    return view
        .get(offset..end)
        .unwrap_or_else(|| throw_range_error("Offset is outside the bounds of the DataView"))
        .try_into()
        .unwrap();
}

pub(crate) fn read_three_ds_u16(view: &Uint8Array, offset: usize) -> u16 {
    return u16::from_le_bytes(read_three_ds_slice::<2>(view, offset));
}

pub(crate) fn read_three_ds_u32(view: &Uint8Array, offset: usize) -> u32 {
    return u32::from_le_bytes(read_three_ds_slice::<4>(view, offset));
}
