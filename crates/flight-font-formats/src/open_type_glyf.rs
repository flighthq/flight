use flight_entity::{Int32Array, Uint8Array, Uint32Array};
use flight_path::{Path, PathCommand, PathWinding};

use crate::binary::{byte, signed16, unsigned16, unsigned32};
use crate::types::SfntTableDirectory;

struct GlyfFlags {
    cursor: usize,
    flags: Box<Uint8Array>,
}
struct GlyfCoordinates {
    cursor: usize,
    values: Box<Int32Array>,
}

// flight-lint: allow(f64) contour coordinates and midpoint arithmetic preserve the canonical Path.data f64 precision
fn append_glyf_contour(
    out: &mut Path,
    flags: &Uint8Array,
    xs: &Int32Array,
    ys: &Int32Array,
    first: usize,
    last: usize,
) {
    if last < first {
        return;
    }
    let count = last - first + 1;
    let on_curve = |index: usize| flags[first + index % count] & 1 != 0;
    let point_x = |index: usize| f64::from(xs[first + index % count]);
    let point_y = |index: usize| -f64::from(ys[first + index % count]);
    let start_x;
    let start_y;
    let start_index;
    let step_count;
    if on_curve(0) {
        start_x = point_x(0);
        start_y = point_y(0);
        start_index = 1;
        step_count = count - 1;
    } else if on_curve(count - 1) {
        start_x = point_x(count - 1);
        start_y = point_y(count - 1);
        start_index = 0;
        step_count = count - 1;
    } else {
        start_x = (point_x(0) + point_x(count - 1)) / 2.0;
        start_y = (point_y(0) + point_y(count - 1)) / 2.0;
        start_index = 0;
        step_count = count;
    }
    out.commands.push(PathCommand::MoveTo as u8);
    out.data.extend_from_slice(&[start_x, start_y]);
    let mut control_x = 0.0;
    let mut control_y = 0.0;
    let mut has_control = false;
    for step in 0..step_count {
        let index = start_index + step;
        let x = point_x(index);
        let y = point_y(index);
        if on_curve(index) {
            if has_control {
                out.commands.push(PathCommand::QuadraticCurveTo as u8);
                out.data.extend_from_slice(&[control_x, control_y, x, y]);
                has_control = false;
            } else {
                out.commands.push(PathCommand::LineTo as u8);
                out.data.extend_from_slice(&[x, y]);
            }
            continue;
        }
        if has_control {
            out.commands.push(PathCommand::QuadraticCurveTo as u8);
            out.data.extend_from_slice(&[
                control_x,
                control_y,
                (control_x + x) / 2.0,
                (control_y + y) / 2.0,
            ]);
        }
        control_x = x;
        control_y = y;
        has_control = true;
    }
    if has_control {
        out.commands.push(PathCommand::QuadraticCurveTo as u8);
        out.data
            .extend_from_slice(&[control_x, control_y, start_x, start_y]);
    }
    out.commands.push(PathCommand::Close as u8);
}

fn read_glyf_coordinates(
    bytes: &Uint8Array,
    start: usize,
    flags: &Uint8Array,
    short_bit: u8,
    same_or_positive_bit: u8,
    byte_length: usize,
) -> Option<GlyfCoordinates> {
    let mut values = vec![0; flags.len()];
    let mut cursor = start;
    let mut value = 0;
    for point in 0..flags.len() {
        let flag = flags[point];
        if flag & short_bit != 0 {
            if cursor >= byte_length {
                return None;
            }
            let magnitude = i32::from(byte(bytes, cursor));
            cursor += 1;
            value += if flag & same_or_positive_bit != 0 {
                magnitude
            } else {
                -magnitude
            };
        } else if flag & same_or_positive_bit == 0 {
            if cursor + 2 > byte_length {
                return None;
            }
            value += i32::from(signed16(bytes, cursor));
            cursor += 2;
        }
        values[point] = value;
    }
    return Some(GlyfCoordinates {
        cursor,
        values: values.into_boxed_slice(),
    });
}

fn read_glyf_flags(
    bytes: &Uint8Array,
    start: usize,
    point_count: usize,
    byte_length: usize,
) -> Option<GlyfFlags> {
    let mut flags = vec![0; point_count];
    let mut cursor = start;
    let mut point = 0;
    while point < point_count {
        if cursor >= byte_length {
            return None;
        }
        let flag = byte(bytes, cursor);
        cursor += 1;
        flags[point] = flag;
        point += 1;
        if flag & 8 == 0 {
            continue;
        }
        if cursor >= byte_length {
            return None;
        }
        let mut repeats = byte(bytes, cursor);
        cursor += 1;
        while repeats > 0 && point < point_count {
            flags[point] = flag;
            point += 1;
            repeats -= 1;
        }
    }
    return Some(GlyfFlags {
        cursor,
        flags: flags.into_boxed_slice(),
    });
}

pub fn read_open_type_glyph_outline(
    out: &mut Path,
    bytes: &Uint8Array,
    directory: &SfntTableDirectory,
    ranges: &Uint32Array,
    glyph_index: i32,
) -> bool {
    let Some(glyf) = directory.tables.get("glyf") else {
        return false;
    };
    if glyph_index < 0 || glyph_index as usize + 1 >= ranges.len() {
        return false;
    }
    out.commands.clear();
    out.data.clear();
    out.winding = PathWinding::NonZero;
    let start = glyf.offset + ranges[glyph_index as usize] as usize;
    let end = glyf.offset + ranges[glyph_index as usize + 1] as usize;
    if end <= start {
        return true;
    }
    if end > bytes.len() || start + 10 > bytes.len() {
        return false;
    }
    let contour_count = signed16(bytes, start);
    if contour_count <= 0 {
        return true;
    }
    let contour_count = contour_count as usize;
    let mut end_points = vec![0u16; contour_count];
    let mut cursor = start + 10;
    if cursor + contour_count * 2 + 2 > bytes.len() {
        return false;
    }
    for contour in 0..contour_count {
        end_points[contour] = unsigned16(bytes, cursor);
        cursor += 2;
    }
    let point_count = usize::from(end_points[contour_count - 1]) + 1;
    cursor += 2 + usize::from(unsigned16(bytes, cursor));
    let Some(flags) = read_glyf_flags(bytes, cursor, point_count, bytes.len()) else {
        return false;
    };
    let Some(xs) = read_glyf_coordinates(bytes, flags.cursor, &flags.flags, 2, 0x10, bytes.len())
    else {
        return false;
    };
    let Some(ys) = read_glyf_coordinates(bytes, xs.cursor, &flags.flags, 4, 0x20, bytes.len())
    else {
        return false;
    };
    let mut first = 0;
    for contour in 0..contour_count {
        let last = usize::from(end_points[contour]);
        if last >= point_count {
            return false;
        }
        append_glyf_contour(out, &flags.flags, &xs.values, &ys.values, first, last);
        first = last + 1;
    }
    return true;
}

pub fn read_open_type_glyph_ranges(
    bytes: &Uint8Array,
    directory: &SfntTableDirectory,
    glyph_count: usize,
    loca_format: i32,
) -> Option<Box<Uint32Array>> {
    let loca = directory.tables.get("loca")?;
    let entry_count = glyph_count + 1;
    let entry_bytes = if loca_format == 0 { 2 } else { 4 };
    if entry_count * entry_bytes > loca.length {
        return None;
    }
    let mut offsets = vec![0; entry_count];
    for index in 0..entry_count {
        offsets[index] = if loca_format == 0 {
            u32::from(unsigned16(bytes, loca.offset + index * 2)) * 2
        } else {
            unsigned32(bytes, loca.offset + index * 4)
        };
    }
    return Some(offsets.into_boxed_slice());
}
