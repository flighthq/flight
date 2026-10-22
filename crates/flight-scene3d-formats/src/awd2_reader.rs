use crate::awd2_schema::*;
use crate::shared::convert_transform_lh_to_rh;
use crate::three_ds_read::{read_three_ds_f32, read_three_ds_u16, read_three_ds_u32};
use flight_encoding::decode_utf8;
use flight_entity::{Float64Array, Uint8Array, throw_range_error};
use flight_geometry::{Matrix4, Transform3D, create_matrix4, decompose_matrix4_to_transform3d};

#[derive(Debug, PartialEq, Eq)]
pub struct Awd2PropertyEntry {
    pub key: u16,
    pub value: Awd2PropertySpan,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Awd2PropertySpan {
    pub length: usize,
    pub offset: usize,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Awd2PropertiesRead {
    pub end: usize,
    pub values: Vec<Awd2PropertyEntry>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Awd2StringRead {
    pub end: usize,
    pub value: String,
}

// flight-lint: allow(f64) AWD readAwdTransform explicitly returns Float64Array; wide wire components remain exact until canonical matrix writes
pub struct Awd2TransformRead {
    pub end: usize,
    pub transform: Box<Float64Array>,
}

pub fn awd_data_type_byte_size(data_type: u8) -> usize {
    return match data_type {
        AWD2_DATA_INT8 | AWD2_DATA_UINT8 => 1,
        AWD2_DATA_INT16 | AWD2_DATA_UINT16 => 2,
        AWD2_DATA_FLOAT64 => 8,
        _ => 4,
    };
}

pub fn awd_transform_to_matrix4(out: &mut Matrix4, transform: &Float64Array) {
    out.m[0] = transform[0] as f32;
    out.m[1] = transform[1] as f32;
    out.m[2] = transform[2] as f32;
    out.m[3] = 0.0;
    out.m[4] = transform[3] as f32;
    out.m[5] = transform[4] as f32;
    out.m[6] = transform[5] as f32;
    out.m[7] = 0.0;
    out.m[8] = transform[6] as f32;
    out.m[9] = transform[7] as f32;
    out.m[10] = transform[8] as f32;
    out.m[11] = 0.0;
    out.m[12] = transform[9] as f32;
    out.m[13] = transform[10] as f32;
    out.m[14] = transform[11] as f32;
    out.m[15] = 1.0;
}

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first structured output, decoded matrix captured before decomposition writes
pub fn awd_transform_to_transform3d(out: &mut Transform3D, transform: &Float64Array) {
    let mut matrix = create_matrix4();
    awd_transform_to_matrix4(&mut matrix, transform);
    decompose_matrix4_to_transform3d(out, &matrix);
    return;
}

pub fn has_non_unit_scale(sx: f32, sy: f32, sz: f32) -> bool {
    return (sx - 1.0).abs() > 1e-4 || (sy - 1.0).abs() > 1e-4 || (sz - 1.0).abs() > 1e-4;
}

pub fn read_awd_data_value(view: &Uint8Array, offset: usize, data_type: u8) -> f32 {
    return match data_type {
        AWD2_DATA_INT8 => read_awd_slice::<1>(view, offset)[0] as i8 as f32,
        AWD2_DATA_INT16 => read_three_ds_u16(view, offset) as i16 as f32,
        AWD2_DATA_INT32 => read_three_ds_u32(view, offset) as i32 as f32,
        AWD2_DATA_UINT8 => read_awd_slice::<1>(view, offset)[0] as f32,
        AWD2_DATA_UINT16 => read_three_ds_u16(view, offset) as f32,
        AWD2_DATA_UINT32 => read_three_ds_u32(view, offset) as f32,
        AWD2_DATA_FLOAT64 => read_awd_f64(view, offset) as f32,
        _ => read_three_ds_f32(view, offset),
    };
}

// flight-lint: allow(f64) DataView.getFloat64 decodes an AWD wire float64; numeric scalar APIs retain canonical f32 and explicit transform arrays retain f64
fn read_awd_f64(view: &Uint8Array, offset: usize) -> f64 {
    return f64::from_le_bytes(read_awd_slice::<8>(view, offset));
}

pub fn read_awd_properties(view: &Uint8Array, mut offset: usize, end: usize) -> Awd2PropertiesRead {
    let mut values: Vec<Awd2PropertyEntry> = Vec::new();
    if offset + 4 > end {
        return Awd2PropertiesRead {
            end: offset,
            values,
        };
    }
    let list_length = read_three_ds_u32(view, offset) as usize;
    offset += 4;
    let list_end = (offset + list_length).min(end);
    while offset + 6 <= list_end {
        let key = read_three_ds_u16(view, offset);
        offset += 2;
        let length = read_three_ds_u32(view, offset) as usize;
        offset += 4;
        if offset + length > list_end {
            break;
        }
        let value = Awd2PropertySpan { length, offset };
        if let Some(entry) = values.iter_mut().find(|entry| entry.key == key) {
            entry.value = value;
        } else {
            values.push(Awd2PropertyEntry { key, value });
        }
        offset += length;
    }
    return Awd2PropertiesRead {
        end: list_end,
        values,
    };
}

pub fn read_awd_property_float32(
    view: &Uint8Array,
    values: &[Awd2PropertyEntry],
    key: u16,
) -> Option<f32> {
    let entry = values.iter().find(|entry| entry.key == key)?;
    if entry.value.length < 4 {
        return None;
    }
    return Some(read_three_ds_f32(view, entry.value.offset));
}

pub fn read_awd_property_number(
    view: &Uint8Array,
    values: &[Awd2PropertyEntry],
    key: u16,
) -> Option<f32> {
    let entry = values.iter().find(|entry| entry.key == key)?;
    if entry.value.length < 4 {
        return None;
    }
    return Some(if entry.value.length >= 8 {
        read_awd_f64(view, entry.value.offset) as f32
    } else {
        read_three_ds_f32(view, entry.value.offset)
    });
}

pub fn read_awd_property_uint32(
    view: &Uint8Array,
    values: &[Awd2PropertyEntry],
    key: u16,
) -> Option<u32> {
    let entry = values.iter().find(|entry| entry.key == key)?;
    if entry.value.length < 4 {
        return None;
    }
    return Some(read_three_ds_u32(view, entry.value.offset));
}

pub fn read_awd_property_uint8(
    view: &Uint8Array,
    values: &[Awd2PropertyEntry],
    key: u16,
) -> Option<u8> {
    let entry = values.iter().find(|entry| entry.key == key)?;
    if entry.value.length < 1 {
        return None;
    }
    return Some(read_awd_slice::<1>(view, entry.value.offset)[0]);
}

fn read_awd_slice<const N: usize>(view: &Uint8Array, offset: usize) -> [u8; N] {
    let end = offset
        .checked_add(N)
        .unwrap_or_else(|| throw_range_error("Offset is outside the bounds of the DataView"));
    return view
        .get(offset..end)
        .unwrap_or_else(|| throw_range_error("Offset is outside the bounds of the DataView"))
        .try_into()
        .unwrap();
}

pub fn read_awd_string(view: &Uint8Array, source: &Uint8Array, offset: usize) -> Awd2StringRead {
    let length = read_three_ds_u16(view, offset) as usize;
    let start = (offset + 2).min(source.len());
    let end = (offset + 2 + length).min(source.len());
    let value = decode_utf8(&source[start..end], None, None);
    return Awd2StringRead {
        end: offset + 2 + length,
        value: value.strip_prefix('\u{feff}').unwrap_or(&value).to_string(),
    };
}

// flight-lint: allow(f64) Source readAwdTransform creates Float64Array(12), reading float32 or float64 at the block-declared wire width before handedness conversion
pub fn read_awd_transform(
    view: &Uint8Array,
    offset: usize,
    wide_precision: bool,
) -> Awd2TransformRead {
    let size = if wide_precision { 8 } else { 4 };
    let mut transform = vec![0.0_f64; 12].into_boxed_slice();
    for i in 0..12 {
        transform[i] = if wide_precision {
            read_awd_f64(view, offset + i * size)
        } else {
            read_three_ds_f32(view, offset + i * size) as f64
        };
    }
    convert_transform_lh_to_rh(&mut transform);
    return Awd2TransformRead {
        end: offset + 12 * size,
        transform,
    };
}

pub fn skip_awd_attr_list(view: &Uint8Array, offset: usize, end: usize) -> usize {
    if offset + 4 > end {
        return offset;
    }
    return offset + 4 + read_three_ds_u32(view, offset) as usize;
}
