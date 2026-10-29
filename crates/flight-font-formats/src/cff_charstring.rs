use flight_entity::Uint8Array;
use flight_path::{Path, PathCommand, PathWinding};

use crate::binary::{byte, signed16, signed32};
use crate::types::CffIndexEntry;

// flight-lint: allow(f64) Type2 operands and relative coordinates preserve canonical Path.data precision, including exact 16.16 operands
struct CffExecution {
    open: bool,
    stem_count: usize,
    width_parsed: bool,
    x: f64,
    y: f64,
    stack: Vec<f64>,
}

// flight-lint: allow(f64) parsed Type2 operands are exact 16.16 values consumed by canonical f64 Path coordinates
struct CffCharstringOperand {
    cursor: usize,
    value: f64,
}

pub fn cff_subroutine_bias(count: usize) -> usize {
    if count < 1240 {
        return 107;
    }
    if count < 33900 {
        return 1131;
    }
    return 32768;
}

fn emit_relative_curve(out: &mut Path, state: &mut CffExecution, index: usize) {
    let x1 = state.x + stack_operand(state, index);
    let y1 = state.y + stack_operand(state, index + 1);
    let x2 = x1 + stack_operand(state, index + 2);
    let y2 = y1 + stack_operand(state, index + 3);
    state.x = x2 + stack_operand(state, index + 4);
    state.y = y2 + stack_operand(state, index + 5);
    out.commands.push(PathCommand::CUBIC_CURVE_TO as u8);
    out.data
        .extend_from_slice(&[x1, -y1, x2, -y2, state.x, -state.y]);
}

// flight-lint: allow(f64) recursion executes Type2 relative coordinate arithmetic directly in canonical Path precision
fn execute_charstring(
    out: &mut Path,
    state: &mut CffExecution,
    bytes: &Uint8Array,
    start: usize,
    end: usize,
    depth: usize,
    local_subrs: &[CffIndexEntry],
    global_subrs: &[CffIndexEntry],
) -> bool {
    if depth > 10 {
        return false;
    }
    let mut cursor = start;
    while cursor < end {
        let b0 = byte(bytes, cursor);
        cursor += 1;
        if b0 >= 32 || b0 == 28 {
            let Some(operand) = read_cff_charstring_operand(bytes, b0, cursor, end) else {
                return false;
            };
            state.stack.push(operand.value);
            cursor = operand.cursor;
            continue;
        }
        match b0 {
            1 | 3 | 18 | 23 => {
                take_width_by_parity(state, 2);
                state.stem_count += state.stack.len() >> 1;
                state.stack.clear();
            }
            19 | 20 => {
                take_width_by_parity(state, 2);
                state.stem_count += state.stack.len() >> 1;
                state.stack.clear();
                cursor += (state.stem_count + 7) >> 3;
                if cursor > end {
                    return false;
                }
            }
            21 | 22 | 4 => {
                take_width(state, if b0 == 21 { 2 } else { 1 });
                if b0 == 21 || b0 == 22 {
                    state.x += state.stack.first().copied().unwrap_or(0.0);
                }
                if b0 == 21 {
                    state.y += state.stack.get(1).copied().unwrap_or(0.0);
                } else if b0 == 4 {
                    state.y += state.stack.first().copied().unwrap_or(0.0);
                }
                if state.open {
                    out.commands.push(PathCommand::CLOSE as u8);
                }
                out.commands.push(PathCommand::MOVE_TO as u8);
                out.data.extend_from_slice(&[state.x, -state.y]);
                state.open = true;
                state.stack.clear();
            }
            5 => {
                let mut index = 0;
                while index + 1 < state.stack.len() {
                    state.x += state.stack[index];
                    state.y += state.stack[index + 1];
                    out.commands.push(PathCommand::LINE_TO as u8);
                    out.data.extend_from_slice(&[state.x, -state.y]);
                    index += 2;
                }
                state.stack.clear();
            }
            6 | 7 => {
                let mut horizontal = b0 == 6;
                for delta in &state.stack {
                    if horizontal {
                        state.x += delta;
                    } else {
                        state.y += delta;
                    }
                    out.commands.push(PathCommand::LINE_TO as u8);
                    out.data.extend_from_slice(&[state.x, -state.y]);
                    horizontal = !horizontal;
                }
                state.stack.clear();
            }
            8 => {
                let mut index = 0;
                while index + 5 < state.stack.len() {
                    emit_relative_curve(out, state, index);
                    index += 6;
                }
                state.stack.clear();
            }
            24 => {
                let mut index = 0;
                while index + 5 < state.stack.len().saturating_sub(2) {
                    emit_relative_curve(out, state, index);
                    index += 6;
                }
                state.x += state.stack.get(index).copied().unwrap_or(0.0);
                state.y += state.stack.get(index + 1).copied().unwrap_or(0.0);
                out.commands.push(PathCommand::LINE_TO as u8);
                out.data.extend_from_slice(&[state.x, -state.y]);
                state.stack.clear();
            }
            25 => {
                let mut index = 0;
                while index + 1 < state.stack.len().saturating_sub(6) {
                    state.x += state.stack[index];
                    state.y += state.stack[index + 1];
                    out.commands.push(PathCommand::LINE_TO as u8);
                    out.data.extend_from_slice(&[state.x, -state.y]);
                    index += 2;
                }
                emit_relative_curve(out, state, index);
                state.stack.clear();
            }
            26 | 27 => {
                let vertical = b0 == 26;
                let mut index = 0;
                let mut lead = 0.0;
                if state.stack.len() % 4 == 1 {
                    lead = state.stack[0];
                    index = 1;
                }
                while index + 3 < state.stack.len() {
                    let x1 = state.x + if vertical { lead } else { state.stack[index] };
                    let y1 = state.y + if vertical { state.stack[index] } else { lead };
                    let x2 = x1 + state.stack[index + 1];
                    let y2 = y1 + state.stack[index + 2];
                    state.x = x2
                        + if vertical {
                            0.0
                        } else {
                            state.stack[index + 3]
                        };
                    state.y = y2
                        + if vertical {
                            state.stack[index + 3]
                        } else {
                            0.0
                        };
                    out.commands.push(PathCommand::CUBIC_CURVE_TO as u8);
                    out.data
                        .extend_from_slice(&[x1, -y1, x2, -y2, state.x, -state.y]);
                    lead = 0.0;
                    index += 4;
                }
                state.stack.clear();
            }
            30 | 31 => {
                let mut horizontal = b0 == 31;
                let mut index = 0;
                while index + 3 < state.stack.len() {
                    let last = index + 8 > state.stack.len();
                    let extra = if last && state.stack.len() - index == 5 {
                        state.stack[index + 4]
                    } else {
                        0.0
                    };
                    let x1 = state.x + if horizontal { state.stack[index] } else { 0.0 };
                    let y1 = state.y + if horizontal { 0.0 } else { state.stack[index] };
                    let x2 = x1 + state.stack[index + 1];
                    let y2 = y1 + state.stack[index + 2];
                    if horizontal {
                        state.y = y2 + state.stack[index + 3];
                        state.x = x2 + extra;
                    } else {
                        state.x = x2 + state.stack[index + 3];
                        state.y = y2 + extra;
                    }
                    out.commands.push(PathCommand::CUBIC_CURVE_TO as u8);
                    out.data
                        .extend_from_slice(&[x1, -y1, x2, -y2, state.x, -state.y]);
                    horizontal = !horizontal;
                    index += 4;
                }
                state.stack.clear();
            }
            10 | 29 => {
                let subrs = if b0 == 10 { local_subrs } else { global_subrs };
                let index =
                    state.stack.pop().unwrap_or(0.0) + cff_subroutine_bias(subrs.len()) as f64;
                if !index.is_finite() || index < 0.0 || index.fract() != 0.0 {
                    return false;
                }
                let Some(subr) = subrs.get(index as usize) else {
                    return false;
                };
                if !execute_charstring(
                    out,
                    state,
                    bytes,
                    subr.start,
                    subr.end,
                    depth + 1,
                    local_subrs,
                    global_subrs,
                ) {
                    return false;
                }
            }
            11 => return true,
            14 => {
                take_width(state, 0);
                if state.open {
                    out.commands.push(PathCommand::CLOSE as u8);
                }
                state.open = false;
                return true;
            }
            12 => {
                if cursor >= end {
                    return false;
                }
                cursor += 1;
                state.stack.clear();
            }
            _ => return false,
        }
    }
    return true;
}

// flight-lint: allow(f64) Type2 signed 16.16 operands are read losslessly before canonical Path coordinate arithmetic
fn read_cff_charstring_operand(
    bytes: &Uint8Array,
    b0: u8,
    cursor: usize,
    end: usize,
) -> Option<CffCharstringOperand> {
    if b0 == 28 {
        if cursor + 2 > end {
            return None;
        }
        return Some(CffCharstringOperand {
            cursor: cursor + 2,
            value: f64::from(signed16(bytes, cursor)),
        });
    }
    if b0 <= 246 {
        return Some(CffCharstringOperand {
            cursor,
            value: f64::from(b0) - 139.0,
        });
    }
    if b0 <= 250 {
        if cursor + 1 > end {
            return None;
        }
        return Some(CffCharstringOperand {
            cursor: cursor + 1,
            value: f64::from(b0 - 247) * 256.0 + f64::from(byte(bytes, cursor)) + 108.0,
        });
    }
    if b0 <= 254 {
        if cursor + 1 > end {
            return None;
        }
        return Some(CffCharstringOperand {
            cursor: cursor + 1,
            value: -f64::from(b0 - 251) * 256.0 - f64::from(byte(bytes, cursor)) - 108.0,
        });
    }
    if cursor + 4 > end {
        return None;
    }
    return Some(CffCharstringOperand {
        cursor: cursor + 4,
        value: f64::from(signed32(bytes, cursor)) / 65536.0,
    });
}

pub fn run_cff_charstring(
    out: &mut Path,
    bytes: &Uint8Array,
    charstring: &CffIndexEntry,
    local_subrs: &[CffIndexEntry],
    global_subrs: &[CffIndexEntry],
) -> bool {
    out.commands.clear();
    out.data.clear();
    out.winding = PathWinding::NonZero;
    let mut state = CffExecution {
        open: false,
        stem_count: 0,
        width_parsed: false,
        x: 0.0,
        y: 0.0,
        stack: Vec::new(),
    };
    if !execute_charstring(
        out,
        &mut state,
        bytes,
        charstring.start,
        charstring.end,
        0,
        local_subrs,
        global_subrs,
    ) {
        return false;
    }
    if state.open {
        out.commands.push(PathCommand::CLOSE as u8);
    }
    return true;
}

// flight-lint: allow(f64) missing Type2 operands retain JS undefined-to-NaN arithmetic in canonical Path coordinates
fn stack_operand(state: &CffExecution, index: usize) -> f64 {
    return state.stack.get(index).copied().unwrap_or(f64::NAN);
}

fn take_width(state: &mut CffExecution, expected: usize) {
    if !state.width_parsed {
        state.width_parsed = true;
        if state.stack.len() > expected {
            state.stack.remove(0);
        }
    }
}

fn take_width_by_parity(state: &mut CffExecution, multiple: usize) {
    if !state.width_parsed {
        state.width_parsed = true;
        if state.stack.len() % multiple != 0 {
            state.stack.remove(0);
        }
    }
}
