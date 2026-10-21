use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flight_buffer::{
    ArrayBufferView, ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    get_array_buffer_storage,
};
use flight_entity::Uint8Array;

use crate::binary::{signed16, unsigned16, unsigned32};
use crate::sfnt_assembly::{
    SfntGlyphBounds, encode_sfnt_composite_glyph, encode_sfnt_loca, encode_sfnt_simple_glyph,
};
use crate::types::Woff2GlyfStreams;
use crate::woff2_font::Woff2TransformReverser;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn woff2glyfstreams_reverse_glyf_transform_matches_the_free_function_on_blank_and_malformed_streams()
     {
        let mut bytes = vec![0; 38];
        bytes[4..6].copy_from_slice(&1u16.to_be_bytes());
        bytes[8..12].copy_from_slice(&2u32.to_be_bytes());
        let view = own_byte_view(bytes.into_boxed_slice());
        let mut streams = read_woff2_glyf_streams(&view).unwrap();
        let method = streams.reverse_glyf_transform().unwrap();
        let free = reverse_woff2_glyf_transform(&streams).unwrap();
        assert_eq!(method.glyf.byte_length, free.glyf.byte_length);
        let a = get_array_buffer_storage(&method.loca.buffer);
        let b = get_array_buffer_storage(&free.loca.buffer);
        assert_eq!(&a.read().unwrap()[..], &b.read().unwrap()[..]);
        assert_eq!(&a.read().unwrap()[..], &[0, 0, 0, 0]);
        streams.n_contour_stream = own_byte_view(Vec::new().into_boxed_slice());
        assert!(streams.reverse_glyf_transform().is_none());
        assert!(reverse_woff2_glyf_transform(&streams).is_none());
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Woff2Triplet {
    pub dx: f32,
    pub dy: f32,
    pub used: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Woff2CompositeGlyphMeasure {
    pub byte_length: usize,
    pub has_instructions: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Woff2Cursor {
    pub at: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Woff2ReversedTables {
    pub glyf: ArrayBufferView,
    pub loca: ArrayBufferView,
}

pub fn create_woff2_transform_reverser() -> Woff2TransformReverser {
    let reversed: Arc<Mutex<Option<Woff2ReversedTables>>> = Arc::new(Mutex::new(None));
    return Arc::new(
        move |tag, transformed, tables: &HashMap<String, ArrayBufferView>| {
            crate::binary::assert_uint8_view(transformed);
            if tag != "glyf" && tag != "loca" {
                return None;
            }
            let mut cached = reversed.lock().unwrap();
            if cached.is_none() {
                let rebuilt = if tag == "glyf" {
                    reverse_woff2_glyf_transform(&read_woff2_glyf_streams(transformed)?)
                } else {
                    reverse_woff2_glyf_transform(&read_woff2_glyf_streams(tables.get("glyf")?)?)
                }?;
                crate::binary::assert_uint8_view(&rebuilt.glyf);
                crate::binary::assert_uint8_view(&rebuilt.loca);
                *cached = Some(rebuilt);
            }
            let cached = cached.as_ref()?;
            crate::binary::assert_uint8_view(&cached.glyf);
            crate::binary::assert_uint8_view(&cached.loca);
            return Some(if tag == "glyf" {
                cached.glyf.clone()
            } else {
                cached.loca.clone()
            });
        },
    );
}

pub fn decode_woff2_triplet(
    code: i32,
    glyph_stream: &Uint8Array,
    at: usize,
) -> Option<Woff2Triplet> {
    let used = if code < 84 {
        1
    } else if code < 120 {
        2
    } else if code < 124 {
        3
    } else {
        4
    };
    if at + used > glyph_stream.len() {
        return None;
    }
    let b0 = i32::from(glyph_stream[at]);
    let b1 = i32::from(*glyph_stream.get(at + 1).unwrap_or(&0));
    let b2 = i32::from(*glyph_stream.get(at + 2).unwrap_or(&0));
    let b3 = i32::from(*glyph_stream.get(at + 3).unwrap_or(&0));
    let sign_x = |group: i32| if group & 1 != 0 { 1 } else { -1 };
    let sign_y = |group: i32| if group & 2 != 0 { 1 } else { -1 };
    if code < 10 {
        return Some(Woff2Triplet {
            dx: 0.0,
            dy: (if code & 1 != 0 { 1 } else { -1 }) as f32 * (((code >> 1) * 256 + b0) as f32),
            used,
        });
    }
    if code < 20 {
        let i = code - 10;
        return Some(Woff2Triplet {
            dx: (if i & 1 != 0 { 1 } else { -1 }) as f32 * (((i >> 1) * 256 + b0) as f32),
            dy: 0.0,
            used,
        });
    }
    if code < 84 {
        let i = code - 20;
        return Some(Woff2Triplet {
            dx: (sign_x(i) * (1 + (i >> 4) * 16 + (b0 >> 4))) as f32,
            dy: (sign_y(i) * (1 + ((i >> 2) & 3) * 16 + (b0 & 15))) as f32,
            used,
        });
    }
    if code < 120 {
        let i = code - 84;
        return Some(Woff2Triplet {
            dx: (sign_x(i) * (1 + (i / 12) * 256 + b0)) as f32,
            dy: (sign_y(i) * (1 + ((i % 12) / 4) * 256 + b1)) as f32,
            used,
        });
    }
    if code < 124 {
        let i = code - 120;
        return Some(Woff2Triplet {
            dx: (sign_x(i) * ((b0 << 4) | (b1 >> 4))) as f32,
            dy: (sign_y(i) * (((b1 & 15) << 8) | b2)) as f32,
            used,
        });
    }
    let i = code - 124;
    return Some(Woff2Triplet {
        dx: (sign_x(i) * ((b0 << 8) | b1)) as f32,
        dy: (sign_y(i) * ((b2 << 8) | b3)) as f32,
        used,
    });
}

pub fn get_woff2_bbox_bitmap_byte_length(glyph_count: usize) -> usize {
    return 4 * ((glyph_count + 31) / 32);
}

pub fn has_woff2_glyph_bbox(bbox_stream: &Uint8Array, glyph_index: i32) -> bool {
    if glyph_index < 0 {
        return false;
    }
    let Some(byte) = bbox_stream.get((glyph_index >> 3) as usize) else {
        return false;
    };
    return byte & (0x80 >> (glyph_index & 7)) != 0;
}

pub fn is_woff2_point_on_curve(flag: i32) -> bool {
    return flag & 0x80 == 0;
}

fn measure_point_bounds(xs: &Vec<f32>, ys: &Vec<f32>) -> SfntGlyphBounds {
    let mut bounds = SfntGlyphBounds {
        x_max: xs.first().copied().unwrap_or(0.0),
        x_min: xs.first().copied().unwrap_or(0.0),
        y_max: ys.first().copied().unwrap_or(0.0),
        y_min: ys.first().copied().unwrap_or(0.0),
    };
    for index in 1..xs.len() {
        if xs[index] < bounds.x_min {
            bounds.x_min = xs[index];
        }
        if xs[index] > bounds.x_max {
            bounds.x_max = xs[index];
        }
        if ys[index] < bounds.y_min {
            bounds.y_min = ys[index];
        }
        if ys[index] > bounds.y_max {
            bounds.y_max = ys[index];
        }
    }
    return bounds;
}

pub fn measure_woff2_composite_glyph(
    composite_stream: &Uint8Array,
    at: usize,
) -> Option<Woff2CompositeGlyphMeasure> {
    let mut cursor = at;
    let mut has_instructions = false;
    let mut more = true;
    while more {
        if cursor + 4 > composite_stream.len() {
            return None;
        }
        let flags = u16::from_be_bytes([composite_stream[cursor], composite_stream[cursor + 1]]);
        cursor += 4;
        cursor += if flags & 1 != 0 { 4 } else { 2 };
        if flags & 8 != 0 {
            cursor += 2;
        } else if flags & 0x40 != 0 {
            cursor += 4;
        } else if flags & 0x80 != 0 {
            cursor += 8;
        }
        if flags & 0x100 != 0 {
            has_instructions = true;
        }
        more = flags & 0x20 != 0;
    }
    if cursor > composite_stream.len() {
        return None;
    }
    return Some(Woff2CompositeGlyphMeasure {
        byte_length: cursor - at,
        has_instructions,
    });
}

fn own_byte_view(bytes: Box<Uint8Array>) -> ArrayBufferView {
    let length = bytes.len();
    let buffer = create_array_buffer_from_bytes(bytes);
    return create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array).unwrap();
}

fn pad_to_even(record: Box<Uint8Array>) -> Box<Uint8Array> {
    if record.len() % 2 == 0 {
        return record;
    }
    let mut bytes = record.into_vec();
    bytes.push(0);
    return bytes.into_boxed_slice();
}

pub fn read_woff2_glyf_streams(transformed: &ArrayBufferView) -> Option<Woff2GlyfStreams> {
    crate::binary::assert_uint8_view(transformed);
    if transformed.byte_length < 36 {
        return None;
    }
    let storage = get_array_buffer_storage(&transformed.buffer);
    let storage = storage.read().unwrap();
    let bytes =
        &storage[transformed.byte_offset..transformed.byte_offset + transformed.byte_length];
    let glyph_count = usize::from(unsigned16(bytes, 4));
    let index_format = i32::from(unsigned16(bytes, 6));
    let mut sizes = Vec::new();
    for index in 0..7 {
        sizes.push(unsigned32(bytes, 8 + index * 4) as usize);
    }
    let mut total = 36;
    for size in &sizes {
        total += size;
    }
    if total != transformed.byte_length {
        return None;
    }
    let mut at = 36;
    let mut slice = |size: usize| {
        let part = create_array_buffer_view(
            &transformed.buffer,
            transformed.byte_offset + at,
            size,
            ArrayBufferViewKind::Uint8Array,
        )
        .unwrap();
        at += size;
        return part;
    };
    let n_contour_stream = slice(sizes[0]);
    let n_points_stream = slice(sizes[1]);
    let flag_stream = slice(sizes[2]);
    let glyph_stream = slice(sizes[3]);
    let composite_stream = slice(sizes[4]);
    let bbox_stream = slice(sizes[5]);
    let instruction_stream = slice(sizes[6]);
    return Some(Woff2GlyfStreams {
        bbox_stream,
        composite_stream,
        flag_stream,
        glyph_count,
        glyph_stream,
        index_format,
        instruction_stream,
        n_contour_stream,
        n_points_stream,
    });
}

pub fn read_woff2_short(bytes: &Uint8Array, cursor: &mut Woff2Cursor, end: usize) -> i32 {
    if cursor.at >= end {
        return -1;
    }
    let code = bytes.get(cursor.at).copied().unwrap_or(0);
    cursor.at += 1;
    if code == 253 {
        if cursor.at + 2 > end {
            return -1;
        }
        let value = (i32::from(*bytes.get(cursor.at).unwrap_or(&0)) << 8)
            | i32::from(*bytes.get(cursor.at + 1).unwrap_or(&0));
        cursor.at += 2;
        return value;
    }
    if code == 254 || code == 255 {
        if cursor.at >= end {
            return -1;
        }
        let value =
            i32::from(*bytes.get(cursor.at).unwrap_or(&0)) + if code == 254 { 506 } else { 253 };
        cursor.at += 1;
        return value;
    }
    return i32::from(code);
}

pub fn reverse_woff2_glyf_transform(streams: &Woff2GlyfStreams) -> Option<Woff2ReversedTables> {
    for stream in [
        &streams.n_contour_stream,
        &streams.n_points_stream,
        &streams.flag_stream,
        &streams.glyph_stream,
        &streams.composite_stream,
        &streams.bbox_stream,
        &streams.instruction_stream,
    ] {
        crate::binary::assert_uint8_view(stream);
    }
    if streams.n_contour_stream.byte_length < streams.glyph_count * 2 {
        return None;
    }
    let contour_storage = get_array_buffer_storage(&streams.n_contour_stream.buffer);
    let contour_guard = contour_storage.read().unwrap();
    let contours_bytes = &contour_guard[streams.n_contour_stream.byte_offset
        ..streams.n_contour_stream.byte_offset + streams.n_contour_stream.byte_length];
    let points_storage = get_array_buffer_storage(&streams.n_points_stream.buffer);
    let points_guard = points_storage.read().unwrap();
    let points_bytes = &points_guard[streams.n_points_stream.byte_offset
        ..streams.n_points_stream.byte_offset + streams.n_points_stream.byte_length];
    let flags_storage = get_array_buffer_storage(&streams.flag_stream.buffer);
    let flags_guard = flags_storage.read().unwrap();
    let flag_bytes = &flags_guard[streams.flag_stream.byte_offset
        ..streams.flag_stream.byte_offset + streams.flag_stream.byte_length];
    let glyph_storage = get_array_buffer_storage(&streams.glyph_stream.buffer);
    let glyph_guard = glyph_storage.read().unwrap();
    let glyph_bytes = &glyph_guard[streams.glyph_stream.byte_offset
        ..streams.glyph_stream.byte_offset + streams.glyph_stream.byte_length];
    let composite_storage = get_array_buffer_storage(&streams.composite_stream.buffer);
    let composite_guard = composite_storage.read().unwrap();
    let composite_bytes = &composite_guard[streams.composite_stream.byte_offset
        ..streams.composite_stream.byte_offset + streams.composite_stream.byte_length];
    let bbox_storage = get_array_buffer_storage(&streams.bbox_stream.buffer);
    let bbox_guard = bbox_storage.read().unwrap();
    let bbox_bytes = &bbox_guard[streams.bbox_stream.byte_offset
        ..streams.bbox_stream.byte_offset + streams.bbox_stream.byte_length];
    let instruction_storage = get_array_buffer_storage(&streams.instruction_stream.buffer);
    let instruction_guard = instruction_storage.read().unwrap();
    let instruction_bytes = &instruction_guard[streams.instruction_stream.byte_offset
        ..streams.instruction_stream.byte_offset + streams.instruction_stream.byte_length];
    let mut points = Woff2Cursor { at: 0 };
    let mut glyph = Woff2Cursor { at: 0 };
    let mut composite_at = 0;
    let mut flag_at = 0;
    let mut instruction_at = 0;
    let mut bbox_at = get_woff2_bbox_bitmap_byte_length(streams.glyph_count);
    let mut records = Vec::new();
    for index in 0..streams.glyph_count {
        let contours = signed16(contours_bytes, index * 2);
        let stored = if has_woff2_glyph_bbox(bbox_bytes, index as i32) {
            if bbox_at + 8 > bbox_bytes.len() {
                return None;
            }
            let bounds = SfntGlyphBounds {
                x_max: f32::from(signed16(bbox_bytes, bbox_at + 4)),
                x_min: f32::from(signed16(bbox_bytes, bbox_at)),
                y_max: f32::from(signed16(bbox_bytes, bbox_at + 6)),
                y_min: f32::from(signed16(bbox_bytes, bbox_at + 2)),
            };
            bbox_at += 8;
            Some(bounds)
        } else {
            None
        };
        if contours == 0 {
            records.push(Vec::new().into_boxed_slice());
            continue;
        }
        if contours < 0 {
            let measured = measure_woff2_composite_glyph(composite_bytes, composite_at)?;
            let stored = stored?;
            let components = &composite_bytes[composite_at..composite_at + measured.byte_length];
            composite_at += measured.byte_length;
            let mut instructions: &[u8] = &[];
            if measured.has_instructions {
                let length = read_woff2_short(glyph_bytes, &mut glyph, glyph_bytes.len());
                if length < 0 || instruction_at + length as usize > instruction_bytes.len() {
                    return None;
                }
                instructions = &instruction_bytes[instruction_at..instruction_at + length as usize];
                instruction_at += length as usize;
            }
            records.push(pad_to_even(encode_sfnt_composite_glyph(
                components,
                instructions,
                &stored,
                measured.has_instructions,
            )));
            continue;
        }
        let mut end_pts_of_contours = Vec::new();
        let mut point_count = 0;
        for _ in 0..contours {
            let count = read_woff2_short(points_bytes, &mut points, points_bytes.len());
            if count < 0 {
                return None;
            }
            point_count += count as usize;
            end_pts_of_contours.push(point_count as f32 - 1.0);
        }
        if flag_at + point_count > flag_bytes.len() {
            return None;
        }
        let mut xs = Vec::new();
        let mut ys = Vec::new();
        let mut on_curve = Vec::new();
        let mut x = 0.0;
        let mut y = 0.0;
        for point in 0..point_count {
            let flag = flag_bytes[flag_at + point];
            let delta = decode_woff2_triplet(i32::from(flag & 0x7f), glyph_bytes, glyph.at)?;
            glyph.at += delta.used;
            x += delta.dx;
            y += delta.dy;
            xs.push(x);
            ys.push(y);
            on_curve.push(is_woff2_point_on_curve(i32::from(flag)));
        }
        flag_at += point_count;
        let instruction_length = read_woff2_short(glyph_bytes, &mut glyph, glyph_bytes.len());
        if instruction_length < 0
            || instruction_at + instruction_length as usize > instruction_bytes.len()
        {
            return None;
        }
        let instructions =
            &instruction_bytes[instruction_at..instruction_at + instruction_length as usize];
        instruction_at += instruction_length as usize;
        let bounds = stored.unwrap_or_else(|| measure_point_bounds(&xs, &ys));
        records.push(pad_to_even(encode_sfnt_simple_glyph(
            &end_pts_of_contours,
            &xs,
            &ys,
            &on_curve,
            instructions,
            &bounds,
        )));
    }
    let lengths = records
        .iter()
        .map(|record| record.len() as f32)
        .collect::<Vec<_>>();
    let loca = encode_sfnt_loca(&lengths, streams.index_format)?;
    let mut glyf = Vec::new();
    for record in records {
        glyf.extend_from_slice(&record);
    }
    return Some(Woff2ReversedTables {
        glyf: own_byte_view(glyf.into_boxed_slice()),
        loca: own_byte_view(loca),
    });
}

impl Woff2GlyfStreams {
    pub fn reverse_glyf_transform(&self) -> Option<Woff2ReversedTables> {
        return reverse_woff2_glyf_transform(self);
    }
}
