use std::collections::HashMap;

use flight_entity::Uint8Array;

use crate::binary::{byte, signed16, signed32};

struct CffRealOperand {
    cursor: usize,
    value: f32,
}

pub const CFF_OPERATOR_CHARSTRINGS: usize = 17;
pub const CFF_OPERATOR_PRIVATE: usize = 18;
pub const CFF_OPERATOR_SUBRS: usize = 19;
pub const CFF_OPERATOR_ROS: usize = 1230;
pub const CFF_OPERATOR_FD_ARRAY: usize = 1236;
pub const CFF_OPERATOR_FD_SELECT: usize = 1237;

pub fn read_cff_dict(
    bytes: &Uint8Array,
    start: usize,
    end: usize,
) -> Option<HashMap<usize, Vec<f32>>> {
    let mut dict = HashMap::new();
    let mut operands = Vec::new();
    let mut cursor = start;
    while cursor < end {
        let b0 = byte(bytes, cursor);
        if b0 <= 21 {
            cursor += 1;
            let mut key = usize::from(b0);
            if b0 == 12 {
                if cursor >= end {
                    return None;
                }
                key = 1200 + usize::from(byte(bytes, cursor));
                cursor += 1;
            }
            dict.insert(key, std::mem::take(&mut operands));
            continue;
        }
        if b0 == 28 {
            if cursor + 3 > end {
                return None;
            }
            operands.push(f32::from(signed16(bytes, cursor + 1)));
            cursor += 3;
        } else if b0 == 29 {
            if cursor + 5 > end {
                return None;
            }
            operands.push(signed32(bytes, cursor + 1) as f32);
            cursor += 5;
        } else if b0 == 30 {
            let real = read_cff_real_operand(bytes, cursor + 1, end)?;
            operands.push(real.value);
            cursor = real.cursor;
        } else if b0 >= 32 && b0 <= 246 {
            operands.push(f32::from(b0) - 139.0);
            cursor += 1;
        } else if b0 >= 247 && b0 <= 250 {
            if cursor + 2 > end {
                return None;
            }
            operands.push(f32::from(b0 - 247) * 256.0 + f32::from(byte(bytes, cursor + 1)) + 108.0);
            cursor += 2;
        } else if b0 >= 251 && b0 <= 254 {
            if cursor + 2 > end {
                return None;
            }
            operands
                .push(-f32::from(b0 - 251) * 256.0 - f32::from(byte(bytes, cursor + 1)) - 108.0);
            cursor += 2;
        } else {
            return None;
        }
    }
    return Some(dict);
}

fn read_cff_real_operand(bytes: &Uint8Array, start: usize, end: usize) -> Option<CffRealOperand> {
    let mut text = String::new();
    let mut cursor = start;
    loop {
        if cursor >= end {
            return None;
        }
        let value = byte(bytes, cursor);
        cursor += 1;
        for nibble in [value >> 4, value & 0x0f] {
            match nibble {
                0..=9 => text.push(char::from(b'0' + nibble)),
                10 => text.push('.'),
                11 => text.push('E'),
                12 => text.push_str("E-"),
                14 => text.push('-'),
                15 => {
                    let value = if text.is_empty() {
                        0.0
                    } else {
                        text.parse::<f32>().ok()?
                    };
                    return if value.is_finite() {
                        Some(CffRealOperand { cursor, value })
                    } else {
                        None
                    };
                }
                _ => {}
            }
        }
    }
}
